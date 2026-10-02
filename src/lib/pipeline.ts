import { analysisDepth, depthInstructions } from "@/lib/analysis-depth";
import { envInt } from "@/lib/db";
import { startActivity, finishActivity } from "@/lib/activity";
import { privateLogPayload } from "@/lib/log-privacy";
import {
  quizSettings,
  quizQuotas,
  quizOutputSchema,
  type QuizSettings,
} from "@/lib/quiz-settings";
import type { RequestIdentity } from "@/lib/auth";
import { getAnalysis } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { assertResult } from "@/lib/validation";
import {
  generateLlm,
  loadPrompt,
  type LlmPurpose,
  type LlmResult,
} from "@/lib/llm";
import {
  createSourceGroundedFallback,
  normalizeQuizCandidates,
  shuffleCandidateOptions,
  type QuizCandidate,
} from "@/lib/quiz";
import {
  fallbackOverview,
  summaryContext,
  validatedOverview,
  type SummarySection,
} from "@/lib/overview";
import { preserveSourceVisuals } from "@/lib/source-content";

export type ChunkRow = {
  id: string;
  input_id: string;
  chunk_index: number;
  title: string | null;
  content: string;
  status: string;
  retry_count: number;
  generated_content?: unknown;
  quiz_finished?: boolean;
  quiz_batches?: number;
  quiz_lease_until?: string | null;
};
type PromptRow = {
  id: string;
  system_prompt: string;
  user_prompt_template: string;
  output_schema: unknown;
  model_config: Record<string, unknown>;
};

function renderPrompt(template: string, values: Record<string, string>) {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, key: string) => values[key] ?? "",
  );
}

async function saveExchange(args: {
  analysisId: string;
  chunkId?: string | null;
  promptId?: string | null;
  purpose: string;
  result?: LlmResult;
  attempt: number;
  requestPayload: unknown;
  error?: unknown;
}) {
  const db = getAdminDb();
  const result = args.result;
  const { error } = await db.from("llm_exchanges").insert({
    analysis_id: args.analysisId,
    chunk_id: args.chunkId ?? null,
    prompt_template_id: args.promptId ?? null,
    purpose: args.purpose,
    provider: result?.provider ?? process.env.LLM_PROVIDER ?? "mock",
    model:
      result?.model ?? process.env.GEMINI_MODEL ?? "documind-deterministic",
    attempt: args.attempt,
    request_payload: privateLogPayload(args.requestPayload),
    response_payload: privateLogPayload(result?.value),
    input_tokens: result?.inputTokens ?? null,
    output_tokens: result?.outputTokens ?? null,
    latency_ms: result?.latencyMs ?? null,
    status: args.error ? "failed" : "succeeded",
    error_message:
      args.error instanceof Error
        ? args.error.message
        : args.error
          ? String(args.error)
          : null,
  });
  if (error) console.error("Unable to persist LLM exchange", error.message);
}

async function invokeAndLog(
  analysisId: string,
  chunkId: string | null,
  purpose: LlmPurpose,
  prompt: PromptRow,
  userPrompt: string,
  attempt: number,
  label?: string,
) {
  const request = {
    analysisId,
    activityLabel: label,
    depth:
      purpose === "section_generation"
        ? analysisDepth(/Mức phân tích: [^.]+\./.exec(userPrompt)?.[0])
        : undefined,
    purpose,
    system: prompt.system_prompt,
    prompt: userPrompt,
    schema: prompt.output_schema,
  };
  try {
    const result = await generateLlm(request);
    await saveExchange({
      analysisId,
      chunkId,
      promptId: prompt.id,
      purpose,
      result,
      attempt,
      requestPayload: {
        system: request.system,
        prompt: userPrompt,
        schema: request.schema,
      },
    });
    return result;
  } catch (error) {
    await saveExchange({
      analysisId,
      chunkId,
      promptId: prompt.id,
      purpose,
      attempt,
      requestPayload: { prompt: userPrompt },
      error,
    });
    throw error;
  }
}

export function mergeChunkSections(
  parts: Array<{
    chunk: Pick<ChunkRow, "title">;
    value: ReturnType<typeof assertResult>;
  }>,
) {
  const sections: Array<{
    title: string;
    summary?: string;
    blocks: Array<{
      type: string;
      content: unknown;
      metadata?: Record<string, unknown>;
    }>;
  }> = [];
  const byTitle = new Map<string, (typeof sections)[number]>();
  for (const { chunk, value } of parts) {
    for (const section of value.sections) {
      const title =
        section.title.trim() || chunk.title || `Phần ${sections.length + 1}`;
      const context = chunk.title || "";
      const leaf =
        context
          .split(" › ")
          .at(-1)
          ?.replace(/^(?:[IVXLCDM]+|[A-Z]|\d+(?:\.\d+)*)[.)]\s+/i, "")
          .toLocaleLowerCase() ?? "";
      const scopedTitle =
        context &&
        context !== "Tài liệu" &&
        !context.includes(" – ") &&
        leaf &&
        !title.toLocaleLowerCase().includes(leaf)
          ? `${context} — ${title}`
          : title;
      // Two chapters may both contain a section named "Tổng quan". Only merge
      // continuations from the same source context, never unrelated chapters.
      const key = `${context}\u0000${title}`.toLocaleLowerCase();
      let target = byTitle.get(key);
      if (!target) {
        target = { title: scopedTitle, summary: section.summary, blocks: [] };
        byTitle.set(key, target);
        sections.push(target);
      }
      target.blocks.push(...section.blocks);
    }
  }
  return sections;
}

async function synthesizeOverview(
  analysisId: string,
  title: string,
  sections: SummarySection[],
) {
  const fallback = fallbackOverview(sections, title);
  if (
    (process.env.LLM_PROVIDER ?? "mock").toLowerCase() !== "gemini" ||
    sections.length < 2
  )
    return fallback;
  const prompt = `Nhãn phiên do người dùng đặt (không phải chứng cứ nguồn): ${title}\nCác mục và tóm tắt ngắn (trích từ kết quả đã kiểm tra):\n${summaryContext(sections)}\n\nViết overview ngắn bằng tiếng Việt: lead 2–3 câu tối đa 450 ký tự; 3–7 highlights có tiêu đề cụ thể và giải thích tối đa 200 ký tự mỗi ý. Chỉ dựa vào các mục và tóm tắt bên trên. Không suy ra phạm vi, số chương, thời gian hoặc sự kiện từ nhãn phiên. Không thêm số liệu hoặc khẳng định không có trong nguồn; không chép nối mọi mục thành một đoạn dài. Trả JSON {lead,highlights:[{title,detail}]}.`;
  try {
    const response = await generateLlm({
      analysisId,
      purpose: "overview_generation",
      system:
        "Bạn biên tập bản tóm tắt điều hành của tài liệu học tập. Tôn trọng tên mục, thứ tự và chứng cứ nguồn; viết ngắn, có tiêu đề, dễ quét mắt.",
      prompt,
      timeoutMs: 35_000,
      schema: {
        type: "object",
        required: ["lead", "highlights"],
        properties: {
          lead: { type: "string" },
          highlights: {
            type: "array",
            items: {
              type: "object",
              required: ["title", "detail"],
              properties: {
                title: { type: "string" },
                detail: { type: "string" },
              },
            },
          },
        },
      },
    });
    await saveExchange({
      analysisId,
      purpose: "overview_generation",
      attempt: 1,
      requestPayload: { prompt },
      result: response,
    });
    return validatedOverview(response.value) ?? fallback;
  } catch (error) {
    await saveExchange({
      analysisId,
      purpose: "overview_generation",
      attempt: 1,
      requestPayload: { prompt },
      error,
    });
    return fallback;
  }
}

async function resolveITSpecialization(
  analysis: Record<string, unknown>,
  sourceText: string,
) {
  const db = getAdminDb();
  const { data: itTopic, error: topicError } = await db
    .from("topics")
    .select("id")
    .eq("code", "IT")
    .eq("is_active", true)
    .maybeSingle();
  if (topicError)
    throw new ApiError(
      500,
      "DATABASE_ERROR",
      "Không tải được danh mục chủ đề.",
      topicError.message,
    );
  const topicId = itTopic?.id as string | undefined;
  if (analysis.specialization_id && topicId) {
    const { data: specialization } = await db
      .from("topic_specializations")
      .select("id,name,slug")
      .eq("id", analysis.specialization_id)
      .eq("topic_id", topicId)
      .maybeSingle();
    if (specialization)
      return {
        topicId,
        topicName: "Công nghệ thông tin",
        specializationId: specialization.id as string,
        specializationName: specialization.name as string,
      };
  }
  const prompt = await loadPrompt("topic_detection");
  const userPrompt = renderPrompt(prompt.user_prompt_template, {
    topic: "Công nghệ thông tin",
    content: sourceText.slice(0, 5000),
  });
  const result = await invokeAndLog(
    analysis.id as string,
    null,
    "topic_detection",
    prompt,
    userPrompt,
    1,
  );
  const detection =
    result.value && typeof result.value === "object"
      ? (result.value as Record<string, unknown>)
      : {};
  const isIT = detection.isIT === true;
  const suggestedSlug =
    typeof detection.specializationSlug === "string"
      ? detection.specializationSlug
      : null;
  if (isIT && !topicId)
    throw new ApiError(
      500,
      "IT_TOPIC_NOT_CONFIGURED",
      "Chưa cấu hình chủ đề Công nghệ thông tin.",
    );
  const { data: detected } =
    isIT && suggestedSlug
      ? await db
          .from("topic_specializations")
          .select("id,name,slug")
          .eq("topic_id", topicId)
          .eq("slug", suggestedSlug)
          .eq("is_active", true)
          .maybeSingle()
      : { data: null };
  const { data: fallback } =
    isIT && !detected
      ? await db
          .from("topic_specializations")
          .select("id,name,slug")
          .eq("topic_id", topicId)
          .eq("slug", "it-fundamentals")
          .eq("is_active", true)
          .maybeSingle()
      : { data: null };
  const specialization = detected ?? fallback;
  const specializationId = specialization?.id as string | undefined;
  const topicName = isIT
    ? "Công nghệ thông tin"
    : typeof detection.detectedTopic === "string" &&
        detection.detectedTopic.trim()
      ? detection.detectedTopic
      : "Chủ đề chưa xác định";
  await db
    .from("analyses")
    .update({
      topic_id: isIT ? topicId : null,
      specialization_id: isIT ? (specializationId ?? null) : null,
      model_provider: result.provider,
      model_name: result.model,
    })
    .eq("id", analysis.id);
  return {
    topicId: isIT ? topicId! : null,
    topicName,
    specializationId: isIT ? (specializationId ?? null) : null,
    specializationName: isIT
      ? ((specialization?.name as string | undefined) ??
        "Nền tảng công nghệ thông tin")
      : topicName,
  };
}

async function loadSectionPrompt(
  analysis: Record<string, unknown>,
  topicId: string | null,
  specializationId: string | null,
) {
  const db = getAdminDb();
  if (analysis.prompt_template_id && topicId) {
    const { data: selected } = await db
      .from("prompt_templates")
      .select("*")
      .eq("id", analysis.prompt_template_id)
      .eq("purpose", "section_generation")
      .eq("topic_id", topicId)
      .eq("is_active", true)
      .maybeSingle();
    if (selected && selected.specialization_id === specializationId)
      return selected as PromptRow;
    // Analyses created before topic detection often carry the generic IT template.
    // Prefer the detected specialization once it is known, while preserving an
    // explicitly selected specialization-specific template.
    if (selected && !selected.specialization_id && !specializationId)
      return selected as PromptRow;
  }
  return loadPrompt(
    "section_generation",
    topicId,
    specializationId,
  ) as Promise<PromptRow>;
}

export async function runAnalysis(
  identity: RequestIdentity,
  analysisId: string,
) {
  const db = getAdminDb();
  const analysis = await getAnalysis(identity, analysisId);
  if (analysis.status === "completed")
    return {
      analysisId,
      status: "completed" as const,
      quizEnabled: Boolean(analysis.quiz_enabled),
    };
  if (
    !analysis.confirmed_at ||
    !["ready", "failed", "processing"].includes(analysis.status)
  ) {
    throw new ApiError(
      409,
      "ANALYSIS_NOT_READY",
      "Chỉ có thể chạy phân tích sau khi người dùng xem và xác nhận đầu vào.",
      { status: analysis.status },
    );
  }
  let claimed = analysis;
  if (analysis.status !== "processing") {
    const { data, error: claimError } = await db
      .from("analyses")
      .update({
        status: "processing",
        error_code: null,
        error_message: null,
        completed_at: null,
      })
      .eq("id", analysisId)
      .match(
        identity.userId
          ? { user_id: identity.userId }
          : { guest_session_hash: identity.guestHash },
      )
      .in("status", ["ready", "failed"])
      .select("*")
      .maybeSingle();
    if (claimError)
      throw new ApiError(
        500,
        "DATABASE_ERROR",
        "Không thể bắt đầu xử lý.",
        claimError.message,
      );
    if (!data)
      throw new ApiError(
        409,
        "ANALYSIS_ALREADY_RUNNING",
        "Phân tích đã được bắt đầu ở một yêu cầu khác.",
      );
    claimed = data;
  }

  try {
    const { data: inputRows, error: inputError } = await db
      .from("analysis_inputs")
      .select("id,edited_text,normalized_text,original_text")
      .eq("analysis_id", analysisId)
      .order("position");
    if (inputError || !inputRows?.length)
      throw new ApiError(
        422,
        "NO_ANALYSIS_INPUT",
        "Phân tích không có nội dung nguồn.",
      );
    const allText = inputRows
      .map(
        (row: {
          edited_text?: string | null;
          normalized_text?: string | null;
          original_text?: string | null;
        }) => row.edited_text ?? row.normalized_text ?? row.original_text ?? "",
      )
      .join("\n\n");
    const itContext = await resolveITSpecialization(claimed, allText);
    const { data: chunks, error: chunkError } = await db
      .from("analysis_chunks")
      .select("*")
      .eq("analysis_id", analysisId)
      .order("chunk_index");
    if (chunkError || !chunks?.length)
      throw new ApiError(
        422,
        "NO_ANALYSIS_CHUNKS",
        "Hãy kiểm tra và xác nhận cấu trúc tài liệu trước khi chạy.",
      );
    const sectionPrompt = await loadSectionPrompt(
      claimed,
      itContext.topicId,
      itContext.specializationId,
    );
    const completed: Array<{
      chunk: ChunkRow;
      value: ReturnType<typeof assertResult>;
    }> = [];
    const processChunk = async (chunk: ChunkRow) => {
      let invalidSavedContent = false;
      if (chunk.status === "complete" && chunk.generated_content) {
        try {
          completed.push({
            chunk,
            value: assertResult(chunk.generated_content),
          });
          return;
        } catch {
          invalidSavedContent = true;
        }
      }
      let claim = db
        .from("analysis_chunks")
        .update({ status: "processing", error_message: null })
        .eq("id", chunk.id);
      if (invalidSavedContent) claim = claim.eq("status", "complete");
      else if (chunk.status === "processing")
        claim = claim
          .eq("status", "processing")
          .lt("updated_at", new Date(Date.now() - 300_000).toISOString());
      else claim = claim.in("status", ["pending", "failed"]);
      const { data: claimedChunk, error: claimChunkError } = await claim
        .select("id")
        .maybeSingle();
      if (claimChunkError)
        throw new ApiError(
          503,
          "CHUNK_CLAIM_FAILED",
          "Không thể bắt đầu phần tài liệu tiếp theo.",
          claimChunkError.message,
        );
      if (!claimedChunk) return;
      const userPrompt =
        depthInstructions(analysisDepth(claimed.custom_prompt)) +
        "\n" +
        renderPrompt(sectionPrompt.user_prompt_template, {
          topic: itContext.specializationName,
          custom_prompt: claimed.custom_prompt ?? "",
          content: `Vị trí trong tài liệu: ${chunk.title}\n\n${chunk.content}`,
        }) +
        "\n\nQUY TẮC CẤU TRÚC NGUỒN: Các đề mục I/II, A/B, 1/2 và mục con trong nội dung là thứ bậc tài liệu; giữ tên chương và quan hệ cha/con khi giải thích. Với các mục A/B có phần thân đủ dài và nội dung khác nhau, tạo section riêng có tiêu đề gắn với chương cha; các mục rất ngắn có thể gộp trong cùng section. Không coi mỗi dòng bắt đầu bằng số là tiêu đề. Không gộp nội dung của hai chương lớn vào một section. Không bỏ qua hình/sơ đồ, mã Mermaid, công thức LaTeX hoặc bảng đã được trích xuất; trả block đúng contentType, không bịa hình ảnh hay công thức không có trong nguồn.";
      try {
        let llm = await invokeAndLog(
          analysisId,
          chunk.id,
          "section_generation",
          sectionPrompt,
          userPrompt,
          chunk.retry_count + 1,
          `Phân tích phần ${chunk.chunk_index + 1}: ${chunk.title ?? "Nội dung"}`,
        );
        let value: ReturnType<typeof assertResult>;
        try {
          value = assertResult(llm.value);
        } catch {
          const repairPrompt = await loadPrompt(
            "repair",
            itContext.topicId,
            itContext.specializationId,
          );
          const repairText = renderPrompt(repairPrompt.user_prompt_template, {
            schema: JSON.stringify(sectionPrompt.output_schema),
            invalid_output: llm.raw,
          });
          llm = await invokeAndLog(
            analysisId,
            chunk.id,
            "repair",
            repairPrompt,
            repairText,
            chunk.retry_count + 2,
          );
          value = assertResult(llm.value);
        }
        value = assertResult(
          preserveSourceVisuals(
            value,
            chunk.content,
            chunk.title || "Tài liệu",
          ),
        );
        const { error: saveChunkError } = await db
          .from("analysis_chunks")
          .update({
            status: "complete",
            generated_content: value,
            retry_count: chunk.retry_count + 1,
          })
          .eq("id", chunk.id);
        if (saveChunkError)
          throw new ApiError(
            503,
            "CHUNK_SAVE_FAILED",
            "Không lưu được phần tài liệu vừa phân tích. Hãy thử tiếp tục xử lý.",
            saveChunkError.message,
          );
        chunk.generated_content = value;
        completed.push({ chunk, value });
      } catch (error) {
        await db
          .from("analysis_chunks")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "LLM error",
            retry_count: chunk.retry_count + 1,
          })
          .eq("id", chunk.id);
        throw error;
      }
    };
    const concurrency = Math.min(4, envInt("LLM_CONCURRENCY", 3));
    const pendingChunks = (chunks as ChunkRow[]).filter((chunk) => {
      if (chunk.status !== "complete" || !chunk.generated_content) return true;
      try {
        assertResult(chunk.generated_content);
        return false;
      } catch {
        return true;
      }
    });
    if (pendingChunks.length) {
      const outcome = await Promise.allSettled(
        pendingChunks.slice(0, concurrency).map(processChunk),
      );
      const rejected = outcome.find((item) => item.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
    }
    const { data: refreshedChunks, error: refreshError } = await db
      .from("analysis_chunks")
      .select("*")
      .eq("analysis_id", analysisId)
      .order("chunk_index");
    if (refreshError)
      throw new ApiError(
        503,
        "PROGRESS_UNAVAILABLE",
        "Không tải được checkpoint.",
      );
    completed.length = 0;
    for (const chunk of (refreshedChunks ?? []) as ChunkRow[])
      if (chunk.status === "complete" && chunk.generated_content)
        completed.push({ chunk, value: assertResult(chunk.generated_content) });
    if (completed.length < chunks.length)
      return {
        analysisId,
        status: "processing" as const,
        completedChunks: completed.length,
        totalChunks: chunks.length,
        waitMs: 1500,
      };
    const sourceChunks = completed.map((item) => item.chunk);
    if (claimed.quiz_enabled) {
      const pending = await continueQuizCandidates(
        analysisId,
        itContext.topicId,
        itContext.specializationId,
        sourceChunks,
        quizSettings(claimed.quiz_settings),
      );
      if (pending)
        return {
          analysisId,
          status: "processing" as const,
          completedChunks: completed.length,
          totalChunks: chunks.length,
          ...pending,
        };
      // Candidate batches are stored independently from the analysis content.
      const { data: refreshed } = await db
        .from("analysis_chunks")
        .select("id,generated_content")
        .eq("analysis_id", analysisId);
      for (const item of completed) {
        const saved = refreshed?.find((row) => row.id === item.chunk.id);
        if (saved) item.value = assertResult(saved.generated_content);
      }
    }
    const { data: finalization, error: finalizationError } = await db
      .from("analyses")
      .update({
        finalization_lease_until: new Date(Date.now() + 180000).toISOString(),
      })
      .eq("id", analysisId)
      .eq("status", "processing")
      .or(
        `finalization_lease_until.is.null,finalization_lease_until.lt.${new Date().toISOString()}`,
      )
      .select("id")
      .maybeSingle();
    if (finalizationError)
      throw new ApiError(
        503,
        "RESULT_CLAIM_FAILED",
        "Không bắt đầu được tổng hợp kết quả.",
      );
    if (!finalization)
      return {
        analysisId,
        status: "processing" as const,
        completedChunks: completed.length,
        totalChunks: chunks.length,
        waitMs: 1500,
      };
    const mergeActivity = await startActivity(
      analysisId,
      "system",
      "Gộp kết quả theo thứ tự nguồn và chuẩn hóa cấu trúc",
    );
    const sections = mergeChunkSections(completed);
    await finishActivity(mergeActivity, "succeeded");
    const overview = await synthesizeOverview(
      analysisId,
      String(claimed.title || "Tài liệu"),
      sections,
    );
    const resultJson = {
      title: claimed.title,
      summary: overview.lead,
      overview,
      sections,
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
    const { data: previous } = await db
      .from("analysis_results")
      .select("version")
      .eq("analysis_id", analysisId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    await db
      .from("analysis_results")
      .update({ is_current: false })
      .eq("analysis_id", analysisId)
      .eq("is_current", true);
    const { data: resultRow, error: resultError } = await db
      .from("analysis_results")
      .insert({
        analysis_id: analysisId,
        version: (previous?.version ?? 0) + 1,
        schema_version: "1.0",
        result_json: resultJson,
        summary: resultJson.summary,
        source_metadata: resultJson.metadata,
        is_current: true,
      })
      .select()
      .single();
    if (resultError)
      throw new ApiError(
        500,
        "RESULT_SAVE_FAILED",
        "Không lưu được kết quả phân tích.",
        resultError.message,
      );
    await persistAssets(analysisId, resultRow.id, resultJson.sections);
    if (claimed.quiz_enabled)
      await generateQuiz(
        analysisId,
        resultRow.id,
        itContext.topicId,
        itContext.specializationId,
        completed,
        quizSettings(claimed.quiz_settings),
      );
    const { error: finishError } = await db
      .from("analyses")
      .update({
        finalization_lease_until: null,
        status: "completed",
        completed_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
        model_provider: process.env.LLM_PROVIDER ?? "mock",
        model_name: process.env.GEMINI_MODEL ?? "documind-deterministic",
      })
      .eq("id", analysisId);
    if (finishError)
      throw new ApiError(
        500,
        "ANALYSIS_FINISH_FAILED",
        "Không cập nhật được trạng thái hoàn tất.",
      );
    return {
      analysisId,
      status: "completed" as const,
      result: resultJson,
      quizEnabled: Boolean(claimed.quiz_enabled),
    };
  } catch (error) {
    const errorCode =
      error instanceof ApiError ? error.code : "PROCESSING_FAILED";
    await db
      .from("analyses")
      .update({
        finalization_lease_until: null,
        status: "failed",
        error_code: errorCode,
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq("id", analysisId);
    throw error;
  }
}

/** One candidate batch per /run request. A database lease prevents duplicate
 * work across tabs; successful batches survive pause/reload. */
export async function continueQuizCandidates(
  analysisId: string,
  topicId: string | null,
  specializationId: string | null,
  chunks: ChunkRow[],
  settings: QuizSettings,
) {
  const quotas = quizQuotas(
    chunks.map((c) => c.content.length),
    settings.questionCount,
  );
  const pending = chunks
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => !c.quiz_finished && quotas[i] > 0);
  if (!pending.length) return null;
  const results = await Promise.allSettled(
    pending
      .slice(0, Math.min(4, envInt("LLM_CONCURRENCY", 3)))
      .map(({ i }) =>
        continueQuizChunk(
          analysisId,
          topicId,
          specializationId,
          chunks,
          settings,
          i,
        ),
      ),
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return {
    quizCompleted: chunks.filter((c, i) => c.quiz_finished && quotas[i] > 0)
      .length,
    quizTotal: quotas.filter((n) => n > 0).length,
    waitMs: results.some(
      (r) => r.status === "fulfilled" && r.value?.waitMs === 1500,
    )
      ? 1500
      : 500,
  };
}

async function continueQuizChunk(
  analysisId: string,
  topicId: string | null,
  specializationId: string | null,
  chunks: ChunkRow[],
  settings: QuizSettings,
  selectedIndex?: number,
) {
  const db = getAdminDb(),
    quotas = quizQuotas(
      chunks.map((c) => c.content.length),
      settings.questionCount,
    );
  const next =
    selectedIndex ??
    chunks.findIndex((c, i) => !c.quiz_finished && quotas[i] > 0);
  if (next < 0) return null;
  const chunk = chunks[next],
    now = new Date().toISOString();
  const { data: claim, error: claimError } = await db
    .from("analysis_chunks")
    .update({ quiz_lease_until: new Date(Date.now() + 180000).toISOString() })
    .eq("id", chunk.id)
    .eq("quiz_finished", false)
    .or(`quiz_lease_until.is.null,quiz_lease_until.lt.${now}`)
    .select("id")
    .maybeSingle();
  if (claimError)
    throw new ApiError(
      503,
      "QUIZ_CLAIM_FAILED",
      "Không bắt đầu được lượt tạo quiz.",
    );
  if (!claim)
    return {
      waitMs: 1500,
      quizCompleted: chunks.filter((c) => c.quiz_finished).length,
      quizTotal: chunks.length,
    };
  const saved = assertResult(chunk.generated_content),
    previous = Array.isArray(saved.quizCandidates)
      ? (saved.quizCandidates as QuizCandidate[])
      : [];
  let candidates = previous,
    finished = false;
  const batches = (chunk.quiz_batches ?? 0) + 1;
  try {
    const count = Math.min(20, Math.max(0, quotas[next] - previous.length));
    if (count) {
      const prompt = await loadPrompt(
        "quiz_generation",
        topicId,
        specializationId,
      );
      const userPrompt =
        renderPrompt(prompt.user_prompt_template, {
          question_count: String(count),
          content: chunk.content,
        }) +
        `\nĐộ khó: ${settings.difficulty}; questionType chỉ nhận: ${settings.types.join(", ")}. ${settings.difficulty !== "mixed" ? `Mọi câu đặt difficulty=${settings.difficulty}.` : ""} Không lặp các câu: ${previous.map((q) => q.prompt).join("; ")}. Nếu nguồn không đủ, trả ít câu hơn; không bịa hoặc đổi cách viết để lặp ý.`;
      const schema = quizOutputSchema(settings);
      const result = await invokeAndLog(
        analysisId,
        chunk.id,
        "quiz_generation",
        { ...prompt, output_schema: schema },
        userPrompt +
          "\nBắt buộc có questionType. true_false có đúng 2 lựa chọn Đúng/Sai; multiple_choice có 4 lựa chọn.",
        batches,
        `Quiz phần ${chunk.chunk_index + 1}: ${chunk.title ?? "Nội dung"} · đợt ${batches} · tối đa ${count} câu`,
      );
      const fresh = normalizeQuizCandidates(result.value, chunk.id).filter(
        (q) =>
          settings.types.includes(q.questionType) &&
          (settings.difficulty === "mixed" ||
            q.difficulty === settings.difficulty),
      );
      candidates = Array.from(
        new Map(
          [...previous, ...fresh].map((q) => [q.prompt.toLocaleLowerCase(), q]),
        ).values(),
      ).slice(0, quotas[next]);
    }
    finished =
      candidates.length >= quotas[next] ||
      batches >= Math.ceil(quotas[next] / 20) + 2;
  } catch (error) {
    // A retry resumes this batch rather than re-running the section analysis.
    await db
      .from("analysis_chunks")
      .update({ quiz_lease_until: null })
      .eq("id", chunk.id);
    throw error;
  }
  const { error: saveError } = await db
    .from("analysis_chunks")
    .update({
      generated_content: { ...saved, quizCandidates: candidates },
      quiz_batches: batches,
      quiz_finished: finished,
      quiz_lease_until: null,
    })
    .eq("id", chunk.id);
  if (saveError)
    throw new ApiError(
      503,
      "QUIZ_PROGRESS_SAVE_FAILED",
      "Không lưu được lượt tạo câu hỏi. Hãy tiếp tục lại.",
    );
  chunk.quiz_finished = finished;
  return {
    quizCompleted:
      chunks.filter((c) => c.quiz_finished).length + (finished ? 1 : 0),
    quizTotal: chunks.filter((_, i) => quotas[i] > 0).length,
    waitMs: 300,
  };
}

async function generateQuiz(
  analysisId: string,
  resultId: string,
  topicId: string | null,
  specializationId: string | null,
  completed: Array<{
    chunk: ChunkRow;
    value?: ReturnType<typeof assertResult>;
  }>,
  settings: QuizSettings = quizSettings({}),
) {
  const db = getAdminDb();
  const candidates: QuizCandidate[] = [];
  let usedFallback = false;
  const quotas = quizQuotas(
    completed.map((item) => item.chunk.content.length),
    settings.questionCount,
  );
  for (const [index, item] of completed.entries()) {
    const saved = (item.value ?? item.chunk.generated_content) as
      { quizCandidates?: QuizCandidate[] } | null | undefined;
    const generated = Array.isArray(saved?.quizCandidates)
      ? saved.quizCandidates
      : [];
    candidates.push(
      ...generated.filter(
        (q) =>
          settings.types.includes(q.questionType) &&
          (settings.difficulty === "mixed" ||
            q.difficulty === settings.difficulty),
      ),
    );
    const fallback = createSourceGroundedFallback(
      item.chunk.content,
      item.chunk.id,
      Math.max(0, quotas[index] - generated.length),
    );
    if (fallback.length) usedFallback = true;
    candidates.push(
      ...fallback.filter(
        (q) =>
          settings.types.includes(q.questionType) &&
          (settings.difficulty === "mixed" ||
            q.difficulty === settings.difficulty),
      ),
    );
  }
  const unique = Array.from(
    new Map(candidates.map((q) => [q.prompt.toLocaleLowerCase(), q])).values(),
  )
    .slice(0, settings.questionCount)
    .map(shuffleCandidateOptions);
  if (!unique.length) return;
  const { data: quiz, error } = await db
    .from("quizzes")
    .insert({
      analysis_id: analysisId,
      result_id: resultId,
      title: "Ôn tập nhanh",
      settings: {
        ...settings,
        requestedQuestionCount: settings.questionCount,
        shortfall: Math.max(0, settings.questionCount - unique.length),
        questionCount: unique.length,
        source: "chunk_candidates_deduplicated",
        usedSourceFallback: usedFallback,
      },
      status: "draft",
    })
    .select()
    .single();
  if (error || !quiz)
    throw new ApiError(
      500,
      "QUIZ_SAVE_FAILED",
      "Không lưu được quiz.",
      error?.message,
    );
  const { error: questionError } = await db.from("quiz_questions").insert(
    unique.map((q, question_index) => ({
      quiz_id: quiz.id,
      question_index,
      question_type: q.questionType,
      prompt: q.prompt,
      options: q.options,
      answer: { index: q.answerIndex },
      explanation: q.explanation,
      difficulty: q.difficulty ?? "medium",
      source_chunk_id: q.chunkId,
    })),
  );
  if (questionError)
    throw new ApiError(
      500,
      "QUIZ_QUESTIONS_SAVE_FAILED",
      "Không lưu được câu hỏi quiz.",
      questionError.message,
    );
  const { error: readyError } = await db
    .from("quizzes")
    .update({ status: "ready" })
    .eq("id", quiz.id);
  if (readyError)
    throw new ApiError(
      503,
      "QUIZ_FINISH_FAILED",
      "Không hoàn tất được quiz. Hãy thử lại.",
    );
}

export async function createQuizForAnalysis(args: {
  analysisId: string;
  resultId: string;
  topicId: string | null;
  specializationId: string | null;
  chunks: ChunkRow[];
  settings?: QuizSettings;
}) {
  await generateQuiz(
    args.analysisId,
    args.resultId,
    args.topicId,
    args.specializationId,
    args.chunks.map((chunk) => ({ chunk })),
    args.settings,
  );
}

async function persistAssets(
  analysisId: string,
  resultId: string,
  sections: Array<{
    blocks: Array<{ type: string; content: unknown; contentType?: string }>;
  }>,
) {
  const assets: Array<Record<string, unknown>> = [];
  for (const section of sections)
    for (const block of section.blocks) {
      if (typeof block.content !== "string") continue;
      const source = block.content;
      if (["mermaid", "plantuml", "latex"].includes(block.contentType ?? "")) {
        assets.push({
          analysis_id: analysisId,
          result_id: resultId,
          asset_type: block.contentType,
          title: block.type || "Được tạo từ nội dung phân tích",
          source: source.trim(),
        });
        continue;
      }
      const matches = [
        ...source.matchAll(
          /```(mermaid|plantuml|latex|tex)(?:\n)([\s\S]*?)```/gi,
        ),
      ];
      for (const match of matches) {
        const language = match[1].toLowerCase();
        assets.push({
          analysis_id: analysisId,
          result_id: resultId,
          asset_type: language === "tex" ? "latex" : language,
          title: "Được tạo từ nội dung phân tích",
          source: match[2].trim(),
        });
      }
    }
  if (assets.length) await getAdminDb().from("generated_assets").insert(assets);
}
