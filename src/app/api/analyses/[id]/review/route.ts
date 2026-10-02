import { quizSettingsSchema } from "@/lib/quiz-settings";
import { sourceContentBlocks } from "@/lib/source-content";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { chunkText, normalizeText } from "@/lib/documents";
import { ApiError, errorResponse, ok, readJson } from "@/lib/http";
import { safeBody } from "@/lib/validation";

const reviewSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  topicCode: z.string().trim().max(80).optional(),
  specializationId: z.string().uuid().nullable().optional(),
  promptTemplateId: z.string().uuid().nullable().optional(),
  customPrompt: z.string().trim().max(3000).nullable().optional(),
  quizEnabled: z.boolean().optional(),
  quizSettings: quizSettingsSchema.optional(),
  inputs: z.array(z.object({ id: z.string().uuid(), editedText: z.string().max(500000) })).max(10).optional(),
});
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    if (!["draft", "needs_review"].includes(analysis.status)) throw new ApiError(409, "REVIEW_NOT_AVAILABLE", "Phân tích chưa ở bước kiểm tra và chỉnh sửa.");
    const body = safeBody(reviewSchema, await readJson(request));
    const db = getAdminDb();
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.customPrompt !== undefined) updates.custom_prompt = body.customPrompt;
    if (body.specializationId !== undefined) updates.specialization_id = body.specializationId;
    if (body.promptTemplateId !== undefined) updates.prompt_template_id = body.promptTemplateId;
    if (body.quizSettings !== undefined) updates.quiz_settings = body.quizSettings;
    if (body.quizEnabled !== undefined) updates.quiz_enabled = body.quizEnabled;
    if (body.topicCode !== undefined) {
      const topicCode = body.topicCode.toUpperCase();
      if (!["IT", "AUTO", "GENERAL"].includes(topicCode)) throw new ApiError(400, "UNSUPPORTED_TOPIC", "Hiện có thể chọn IT hoặc dùng prompt chung.");
      if (topicCode === "GENERAL") {
        updates.topic_id = null;
        updates.specialization_id = null;
      } else if (topicCode === "IT") {
        const { data: topic, error } = await db.from("topics").select("id").eq("code", "IT").eq("is_active", true).maybeSingle();
        if (error || !topic) throw new ApiError(500, "IT_TOPIC_NOT_CONFIGURED", "Chưa cấu hình chủ đề Công nghệ thông tin.");
        updates.topic_id = topic.id;
      }
    }
    const topicId = String(updates.topic_id ?? analysis.topic_id ?? "");
    if (body.specializationId) {
      const { data: specialization, error } = await db.from("topic_specializations").select("id").eq("id", body.specializationId).eq("topic_id", topicId).eq("is_active", true).maybeSingle();
      if (error || !specialization) throw new ApiError(400, "INVALID_IT_SPECIALIZATION", "Chuyên ngành không thuộc danh mục IT.");
    }
    if (body.promptTemplateId) {
      const promptQuery = db.from("prompt_templates").select("id")
        .eq("id", body.promptTemplateId).eq("purpose", "section_generation").eq("is_active", true);
      const { data: selectedPrompt, error } = topicId ? await promptQuery.or(`topic_id.is.null,topic_id.eq.${topicId}`).maybeSingle() : await promptQuery.is("topic_id", null).maybeSingle();
      if (error || !selectedPrompt) throw new ApiError(400, "INVALID_PROMPT_TEMPLATE", "Prompt đã chọn không phải mẫu phân tích IT đang hoạt động.");
    }
    if (Object.keys(updates).length) await db.from("analyses").update(updates).eq("id", id);
    let chunksSaved = false;
    if (body.inputs?.length) {
      const inputIds = body.inputs.map(input => input.id);
      const { data: ownedInputs, error } = await db.from("analysis_inputs").select("id,original_name").eq("analysis_id", id).in("id", inputIds);
      if (error || ownedInputs?.length !== body.inputs.length) throw new ApiError(400, "INPUT_OWNERSHIP_MISMATCH", "Có đầu vào không thuộc phân tích này.");
      const replacements = new Map<string, string>();
      for (const input of body.inputs) {
        const value = normalizeText(input.editedText);
        replacements.set(input.id, value);
        if (value.length < 40 && !sourceContentBlocks(value).some(block=>["latex","mermaid","plantuml"].includes(block.contentType??""))) throw new ApiError(422, "INPUT_TOO_SHORT", `${ownedInputs?.find(row => row.id === input.id)?.original_name || "Đầu vào"}: nội dung sau chỉnh sửa cần ít nhất 40 ký tự hoặc sơ đồ/công thức có mã.`, { inputId: input.id });
      }
      for (const input of body.inputs) await db.from("analysis_inputs").update({ edited_text: replacements.get(input.id), status: "valid" }).eq("id", input.id);
      const { data: allInputs } = await db.from("analysis_inputs").select("id,edited_text,normalized_text,original_text").eq("analysis_id", id).order("position");
      const totalChars = (allInputs ?? []).reduce((sum: number, input: { edited_text?: string | null; normalized_text?: string | null; original_text?: string | null }) => sum + (input.edited_text ?? input.normalized_text ?? input.original_text ?? "").length, 0);
      if (totalChars > 500000) throw new ApiError(413, "ANALYSIS_TOO_LARGE", "Tổng nội dung vượt giới hạn.");
      await db.from("analysis_chunks").delete().eq("analysis_id", id);
      const rows: Array<Record<string, unknown>> = [];
      for (const input of allInputs ?? []) {
        const text = input.edited_text ?? input.normalized_text ?? input.original_text ?? "";
        for (const chunk of chunkText(text)) rows.push({
          analysis_id: id, input_id: input.id, chunk_index: chunk.chunkIndex, title: chunk.title,
          content: chunk.content, char_start: chunk.charStart, char_end: chunk.charEnd, status: "pending",
        });
      }
      const { error: chunkError } = await db.from("analysis_chunks").insert(rows);
      if (chunkError) throw new ApiError(500, "CHUNK_SAVE_FAILED", "Không lưu được cấu trúc đã sửa.", chunkError.message);
      chunksSaved = true;
    }
    const { data: updated } = await db.from("analyses").select("*").eq("id", id).single();
    return ok({ analysis: updated, chunksRebuilt: chunksSaved });
  } catch (error) { return errorResponse(error); }
}
