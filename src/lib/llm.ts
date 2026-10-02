import { getAdminDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { mockResponse } from "@/lib/mock-llm";

export type LlmPurpose = "section_generation" | "quiz_generation" | "chat" | "repair" | "topic_detection" | "document_ocr" | "overview_generation";
export type LlmRequest = {
  purpose: LlmPurpose;
  system: string;
  prompt: string;
  schema?: unknown;
  media?: { mimeType: string; base64Data: string };
  timeoutMs?: number;
};
export type LlmResult = { value: unknown; raw: string; provider: string; model: string; inputTokens?: number; outputTokens?: number; latencyMs: number };

export function geminiSchema(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const schema = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (typeof schema.type === "string") result.type = schema.type.toUpperCase();
  if (typeof schema.description === "string") result.description = schema.description;
  if (Array.isArray(schema.enum)) result.enum = schema.enum;
  if (schema.items) result.items = geminiSchema(schema.items);
  if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
    const properties = Object.fromEntries(Object.entries(schema.properties as Record<string, unknown>).flatMap(([key, child]) => {
      const converted = geminiSchema(child);
      return converted ? [[key, converted]] : [];
    }));
    result.properties = properties;
    if (Array.isArray(schema.required)) {
      // Gemini rejects a `required` entry when the corresponding property was
      // dropped during schema conversion (for example, an unsupported union).
      result.required = schema.required.filter((key): key is string => typeof key === "string" && Object.hasOwn(properties, key));
    }
  }
  return result.type ? result : undefined;
}

export async function loadPrompt(purpose: LlmPurpose, topicId?: string | null, specializationId?: string | null) {
  const { data, error } = await getAdminDb().from("prompt_templates").select("*")
    .eq("purpose", purpose).eq("is_active", true)
    .or(`topic_id.is.null,topic_id.eq.${topicId ?? "00000000-0000-0000-0000-000000000000"}`)
    .order("version", { ascending: false }).limit(20);
  if (error) throw new ApiError(500, "DATABASE_ERROR", "Không tải được prompt template.", error.message);
  const items = data ?? [];
  const matching =
    items.find((item: { topic_id?: string | null; specialization_id?: string | null }) => item.topic_id === topicId && item.specialization_id === specializationId && specializationId !== null && specializationId !== undefined) ??
    items.find((item: { topic_id?: string | null; specialization_id?: string | null }) => item.topic_id === topicId && !item.specialization_id) ??
    items.find((item: { topic_id?: string | null; specialization_id?: string | null }) => !item.topic_id && !item.specialization_id);
  if (!matching) throw new ApiError(500, "PROMPT_NOT_CONFIGURED", `Chưa cấu hình prompt cho mục đích ${purpose}.`);
  return matching;
}

export async function generateLlm(request: LlmRequest): Promise<LlmResult> {
  const provider = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();
  const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
  const started = Date.now();
  if (provider === "mock") {
    // Static outputs for every purpose, including OCR, until real providers are wired in.
    const value = mockResponse(request);
    const raw = JSON.stringify(value);
    return { value, raw, provider: "mock", model: "documind-deterministic", latencyMs: Date.now() - started };
  }
  if (provider !== "gemini") throw new ApiError(500, "UNSUPPORTED_LLM_PROVIDER", "LLM_PROVIDER chỉ nhận mock hoặc gemini.");
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ApiError(503, "LLM_KEY_MISSING", "LLM_PROVIDER=gemini nhưng chưa điền GEMINI_API_KEY.");
  // Section blocks intentionally accept text, tables, diagrams, formulas and
  // explicitly tagged JSON. Gemini's constrained JSON schema cannot express that
  // union reliably, so sections are validated and repaired by our server schema.
  const responseSchema = request.purpose === "section_generation" || request.purpose === "repair"
    ? undefined
    : geminiSchema(request.schema);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: "user", parts: [
        { text: request.prompt },
        ...(request.media ? [{ inlineData: { mimeType: request.media.mimeType, data: request.media.base64Data } }] : []),
      ] }],
      generationConfig: { responseMimeType: "application/json", ...(responseSchema ? { responseSchema } : {}), temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(request.timeoutMs ?? 90_000),
  });
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    error?: { message?: string };
  };
  if (!response.ok) throw new ApiError(502, "LLM_PROVIDER_ERROR", payload.error?.message ?? `Gemini API error (${response.status}).`);
  const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("") ?? "";
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { value = raw; }
  return {
    value, raw, provider: "gemini", model,
    inputTokens: payload.usageMetadata?.promptTokenCount,
    outputTokens: payload.usageMetadata?.candidatesTokenCount,
    latencyMs: Date.now() - started,
  };
}
