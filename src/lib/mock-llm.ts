// Static stand-in for the LLM provider (LLM_PROVIDER=mock). Outputs follow the
// same JSON contracts as Gemini so the whole flow — OCR review, analysis, quiz,
// chat and exports — can be exercised without keys. Replace per purpose when
// the real integrations are ready; nothing here is presented as model output.
import type { LlmRequest } from "@/lib/llm";
import { buildStaticQuiz, hashSeed, keyTerms, sourceSentences } from "@/lib/static-quiz";

export const MOCK_OCR_NOTICE = "Chế độ mô phỏng: nội dung hình là dữ liệu mẫu tĩnh, chưa phải kết quả OCR thật. Hãy sửa lại cho khớp với ảnh trước khi xác nhận.";

const TRAILING_INSTRUCTION = /\.\s*Trả (?:JSON|kết quả)[^\n]*$/;

/** Extracts the rendered {{content}} part from any of the seeded prompt templates. */
export function promptSource(prompt: string) {
  const positioned = prompt.match(/Vị trí trong tài liệu:[^\n]*\n\n([\s\S]+?)(?:\n\nQUY TẮC CẤU TRÚC NGUỒN[\s\S]*)?$/)?.[1];
  const labelled = prompt.match(/(?:Nội dung nguồn|Nội dung|Tài liệu và code nguồn|Văn bản|Nguồn|nội dung sau):\s*([\s\S]+)$/)?.[1];
  return (positioned ?? labelled ?? prompt).replace(TRAILING_INSTRUCTION, "").trim();
}

function detectTopic(prompt: string) {
  const text = promptSource(prompt).toLowerCase();
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

const OCR_SAMPLES = [
  [
    { kind: "text", content: "API Gateway là điểm vào duy nhất của hệ thống. Gateway xác thực JWT, giới hạn tần suất gọi và định tuyến request tới service phù hợp." },
    { kind: "mermaid", content: "flowchart LR\n  Client[Client] -->|HTTPS| Gateway[API Gateway]\n  Gateway -->|JWT hợp lệ| Order[Order Service]\n  Gateway -->|JWT hợp lệ| User[User Service]\n  Gateway -->|401| Client" },
    { kind: "table", content: "| Thành phần | Vai trò |\n| --- | --- |\n| API Gateway | Xác thực và định tuyến |\n| Order Service | Xử lý đơn hàng |\n| User Service | Quản lý tài khoản |" },
  ],
  [
    { kind: "text", content: "Merge sort là thuật toán sắp xếp theo chiến lược chia để trị. Mảng được chia đôi đệ quy rồi trộn hai nửa đã sắp xếp." },
    { kind: "latex", content: "T(n) = 2T\\left(\\frac{n}{2}\\right) + O(n) \\Rightarrow T(n) = O(n \\log n)" },
    { kind: "code", content: "function mergeSort(a) {\n  if (a.length < 2) return a;\n  const mid = a.length >> 1;\n  return merge(mergeSort(a.slice(0, mid)), mergeSort(a.slice(mid)));\n}" },
  ],
  [
    { kind: "text", content: "Khóa chính là thuộc tính định danh duy nhất mỗi bản ghi. Khóa ngoại tham chiếu tới khóa chính của bảng khác để biểu diễn quan hệ." },
    { kind: "mermaid", content: "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ ORDER_ITEM : contains\n  PRODUCT ||--o{ ORDER_ITEM : listed_in" },
    { kind: "table", content: "| Bảng | Khóa chính | Khóa ngoại |\n| --- | --- | --- |\n| CUSTOMER | customer_id | — |\n| ORDER | order_id | customer_id |\n| ORDER_ITEM | (order_id, product_id) | order_id, product_id |" },
  ],
];

function mockOcr(request: LlmRequest) {
  const prompt = request.prompt;
  if (prompt.startsWith("Chuyển biểu thức Office Math")) return { blocks: [{ kind: "latex", content: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" }] };
  const name = prompt.match(/Nguồn ([^:\n]+):|Đọc ([^.\n]+)\./)?.slice(1).find(Boolean)?.trim() ?? "hình ảnh";
  const sample = OCR_SAMPLES[hashSeed(name + (request.media?.base64Data.slice(0, 64) ?? "")) % OCR_SAMPLES.length];
  if (prompt.startsWith("Đọc cấu trúc OOXML")) return { blocks: sample.filter(block => block.kind === "mermaid" || block.kind === "table").slice(0, 1) };
  return { blocks: [
    { kind: "heading", content: `Nội dung nhận diện từ ${name} (mô phỏng)` },
    { kind: "text", content: `[${MOCK_OCR_NOTICE}]` },
    ...sample,
  ] };
}

/** Collects readable strings from the serialized result and tags each with its section title. */
function contextPassages(prompt: string) {
  const passages: Array<{ title: string; text: string }> = [];
  let title = "Tổng quan";
  for (const match of prompt.matchAll(/"(title|summary|content|lead|detail|text)":"((?:[^"\\]|\\.)*)"/g)) {
    let value: string;
    try { value = JSON.parse(`"${match[2]}"`) as string; } catch { continue; }
    if (match[1] === "title") { title = value; continue; }
    for (const sentence of sourceSentences(value)) passages.push({ title, text: sentence });
  }
  return passages;
}

function tokens(value: string) {
  return value.toLocaleLowerCase("vi").normalize("NFC").split(/[^\p{L}\p{N}_]+/u).filter(token => token.length >= 2 && !["là", "gì", "và", "của", "có", "không", "nào", "như", "thế", "cho", "the", "what", "how"].includes(token));
}

function mockChat(prompt: string) {
  const question = (prompt.match(/Câu hỏi(?: của người học)?:\s*([\s\S]+)$/)?.[1] ?? "").replace(TRAILING_INSTRUCTION, "").trim() || "câu hỏi của bạn";
  const passages = contextPassages(prompt);
  const wanted = new Set(tokens(question));
  const ranked = passages
    .map((passage, index) => ({ ...passage, index, score: tokens(passage.text).filter(token => wanted.has(token)).length + (tokens(passage.title).some(token => wanted.has(token)) ? 0.5 : 0) }))
    .filter(passage => passage.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const wantsSummary = /tóm tắt|ý chính|quan trọng nhất|tổng quan/i.test(question);
  const picked = (wantsSummary && passages.length ? passages.slice(0, 3) : ranked.slice(0, 3)).filter((passage, index, list) => list.findIndex(other => other.text === passage.text) === index);
  if (!picked.length) {
    const titles = Array.from(new Set(passages.map(passage => passage.title))).slice(0, 3);
    return {
      answer: `Mình chưa tìm thấy đoạn nào trong tài liệu nói trực tiếp về “${question}”.${titles.length ? ` Bạn có thể hỏi cụ thể hơn về: ${titles.join("; ")}.` : ""}\n\n(Chế độ mô phỏng: câu trả lời được ghép từ câu trong tài liệu, chưa dùng mô hình AI.)`,
      citations: [],
    };
  }
  return {
    answer: `${wantsSummary ? "Những ý chính trong tài liệu:" : "Theo tài liệu:"}\n${picked.map(passage => `• ${passage.text}`).join("\n")}\n\n(Chế độ mô phỏng: câu trả lời được ghép từ câu trong tài liệu, chưa dùng mô hình AI.)`,
    citations: Array.from(new Set(picked.map(passage => passage.title))),
  };
}

function mockSections(prompt: string) {
  const body = promptSource(prompt);
  const lines = body.split(/\n+/).map(value => value.trim()).filter(Boolean);
  const title = lines[0]?.replace(/^#+\s*/, "").slice(0, 100) || "Nội dung tài liệu";
  const typed: Array<{ type: string; contentType: string; content: string }> = [];
  for (const match of body.matchAll(/```(mermaid|plantuml|latex|tex)\s*\n([\s\S]*?)```/gi)) {
    const language = match[1].toLowerCase();
    typed.push({ type: language === "latex" || language === "tex" ? "formula" : "diagram", contentType: language === "tex" ? "latex" : language, content: match[2].trim() });
  }
  for (const match of body.matchAll(/```(?!mermaid|plantuml|latex|tex)[\w-]*\s*\n([\s\S]*?)```/gi)) {
    if (match[1].trim()) typed.push({ type: "code", contentType: "code", content: match[1].trim() });
  }
  for (const match of body.matchAll(/\$\$([\s\S]*?)\$\$/g)) {
    if (match[1].trim()) typed.push({ type: "formula", contentType: "latex", content: match[1].trim() });
  }
  for (const match of body.matchAll(/(?:^\|.*\|[ \t]*\n){2,}/gm)) typed.push({ type: "table", contentType: "table", content: match[0].trim() });
  // Demo mode keeps the whole chunk text so long documents do not silently lose
  // content; fenced blocks and tables are surfaced separately as typed blocks.
  const prose = body.replace(/```[\s\S]*?```/g, "").replace(/\$\$[\s\S]*?\$\$/g, "").replace(/(?:^\|.*\|[ \t]*\n?){2,}/gm, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 12000);
  const sentences = sourceSentences(prose);
  const terms = keyTerms(prose).slice(0, 6);
  const summary = sentences.slice(0, 2).join(" ").slice(0, 400) || `Nội dung nguồn của phần ${title}.`;
  const sections = [
    { title, summary, blocks: [
      ...(sentences.length > 2 ? [{ type: "key_points", content: sentences.slice(0, 5) }] : []),
      ...(prose ? [{ type: "paragraph", content: prose }] : []),
      ...typed,
    ] },
    ...(terms.length >= 2 ? [{ title: `${title} — Thuật ngữ cần nhớ`, summary: `Các thuật ngữ xuất hiện nổi bật trong phần “${title}”.`, blocks: [{ type: "list", content: terms }] }] : []),
  ];
  if (!sections[0].blocks.length) sections[0].blocks.push({ type: "paragraph", content: body.slice(0, 12000) || title });
  return { title, summary: `Bản mô phỏng: ${summary}`, sections };
}

export function mockResponse(request: LlmRequest): unknown {
  const prompt = request.prompt;
  switch (request.purpose) {
    case "topic_detection": return detectTopic(prompt);
    case "document_ocr": return mockOcr(request);
    case "chat": return mockChat(prompt);
    case "quiz_generation": {
      const source = promptSource(prompt);
      const instructions = prompt.slice(0, Math.max(0, prompt.lastIndexOf(source)));
      const count = Number(instructions.match(/(\d+)\s*câu/)?.[1] ?? 3);
      return { questions: buildStaticQuiz(source, Math.min(Math.max(count, 1), 10)) };
    }
    case "repair": return { sections: [{ title: "Tài liệu", blocks: [{ type: "paragraph", content: "Nội dung mô phỏng đã được chuẩn hóa." }] }] };
    case "overview_generation": return null;
    default: return mockSections(prompt);
  }
}
