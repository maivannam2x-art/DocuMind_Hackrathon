import { getAdminDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { startActivity, finishActivity } from "@/lib/activity";
import { availableModels } from "@/lib/gemini-routing";
import { thinkingConfig, type AnalysisDepth } from "@/lib/analysis-depth";
import { mockResponse } from "@/lib/mock-llm";

export type LlmPurpose =
  | "section_generation"
  | "quiz_generation"
  | "chat"
  | "repair"
  | "topic_detection"
  | "document_ocr"
  | "overview_generation";
export type LlmRequest = {
  purpose: LlmPurpose;
  system: string;
  prompt: string;
  schema?: unknown;
  media?: { mimeType: string; base64Data: string };
  timeoutMs?: number;
  analysisId?: string;
  activityLabel?: string;
  depth?: AnalysisDepth;
};
export type LlmResult = {
  value: unknown;
  raw: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
};

export function geminiSchema(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const schema = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (typeof schema.type === "string") result.type = schema.type.toUpperCase();
  if (typeof schema.description === "string")
    result.description = schema.description;
  if (Array.isArray(schema.enum)) result.enum = schema.enum;
  if (schema.items) result.items = geminiSchema(schema.items);
  if (
    schema.properties &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
  ) {
    const properties = Object.fromEntries(
      Object.entries(schema.properties as Record<string, unknown>).flatMap(
        ([key, child]) => {
          const converted = geminiSchema(child);
          return converted ? [[key, converted]] : [];
        },
      ),
    );
    result.properties = properties;
    if (Array.isArray(schema.required)) {
      // Gemini rejects a `required` entry when the corresponding property was
      // dropped during schema conversion (for example, an unsupported union).
      result.required = schema.required.filter(
        (key): key is string =>
          typeof key === "string" && Object.hasOwn(properties, key),
      );
    }
  }
  return result.type ? result : undefined;
}

export async function loadPrompt(
  purpose: LlmPurpose,
  topicId?: string | null,
  specializationId?: string | null,
) {
  const db = getAdminDb();
  const find = async (topic: string | null, specialization: string | null) => {
    let query = db
      .from("prompt_templates")
      .select("*")
      .eq("purpose", purpose)
      .eq("is_active", true);
    query = topic ? query.eq("topic_id", topic) : query.is("topic_id", null);
    query = specialization
      ? query.eq("specialization_id", specialization)
      : query.is("specialization_id", null);
    const { data, error } = await query
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw new ApiError(
        503,
        "PROMPT_LOAD_FAILED",
        "Không tải được prompt cấu hình.",
      );
    return data;
  };
  const scopes: Array<[string | null, string | null]> = [];
  if (topicId && specializationId) scopes.push([topicId, specializationId]);
  if (topicId) scopes.push([topicId, null]);
  scopes.push([null, null]);
  const matches = await Promise.all(scopes.map(([t, s]) => find(t, s)));
  const selected = matches.find(Boolean);
  if (!selected)
    throw new ApiError(
      503,
      "PROMPT_NOT_CONFIGURED",
      `Chưa cấu hình prompt cho ${purpose}.`,
    );
  return selected;
}

export async function generateLlm(request: LlmRequest): Promise<LlmResult> {
  const provider = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();
  const started = Date.now();
  const labels: Record<LlmPurpose, string> = {
    section_generation: "Phân tích nội dung",
    quiz_generation: "Tạo câu hỏi quiz",
    chat: "Trả lời câu hỏi từ tài liệu",
    repair: "Sửa cấu trúc phản hồi",
    topic_detection: "Nhận diện chủ đề và chuyên ngành",
    document_ocr: "Đọc ảnh, bảng và công thức",
    overview_generation: "Tổng hợp tóm tắt toàn tài liệu",
  };
  const label = request.activityLabel ?? labels[request.purpose];
  if (provider === "mock") {
    const id = await startActivity(
      request.analysisId,
      "ai",
      `Mô phỏng AI · ${label}`,
      "documind-deterministic",
    );
    const value = mockResponse(request);
    await finishActivity(id, "succeeded");
    return {
      value,
      raw: JSON.stringify(value),
      provider: "mock",
      model: "documind-deterministic",
      latencyMs: Date.now() - started,
    };
  }
  if (provider !== "gemini")
    throw new ApiError(
      500,
      "UNSUPPORTED_LLM_PROVIDER",
      "LLM_PROVIDER chỉ nhận mock hoặc gemini.",
    );
  const key = process.env.GEMINI_API_KEY;
  if (!key)
    throw new ApiError(
      503,
      "LLM_KEY_MISSING",
      "LLM_PROVIDER=gemini nhưng chưa điền GEMINI_API_KEY.",
    );
  const models = await availableModels(key);
  if (!models.length)
    throw new ApiError(
      503,
      "LLM_MODEL_UNAVAILABLE",
      "Không có model đã cấu hình còn hỗ trợ generateContent. Hãy kiểm tra cấu hình Gemini.",
    );
  const responseSchema =
    request.purpose === "section_generation" || request.purpose === "repair"
      ? undefined
      : geminiSchema(request.schema);
  const deadline = started + (request.timeoutMs ?? 90000);
  let lastStatus = 503;
  for (const [index, model] of models.entries()) {
    if (Date.now() + 1000 >= deadline) break;
    const id = await startActivity(
      request.analysisId,
      "ai",
      `${index ? "Thử model thay thế · " : ""}${label}`,
      model,
    );
    try {
      const thinking = request.depth
        ? thinkingConfig(model, request.depth)
        : undefined;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [
              {
                role: "user",
                parts: [
                  { text: request.prompt },
                  ...(request.media
                    ? [
                        {
                          inlineData: {
                            mimeType: request.media.mimeType,
                            data: request.media.base64Data,
                          },
                        },
                      ]
                    : []),
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              ...(responseSchema ? { responseSchema } : {}),
              temperature: 0.2,
              ...(thinking ? { thinkingConfig: thinking } : {}),
            },
          }),
          signal: AbortSignal.timeout(
            Math.max(1000, Math.min(60000, deadline - Date.now())),
          ),
        },
      );
      lastStatus = response.status;
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        await finishActivity(id, "failed");
        if ([429, 500, 502, 503, 504, 404].includes(response.status)) continue;
        throw new ApiError(
          response.status === 401 || response.status === 403 ? 503 : 422,
          "LLM_REQUEST_REJECTED",
          "Gemini từ chối yêu cầu. Hãy kiểm tra model, quyền API hoặc nội dung đầu vào.",
        );
      }
      if (!payload) {
        lastStatus = 502;
        await finishActivity(id, "failed");
        continue;
      }
      const candidate = payload.candidates?.[0];
      const raw =
        candidate?.content?.parts
          ?.filter((part: { thought?: boolean }) => !part.thought)
          .map((part: { text?: string }) => part.text ?? "")
          .join("") ?? "";
      if (!raw || candidate.finishReason === "MAX_TOKENS") {
        lastStatus = 502;
        await finishActivity(id, "failed");
        continue;
      }
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
      await finishActivity(id, "succeeded");
      return {
        value,
        raw,
        provider: "gemini",
        model,
        inputTokens: payload.usageMetadata?.promptTokenCount,
        outputTokens: payload.usageMetadata?.candidatesTokenCount,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      await finishActivity(id, "failed");
      if (error instanceof ApiError) throw error;
      lastStatus = 503;
    }
  }
  throw new ApiError(
    lastStatus === 429 ? 429 : 503,
    lastStatus === 429 ? "LLM_RATE_LIMIT" : "LLM_TIMEOUT",
    "Các model AI khả dụng đang bận hoặc không phản hồi. Tiến độ đã lưu; hãy thử tiếp tục sau.",
    { retryAfter: 60 },
  );
}
