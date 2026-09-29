import { getAdminDb } from "@/lib/db";
import { ApiError } from "@/lib/http";

export type LlmPurpose = "section_generation" | "quiz_generation" | "chat" | "repair" | "topic_detection";
export type LlmRequest = { purpose: LlmPurpose; system: string; prompt: string; schema?: unknown };
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
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      generationConfig: { responseMimeType: "application/json", ...(responseSchema ? { responseSchema } : {}), temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(90_000),
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

function mockResponse(request: LlmRequest): unknown {
  const prompt = request.prompt;
  if (request.purpose === "topic_detection") {
    const text = (prompt.match(/Nội dung:\s*([\s\S]+)$/)?.[1] ?? prompt).toLowerCase();
    const candidates: Array<[string, RegExp]> = [
      ["databases", /\b(sql|database|databases|postgres|mysql|mongodb|cơ sở dữ liệu|truy vấn|index|transaction)\b/i],
      ["cybersecurity", /\b(cybersecurity|security|owasp|encryption|authentication|authorization|bảo mật|an ninh mạng|mật mã)\b/i],
      ["cloud-devops", /\b(cloud|devops|docker|kubernetes|ci\/cd|deployment|hạ tầng|container)\b/i],
      ["computer-networks", /\b(computer network|tcp\/ip|tcp|http|dns|routing|mạng máy tính|giao thức mạng)\b/i],
      ["artificial-intelligence", /\b(ai|machine learning|deep learning|llm|neural network|trí tuệ nhân tạo|học máy)\b/i],
      ["data-structures-algorithms", /\b(algorithm|data structure|big o|độ phức tạp|giải thuật|cấu trúc dữ liệu)\b/i],
      ["software-testing", /\b(unit test|integration test|testing|test case|kiểm thử|kiểm tra phần mềm)\b/i],
      ["operating-systems", /\b(operating system|linux kernel|process|thread|memory management|hệ điều hành|tiến trình)\b/i],
      ["programming-languages", /\b(python|javascript|typescript|java|c\+\+|golang|rust|lập trình|source code|mã nguồn)\b/i],
      ["web-development", /\b(frontend|backend|web development|react|next\.js|html|css|rest api|phát triển web)\b/i],
    ];
    const detected = candidates.find(([, pattern]) => pattern.test(text));
    if (!detected) return { isIT: false, specializationSlug: null, detectedTopic: "Chủ đề chưa xác định hoặc ngoài IT", confidence: 0.35, reason: "Không tìm thấy đủ thuật ngữ đặc trưng để gán chuyên ngành IT; dùng prompt chung." };
    return { isIT: true, specializationSlug: detected[0], detectedTopic: "Công nghệ thông tin", confidence: 0.86, reason: "Tìm thấy thuật ngữ kỹ thuật IT trong tài liệu." };
  }
  if (request.purpose === "chat") {
    const question = prompt.match(/Câu hỏi:\s*([\s\S]+)$/)?.[1]?.trim() ?? "câu hỏi của bạn";
    return { answer: `Theo tài liệu đã phân tích, ${question} Hãy tham khảo các section liên quan trong kết quả để xem phần giải thích và nguồn cụ thể.`, citations: ["analysis_result"] };
  }
  if (request.purpose === "quiz_generation") {
    const source = prompt.match(/Nội dung:\s*([\s\S]+)$/)?.[1] ?? prompt;
    const sentences = source.split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(x => x.length > 30);
    const make = (sentence: string, index: number) => ({
      prompt: `Theo tài liệu, phát biểu nào mô tả đúng nội dung ở câu ${index + 1}?`,
      options: [sentence.slice(0, 160), "Nội dung này không được đề cập trong nguồn.", "Tài liệu đưa ra kết luận ngược lại.", "Không có thông tin liên quan."],
      answerIndex: 0,
      explanation: "Đáp án được trích từ đoạn nội dung nguồn.",
      difficulty: index === 0 ? "easy" : "medium",
    });
    const questions = (sentences.length ? sentences : [source.slice(0, 140) || "Tài liệu cung cấp kiến thức nền tảng."]).slice(0, 3).map(make);
    return { questions };
  }
  if (request.purpose === "repair") return { sections: [{ title: "Tài liệu", blocks: [{ type: "paragraph", content: "Nội dung mô phỏng đã được chuẩn hóa." }] }] };
  const body = prompt.match(/Nội dung:\s*([\s\S]+)$/)?.[1] ?? prompt;
  const lines = body.split(/\n+/).map(value => value.trim()).filter(Boolean);
  const title = lines[0]?.replace(/^#+\s*/, "").slice(0, 100) || "Nội dung tài liệu";
  const paragraphs = lines.filter(line => line !== lines[0]).slice(0, 4);
  const content = paragraphs.length ? paragraphs.join("\n\n") : body.slice(0, 1500);
  const sections = [
    { title: "Ý chính", summary: "Các ý trọng tâm được rút ra từ phần tài liệu này.", blocks: [{ type: "summary", content }] },
    { title: "Giải thích", blocks: [{ type: "paragraph", content: `Phần này diễn giải nội dung “${title}” theo cách ngắn gọn, bám sát nguồn đầu vào.` }, { type: "key_points", content: paragraphs.slice(0, 3) }] },
  ];
  return { title, summary: `Tóm tắt phần ${title} dựa trên nội dung đã cung cấp.`, sections };
}
