import { retrieveChatContext } from "@/lib/chat-context";
import { privateLogPayload } from "@/lib/log-privacy";
import { enforceRateLimit } from "@/lib/rate-limit";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok, readJson } from "@/lib/http";
import { generateLlm, loadPrompt } from "@/lib/llm";
import { safeBody } from "@/lib/validation";

const chatSchema = z.object({ message: z.string().trim().min(1).max(4000) });
type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    await getAnalysis(identity, id);
    const { data, error } = await getAdminDb().from("chat_messages")
      .select("id,role,content,citations,metadata,created_at")
      .eq("analysis_id", id).order("created_at");
    if (error) throw new ApiError(500, "CHAT_LOAD_FAILED", "Không tải được lịch sử trò chuyện.", error.message);
    return ok({ messages: data ?? [] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    await enforceRateLimit(request, identity, "chat");
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    if (analysis.status !== "completed") throw new ApiError(409, "ANALYSIS_NOT_COMPLETE", "Bạn có thể hỏi tiếp sau khi phân tích hoàn tất.");
    const body = safeBody(chatSchema, await readJson(request));
    const db = getAdminDb();
    const [{ data: result }, { data: history, error: historyError }, {data: chunks, error: chunkError}] = await Promise.all([
      db.from("analysis_results").select("result_json,summary").eq("analysis_id", id).eq("is_current", true).maybeSingle(),
      db.from("chat_messages").select("role,content").eq("analysis_id", id).order("created_at", { ascending: false }).limit(8),
      db.from("analysis_chunks").select("id,title,content").eq("analysis_id", id).order("chunk_index"),
    ]);
    if (chunkError) throw new ApiError(503,"CHAT_CONTEXT_FAILED","Không tải được nguồn cho câu hỏi. Hãy thử lại.");
    if (historyError) throw new ApiError(500, "CHAT_LOAD_FAILED", "Không tải được ngữ cảnh trò chuyện.", historyError.message);
    if (!result) throw new ApiError(404, "RESULT_NOT_FOUND", "Không tìm thấy kết quả phân tích.");
    const prompt = await loadPrompt("chat", analysis.topic_id, analysis.specialization_id);
    // Array#reverse mutates; compute the chronological transcript once and reuse it.
    const transcript = [...(history ?? [])].reverse().map((message: { role: string; content: string }) => `${message.role}: ${message.content}`);
    const previousQuestion = [...(history ?? [])].find(m => m.role === "user")?.content ?? "";
    const contextData = retrieveChatContext(result.result_json, chunks ?? [], body.message + " " + previousQuestion.slice(0, 500));
    const groundedContext = JSON.stringify(contextData);
    const userPrompt = prompt.user_prompt_template
      .replace(/\{\{\s*topic\s*\}\}/g, analysis.topic_id ? "Công nghệ thông tin" : "chủ đề chung hoặc chưa xác định")
      .replace(/\{\{\s*summary\s*\}\}/g, groundedContext)
      .replace(/\{\{\s*history\s*\}\}/g, transcript.map(text => text.slice(0, 1000)).join("\n"))
      .replace(/\{\{\s*question\s*\}\}/g, body.message);
    const started = Date.now();
    const completion = await generateLlm({ purpose: "chat", system: prompt.system_prompt, prompt: userPrompt + "\nChỉ trích dẫn title hoặc sourceId trong passages. Nếu nguồn không đủ, nói rõ; không suy đoán.", schema: prompt.output_schema, });
    const value = completion.value as { answer?: string; citations?: string[] };
    if (!value || typeof value.answer !== "string") throw new ApiError(502, "INVALID_LLM_OUTPUT", "LLM trả câu trả lời không đúng cấu trúc.");
    const { data: userMessage, error: userError } = await db.from("chat_messages").insert({ analysis_id: id, role: "user", content: body.message }).select("id,role,content,created_at").single();
    if (userError) throw new ApiError(500, "CHAT_SAVE_FAILED", "Không lưu được tin nhắn.", userError.message);
    const { data: assistantMessage, error } = await db.from("chat_messages").insert({
      analysis_id: id, role: "assistant", content: value.answer, citations: (Array.isArray(value.citations) ? value.citations : []).filter(c => contextData.passages.some(p => p.title === c || p.sourceId === c)),
      metadata: { provider: completion.provider, model: completion.model },
    }).select("id,role,content,citations,metadata,created_at").single();
    await db.from("llm_exchanges").insert({
      analysis_id: id, prompt_template_id: prompt.id, purpose: "chat", provider: completion.provider, model: completion.model,
      request_payload: privateLogPayload({ message: body.message }), response_payload: privateLogPayload(completion.value),
      input_tokens: completion.inputTokens ?? null, output_tokens: completion.outputTokens ?? null,
      latency_ms: completion.latencyMs || Date.now() - started, status: "succeeded",
    });
    if (error) throw new ApiError(500, "CHAT_SAVE_FAILED", "Không lưu được câu trả lời.", error.message);
    return ok({ userMessage, assistantMessage });
  } catch (error) { return errorResponse(error); }
}
