import type { RequestIdentity } from "@/lib/auth";
import { getAnalysis } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { assertResult } from "@/lib/validation";
import { generateLlm, loadPrompt, type LlmPurpose, type LlmResult } from "@/lib/llm";
import { createSourceGroundedFallback, normalizeQuizCandidates, type QuizCandidate } from "@/lib/quiz";

export type ChunkRow = { id: string; input_id: string; chunk_index: number; title: string | null; content: string; status: string; retry_count: number; generated_content?: unknown };
type PromptRow = { id: string; system_prompt: string; user_prompt_template: string; output_schema: unknown; model_config: Record<string, unknown> };

function renderPrompt(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => values[key] ?? "");
}

async function saveExchange(args: {
  analysisId: string; chunkId?: string | null; promptId?: string | null; purpose: string;
  result?: LlmResult; attempt: number; requestPayload: unknown; error?: unknown;
}) {
  const db = getAdminDb();
  const result = args.result;
  const { error } = await db.from("llm_exchanges").insert({
    analysis_id: args.analysisId,
    chunk_id: args.chunkId ?? null,
    prompt_template_id: args.promptId ?? null,
    purpose: args.purpose,
    provider: result?.provider ?? process.env.LLM_PROVIDER ?? "mock",
    model: result?.model ?? process.env.GEMINI_MODEL ?? "documind-deterministic",
    attempt: args.attempt,
    request_payload: args.requestPayload,
    response_payload: result?.value ?? null,
    input_tokens: result?.inputTokens ?? null,
    output_tokens: result?.outputTokens ?? null,
    latency_ms: result?.latencyMs ?? null,
    status: args.error ? "failed" : "succeeded",
    error_message: args.error instanceof Error ? args.error.message : args.error ? String(args.error) : null,
  });
  if (error) console.error("Unable to persist LLM exchange", error.message);
}

async function invokeAndLog(analysisId: string, chunkId: string | null, purpose: LlmPurpose, prompt: PromptRow, userPrompt: string, attempt: number) {
  const request = { purpose, system: prompt.system_prompt, prompt: userPrompt, schema: prompt.output_schema };
  try {
    const result = await generateLlm(request);
    await saveExchange({ analysisId, chunkId, promptId: prompt.id, purpose, result, attempt, requestPayload: { system: request.system, prompt: userPrompt, schema: request.schema } });
    return result;
  } catch (error) {
    await saveExchange({ analysisId, chunkId, promptId: prompt.id, purpose, attempt, requestPayload: { prompt: userPrompt }, error });
    throw error;
  }
}

function flattenSections(parts: Array<{ chunk: ChunkRow; value: ReturnType<typeof assertResult> }>) {
  const sections: Array<{ title: string; summary?: string; blocks: Array<{ type: string; content: unknown; metadata?: Record<string, unknown> }> }> = [];
  const byTitle = new Map<string, (typeof sections)[number]>();
  for (const { chunk, value } of parts) {
    for (const section of value.sections) {
      const title = section.title.trim() || chunk.title || `Phần ${sections.length + 1}`;
      const key = title.toLocaleLowerCase();
      let target = byTitle.get(key);
      if (!target) {
        target = { title, summary: section.summary, blocks: [] };
        byTitle.set(key, target);
        sections.push(target);
      }
      target.blocks.push(...section.blocks);
    }
  }
  return sections;
}

async function resolveITSpecialization(analysis: Record<string, unknown>, sourceText: string) {
  const db = getAdminDb();
  const { data: itTopic, error: topicError } = await db.from("topics").select("id").eq("code", "IT").eq("is_active", true).maybeSingle();
  if (topicError) throw new ApiError(500, "DATABASE_ERROR", "Không tải được danh mục chủ đề.", topicError.message);
  const topicId = itTopic?.id as string | undefined;
  if (analysis.specialization_id && topicId) {
    const { data: specialization } = await db.from("topic_specializations").select("id,name,slug")
      .eq("id", analysis.specialization_id).eq("topic_id", topicId).maybeSingle();
    if (specialization) return { topicId, topicName: "Công nghệ thông tin", specializationId: specialization.id as string, specializationName: specialization.name as string };
  }
  const prompt = await loadPrompt("topic_detection");
  const userPrompt = renderPrompt(prompt.user_prompt_template, {
    topic: "Công nghệ thông tin", content: sourceText.slice(0, 5000),
  });
  const result = await invokeAndLog(analysis.id as string, null, "topic_detection", prompt, userPrompt, 1);
  const detection = result.value && typeof result.value === "object" ? result.value as Record<string, unknown> : {};
  const isIT = detection.isIT === true;
  const suggestedSlug = typeof detection.specializationSlug === "string" ? detection.specializationSlug : null;
  if (isIT && !topicId) throw new ApiError(500, "IT_TOPIC_NOT_CONFIGURED", "Chưa cấu hình chủ đề Công nghệ thông tin.");
  const { data: detected } = isIT && suggestedSlug ? await db.from("topic_specializations").select("id,name,slug")
    .eq("topic_id", topicId).eq("slug", suggestedSlug).eq("is_active", true).maybeSingle() : { data: null };
  const { data: fallback } = isIT && !detected ? await db.from("topic_specializations").select("id,name,slug")
    .eq("topic_id", topicId).eq("slug", "it-fundamentals").eq("is_active", true).maybeSingle() : { data: null };
  const specialization = detected ?? fallback;
  const specializationId = specialization?.id as string | undefined;
  const topicName = isIT ? "Công nghệ thông tin" : typeof detection.detectedTopic === "string" && detection.detectedTopic.trim() ? detection.detectedTopic : "Chủ đề chưa xác định";
  await db.from("analyses").update({
    topic_id: isIT ? topicId : null, specialization_id: isIT ? specializationId ?? null : null,
    model_provider: result.provider, model_name: result.model,
  }).eq("id", analysis.id);
  return {
    topicId: isIT ? topicId! : null,
    topicName,
    specializationId: isIT ? specializationId ?? null : null,
    specializationName: isIT ? (specialization?.name as string | undefined) ?? "Nền tảng công nghệ thông tin" : topicName,
  };
}

async function loadSectionPrompt(analysis: Record<string, unknown>, topicId: string | null, specializationId: string | null) {
  const db = getAdminDb();
  if (analysis.prompt_template_id && topicId) {
    const { data: selected } = await db.from("prompt_templates").select("*")
      .eq("id", analysis.prompt_template_id).eq("purpose", "section_generation")
      .eq("topic_id", topicId).eq("is_active", true).maybeSingle();
    if (selected && (!selected.specialization_id || selected.specialization_id === specializationId)) return selected as PromptRow;
  }
  return loadPrompt("section_generation", topicId, specializationId) as Promise<PromptRow>;
}

export async function runAnalysis(identity: RequestIdentity, analysisId: string) {
  const db = getAdminDb();
  const analysis = await getAnalysis(identity, analysisId);
  if (!analysis.confirmed_at || !["ready", "failed", "processing"].includes(analysis.status)) {
    throw new ApiError(409, "ANALYSIS_NOT_READY", "Chỉ có thể chạy phân tích sau khi người dùng xem và xác nhận đầu vào.", { status: analysis.status });
  }
  let claimed = analysis;
  if (analysis.status !== "processing") {
    const { data, error: claimError } = await db.from("analyses").update({
    status: "processing", error_code: null, error_message: null, completed_at: null,
  }).eq("id", analysisId).match(identity.userId ? { user_id: identity.userId } : { guest_session_hash: identity.guestHash })
    .in("status", ["ready", "failed"]).select("*").maybeSingle();
    if (claimError) throw new ApiError(500, "DATABASE_ERROR", "Không thể bắt đầu xử lý.", claimError.message);
    if (!data) throw new ApiError(409, "ANALYSIS_ALREADY_RUNNING", "Phân tích đã được bắt đầu ở một yêu cầu khác.");
    claimed = data;
  }

  try {
    const { data: inputRows, error: inputError } = await db.from("analysis_inputs").select("id,edited_text,normalized_text,original_text")
      .eq("analysis_id", analysisId).order("position");
    if (inputError || !inputRows?.length) throw new ApiError(422, "NO_ANALYSIS_INPUT", "Phân tích không có nội dung nguồn.");
    const allText = inputRows.map((row: { edited_text?: string | null; normalized_text?: string | null; original_text?: string | null }) => row.edited_text ?? row.normalized_text ?? row.original_text ?? "").join("\n\n");
    const itContext = await resolveITSpecialization(claimed, allText);
    const { data: chunks, error: chunkError } = await db.from("analysis_chunks").select("*").eq("analysis_id", analysisId).order("chunk_index");
    if (chunkError || !chunks?.length) throw new ApiError(422, "NO_ANALYSIS_CHUNKS", "Hãy kiểm tra và xác nhận cấu trúc tài liệu trước khi chạy.");
    const sectionPrompt = await loadSectionPrompt(claimed, itContext.topicId, itContext.specializationId);
    const completed: Array<{ chunk: ChunkRow; value: ReturnType<typeof assertResult> }> = [];
    for (const chunk of chunks as ChunkRow[]) {
      let invalidSavedContent = false;
      if (chunk.status === "complete" && chunk.generated_content) {
        try { completed.push({ chunk, value: assertResult(chunk.generated_content) }); continue; } catch { invalidSavedContent = true; }
      }
      let claim = db.from("analysis_chunks").update({ status: "processing", error_message: null }).eq("id", chunk.id);
      if (invalidSavedContent) claim = claim.eq("status", "complete");
      else if (chunk.status === "processing") claim = claim.eq("status", "processing").lt("updated_at", new Date(Date.now() - 180_000).toISOString());
      else claim = claim.in("status", ["pending", "failed"]);
      const { data: claimedChunk, error: claimChunkError } = await claim.select("id").maybeSingle();
      if (claimChunkError) throw new ApiError(503, "CHUNK_CLAIM_FAILED", "Không thể bắt đầu phần tài liệu tiếp theo.", claimChunkError.message);
      if (!claimedChunk) return { analysisId, status: "processing" as const, completedChunks: completed.length, totalChunks: chunks.length, waitMs: 1500 };
      const userPrompt = renderPrompt(sectionPrompt.user_prompt_template, {
        topic: itContext.specializationName,
        custom_prompt: claimed.custom_prompt ?? "",
        content: chunk.content,
      }) + "\n\nQUY TẮC CẤU TRÚC NGUỒN: Các đề mục I/II, A/B, 1/2 và mục con trong nội dung là thứ bậc tài liệu; giữ quan hệ cha/con khi giải thích, không coi mỗi dòng bắt đầu bằng số là tiêu đề. Các đề mục ngắn trong lô này thuộc cùng ngữ cảnh. Không bỏ qua hình/sơ đồ, mã Mermaid, công thức LaTeX hoặc bảng đã được trích xuất; trả block đúng contentType, không bịa hình ảnh hay công thức không có trong nguồn.";
      try {
        let llm = await invokeAndLog(analysisId, chunk.id, "section_generation", sectionPrompt, userPrompt, chunk.retry_count + 1);
        let value: ReturnType<typeof assertResult>;
        try { value = assertResult(llm.value); }
        catch {
          const repairPrompt = await loadPrompt("repair", itContext.topicId, itContext.specializationId);
          const repairText = renderPrompt(repairPrompt.user_prompt_template, {
            schema: JSON.stringify(sectionPrompt.output_schema),
            invalid_output: llm.raw,
          });
          llm = await invokeAndLog(analysisId, chunk.id, "repair", repairPrompt, repairText, chunk.retry_count + 2);
          value = assertResult(llm.value);
        }
        if (claimed.quiz_enabled) {
          try {
            const quizPrompt = await loadPrompt("quiz_generation", itContext.topicId, itContext.specializationId);
            const response = await invokeAndLog(
              analysisId, chunk.id, "quiz_generation", quizPrompt,
              renderPrompt(quizPrompt.user_prompt_template, { question_count: "3", content: chunk.content }), 1,
            );
            value = assertResult({ ...value, quizCandidates: normalizeQuizCandidates(response.value, chunk.id) });
          } catch (quizError) {
            console.warn("Quiz candidates unavailable for chunk; source fallback will be used", quizError instanceof Error ? quizError.message : quizError);
          }
        }
        const { error: saveChunkError } = await db.from("analysis_chunks")
          .update({ status: "complete", generated_content: value, retry_count: chunk.retry_count + 1 }).eq("id", chunk.id);
        if (saveChunkError) throw new ApiError(503, "CHUNK_SAVE_FAILED", "Không lưu được phần tài liệu vừa phân tích. Hãy thử tiếp tục xử lý.", saveChunkError.message);
        completed.push({ chunk, value });
        // One Gemini chunk per request. The next request resumes from persisted
        // chunks, so browser refreshes and Vercel time limits do not restart a
        // long document from the beginning.
        if (completed.length < chunks.length) return {
          analysisId, status: "processing" as const,
          completedChunks: completed.length, totalChunks: chunks.length,
        };
      } catch (error) {
        await db.from("analysis_chunks").update({ status: "failed", error_message: error instanceof Error ? error.message : "LLM error", retry_count: chunk.retry_count + 1 }).eq("id", chunk.id);
        throw error;
      }
    }
    const resultJson = {
      title: claimed.title,
      summary: completed.map(item => item.value.summary).filter(Boolean).join(" "),
      sections: flattenSections(completed),
      metadata: {
        topicId: itContext.topicId,
        topicName: itContext.topicName,
        promptScope: itContext.topicId ? "it_specialized" : "general_fallback",
        specializationId: itContext.specializationId,
        sourceCount: inputRows.length,
        chunkCount: completed.length,
        generatedAt: new Date().toISOString(),
      },
    };
    assertResult(resultJson);
    const { data: previous } = await db.from("analysis_results").select("version").eq("analysis_id", analysisId).order("version", { ascending: false }).limit(1).maybeSingle();
    await db.from("analysis_results").update({ is_current: false }).eq("analysis_id", analysisId).eq("is_current", true);
    const { data: resultRow, error: resultError } = await db.from("analysis_results").insert({
      analysis_id: analysisId, version: (previous?.version ?? 0) + 1,
      schema_version: "1.0", result_json: resultJson, summary: resultJson.summary,
      source_metadata: resultJson.metadata, is_current: true,
    }).select().single();
    if (resultError) throw new ApiError(500, "RESULT_SAVE_FAILED", "Không lưu được kết quả phân tích.", resultError.message);
    await persistAssets(analysisId, resultRow.id, resultJson.sections);
    if (claimed.quiz_enabled) await generateQuiz(analysisId, resultRow.id, itContext.topicId, itContext.specializationId, completed);
    const { error: finishError } = await db.from("analyses").update({
      status: "completed", completed_at: new Date().toISOString(), error_code: null, error_message: null,
      model_provider: process.env.LLM_PROVIDER ?? "mock", model_name: process.env.GEMINI_MODEL ?? "documind-deterministic",
    }).eq("id", analysisId);
    if (finishError) throw new ApiError(500, "ANALYSIS_FINISH_FAILED", "Không cập nhật được trạng thái hoàn tất.");
    return { analysisId, status: "completed" as const, result: resultJson, quizEnabled: Boolean(claimed.quiz_enabled) };
  } catch (error) {
    const errorCode = error instanceof ApiError ? error.code : "PROCESSING_FAILED";
    await db.from("analyses").update({ status: "failed", error_code: errorCode, error_message: error instanceof Error ? error.message : String(error) }).eq("id", analysisId);
    throw error;
  }
}

async function generateQuiz(
  analysisId: string, resultId: string, topicId: string | null,
  specializationId: string | null, completed: Array<{ chunk: ChunkRow; value?: ReturnType<typeof assertResult> }>,
) {
  const db = getAdminDb();
  const candidates: QuizCandidate[] = [];
  let usedFallback = false;
  for (const item of completed) {
    const saved = (item.value ?? item.chunk.generated_content) as { quizCandidates?: QuizCandidate[] } | null | undefined;
    const generated = Array.isArray(saved?.quizCandidates) ? saved.quizCandidates : [];
    candidates.push(...generated);
    const fallback = createSourceGroundedFallback(item.chunk.content, item.chunk.id, Math.max(0, 3 - generated.length));
    if (fallback.length) usedFallback = true;
    candidates.push(...fallback);
  }
  const unique = Array.from(new Map(candidates.map(q => [q.prompt.toLocaleLowerCase(), q])).values()).slice(0, 20);
  if (!unique.length) return;
  const { data: quiz, error } = await db.from("quizzes").insert({
    analysis_id: analysisId, result_id: resultId, title: "Ôn tập nhanh",
    settings: { questionCount: unique.length, source: "chunk_candidates_deduplicated", usedSourceFallback: usedFallback }, status: "ready",
  }).select().single();
  if (error || !quiz) throw new ApiError(500, "QUIZ_SAVE_FAILED", "Không lưu được quiz.", error?.message);
  const { error: questionError } = await db.from("quiz_questions").insert(unique.map((q, question_index) => ({
    quiz_id: quiz.id, question_index, question_type: q.questionType, prompt: q.prompt, options: q.options,
    answer: { index: q.answerIndex }, explanation: q.explanation, difficulty: q.difficulty ?? "medium", source_chunk_id: q.chunkId,
  })));
  if (questionError) throw new ApiError(500, "QUIZ_QUESTIONS_SAVE_FAILED", "Không lưu được câu hỏi quiz.", questionError.message);
}

export async function createQuizForAnalysis(args: {
  analysisId: string;
  resultId: string;
  topicId: string | null;
  specializationId: string | null;
  chunks: ChunkRow[];
}) {
  await generateQuiz(args.analysisId, args.resultId, args.topicId, args.specializationId, args.chunks.map(chunk => ({ chunk })));
}

async function persistAssets(
  analysisId: string, resultId: string,
  sections: Array<{ blocks: Array<{ type: string; content: unknown; contentType?: string }> }>,
) {
  const assets: Array<Record<string, unknown>> = [];
  for (const section of sections) for (const block of section.blocks) {
    if (typeof block.content !== "string") continue;
    const source = block.content;
    if (["mermaid", "plantuml", "latex"].includes(block.contentType ?? "")) {
      assets.push({
        analysis_id: analysisId, result_id: resultId,
        asset_type: block.contentType, title: block.type || "Được tạo từ nội dung phân tích", source: source.trim(),
      });
      continue;
    }
    const matches = [...source.matchAll(/```(mermaid|plantuml|latex|tex)(?:\n)([\s\S]*?)```/gi)];
    for (const match of matches) {
      const language = match[1].toLowerCase();
      assets.push({
        analysis_id: analysisId, result_id: resultId,
        asset_type: language === "tex" ? "latex" : language,
        title: "Được tạo từ nội dung phân tích", source: match[2].trim(),
      });
    }
  }
  if (assets.length) await getAdminDb().from("generated_assets").insert(assets);
}
