import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { ApiError } from "@/lib/http";
import { envInt } from "@/lib/db";
import { generateLlm } from "@/lib/llm";

export type ExtractedFile = { text: string; mimeType: string; byteSize: number; name: string; metadata?: Record<string, unknown> };

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  js: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  py: "text/x-python",
  java: "text/x-java-source",
  sql: "application/sql",
  html: "text/html",
  css: "text/css",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  sh: "application/x-sh",
  go: "text/x-go",
  rs: "text/x-rust",
  c: "text/x-c",
  cpp: "text/x-c++",
  h: "text/x-c",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function mimeTypeForFilename(name: string) {
  return MIME_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

function verifyFileSignature(extension: string, buffer: Buffer) {
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (extension === "png" && !isPng) throw new ApiError(422, "FILE_CONTENT_MISMATCH", "Tệp có đuôi PNG nhưng dữ liệu không phải ảnh PNG hợp lệ.");
  if (["jpg", "jpeg"].includes(extension) && !isJpeg) throw new ApiError(422, "FILE_CONTENT_MISMATCH", "Tệp có đuôi JPG nhưng dữ liệu không phải ảnh JPEG hợp lệ.");
  if (extension === "pdf" && !isPdf) throw new ApiError(422, "FILE_CONTENT_MISMATCH", "Tệp không có cấu trúc PDF hợp lệ.");
  if (extension === "docx" && !isZip) throw new ApiError(422, "FILE_CONTENT_MISMATCH", "Tệp DOCX không có cấu trúc Office hợp lệ.");
}

const OCR_SCHEMA = {
  type: "object",
  required: ["text", "visualDescription", "formulas", "diagramSource"],
  properties: {
    text: { type: "string", description: "Văn bản nhìn thấy trong tài liệu, giữ đúng thứ tự và chính tả." },
    visualDescription: { type: "string", description: "Mô tả ngắn gọn sơ đồ, biểu đồ hoặc hình minh họa có ý nghĩa." },
    formulas: { type: "array", items: { type: "string" }, description: "Công thức toán dưới dạng LaTeX, không tự suy diễn." },
    diagramSource: { type: "string", description: "Mã Mermaid hợp lệ nếu sơ đồ có thể chuyển thành Mermaid; để trống nếu không phù hợp." },
  },
};

async function extractVisual(buffer: Buffer, mimeType: string, name: string) {
  const maxVisionBytes = envInt("MAX_VISION_MB", 8) * 1024 * 1024;
  if (buffer.length > maxVisionBytes) {
    throw new ApiError(413, "VISION_FILE_TOO_LARGE", `Tệp ảnh cần OCR phải nhỏ hơn ${Math.floor(maxVisionBytes / 1024 / 1024)} MB.`);
  }
  const result = await generateLlm({
    purpose: "document_ocr",
    system: "Bạn là bộ trích xuất tài liệu chính xác. Không bịa nội dung. Chép nguyên văn chữ, giữ cấu trúc bảng, ký hiệu và ngôn ngữ gốc. Viết công thức dưới dạng LaTeX. Mô tả sơ đồ theo đúng quan hệ nhìn thấy; chỉ sinh Mermaid khi có thể biểu diễn trung thực. Trả đủ các trường trong schema.",
    prompt: `Đọc tệp “${name}”. Trích xuất chữ nhìn thấy, công thức, bảng và mô tả sơ đồ/biểu đồ. Nếu tài liệu không có một loại nội dung nào thì trả chuỗi rỗng hoặc mảng rỗng.`,
    schema: OCR_SCHEMA,
    media: { mimeType, base64Data: buffer.toString("base64") },
    timeoutMs: 30_000,
  });
  const value = result.value && typeof result.value === "object" ? result.value as Record<string, unknown> : null;
  if (!value) throw new ApiError(502, "VISION_INVALID_RESPONSE", "Bộ đọc ảnh trả về dữ liệu không đúng định dạng. Hãy thử lại hoặc nhập văn bản thủ công.");
  const pieces: string[] = [];
  if (typeof value.text === "string" && value.text.trim()) pieces.push(value.text.trim());
  const formulas = Array.isArray(value.formulas) ? value.formulas.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 30) : [];
  if (formulas.length) pieces.push(`Công thức nhận diện:\n${formulas.map(formula => `$$${formula.trim()}$$`).join("\n")}`);
  if (typeof value.diagramSource === "string" && value.diagramSource.trim()) pieces.push(`Sơ đồ nhận diện (Mermaid):\n\`\`\`mermaid\n${value.diagramSource.trim()}\n\`\`\``);
  if (typeof value.visualDescription === "string" && value.visualDescription.trim()) pieces.push(`Mô tả hình/sơ đồ: ${value.visualDescription.trim()}`);
  return {
    text: normalizeText(pieces.join("\n\n")),
    metadata: { extraction: "gemini_vision", sourceMimeType: mimeType, hasText: Boolean(value.text), formulaCount: formulas.length, hasDiagram: Boolean(value.diagramSource), hasVisualDescription: Boolean(value.visualDescription) },
  };
}

export async function extractFile(file: File): Promise<ExtractedFile> {
  const name = file.name || "document";
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const expectedMime = MIME_BY_EXT[extension];
  if (!expectedMime) {
    throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", "Chỉ hỗ trợ PDF, DOCX và các tệp văn bản như TXT, Markdown hoặc mã nguồn.");
  }
  const maxBytes = envInt("MAX_UPLOAD_MB", 20) * 1024 * 1024;
  if (file.size > maxBytes) throw new ApiError(413, "FILE_TOO_LARGE", `Mỗi tệp tối đa ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  if (!file.size) throw new ApiError(422, "EMPTY_FILE", `Tệp ${name} đang trống.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  verifyFileSignature(extension, buffer);
  let text = "";
  let metadata: Record<string, unknown> = { extraction: "text_parser" };
  try {
    if (expectedMime.startsWith("image/")) {
      const visual = await extractVisual(buffer, expectedMime, name);
      text = visual.text;
      metadata = visual.metadata;
    } else if (extension === "pdf") {
      // pdf-parse 1.x corrupts the cross-reference offset when handed a Node
      // Buffer on current runtimes. Its PDF.js engine handles plain Uint8Array.
      // The published TypeScript declaration incorrectly requires Buffer.
      text = (await pdfParse(new Uint8Array(buffer) as Buffer)).text;
      if (normalizeText(text).length < 40) {
        const visual = await extractVisual(buffer, expectedMime, name);
        text = visual.text;
        metadata = { ...visual.metadata, extraction: "gemini_vision_pdf_ocr", fallbackReason: "pdf_text_layer_empty" };
      }
    } else if (extension === "docx") {
      text = (await mammoth.extractRawText({ buffer })).value;
      const embedded: Array<{ mimeType: string; data: Buffer }> = [];
      let ignoredEmbeddedImages = 0;
      await mammoth.convertToHtml({ buffer }, {
        convertImage: mammoth.images.imgElement(async image => {
          if (embedded.length >= 3 || !["image/png", "image/jpeg"].includes(image.contentType)) ignoredEmbeddedImages++;
          else embedded.push({ mimeType: image.contentType, data: Buffer.from(await image.read("base64"), "base64") });
          return { src: "" };
        }),
      });
      const imageText: string[] = [];
      const ocrWarnings: string[] = [];
      for (let index = 0; index < embedded.length; index++) {
        try {
          const visual = await extractVisual(embedded[index].data, embedded[index].mimeType, `${name} · hình ${index + 1}`);
          if (visual.text) imageText.push(`Nội dung hình nhúng ${index + 1}:\n${visual.text}`);
        } catch (error) {
          if (error instanceof ApiError && ["VISION_FILE_TOO_LARGE", "VISION_PROVIDER_REQUIRED", "LLM_KEY_MISSING"].includes(error.code)) ocrWarnings.push(error.message);
          else if (error instanceof ApiError) ocrWarnings.push("Một hình nhúng chưa đọc được; có thể chỉnh sửa nội dung ở bước kiểm tra.");
          else throw error;
        }
      }
      if (imageText.length) text = [text, ...imageText].filter(Boolean).join("\n\n");
      metadata = {
        extraction: imageText.length ? "docx_text_and_gemini_vision" : "docx_text_parser",
        embeddedImagesProcessed: embedded.length,
        ignoredEmbeddedImages,
        ...(ocrWarnings.length ? { ocrWarnings } : {}),
      };
    }
    else text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "DOCUMENT_EXTRACTION_FAILED", `Không trích xuất được tệp ${name}.`, error instanceof Error ? error.message : undefined);
  }
  return { name, mimeType: expectedMime, byteSize: file.size, text: normalizeText(text), metadata };
}

export function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type TextChunk = { chunkIndex: number; title: string; content: string; charStart: number; charEnd: number };
export type OutlineNode = { title: string; preview: string; start: number; end: number; children: OutlineNode[] };

type Heading = { title: string; start: number; kind: "markdown" | "roman" | "alpha" | "number"; depth: number; ordinal: number };

function romanValue(value: string) {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < value.length; i++) total += values[value[i]] * (values[value[i]] < (values[value[i + 1]] ?? 0) ? -1 : 1);
  let check = total;
  const canonical = [1000,900,500,400,100,90,50,40,10,9,5,4,1].map((n,i) => {
    const marks = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
    const count = Math.floor(check / n); check %= n; return marks[i].repeat(count);
  }).join("");
  return total > 0 && total <= 3999 && canonical === value ? total : 0;
}

function detectHeadings(text: string): Heading[] {
  const candidates: Heading[] = [];
  let inFence = false;
  let offset = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) inFence = !inFence;
    if (!inFence && trimmed.length <= 125) {
      const md = /^(#{1,6})\s+(.{3,110})$/.exec(trimmed);
      const marked = /^([A-Z]|[IVXLCDM]{2,8}|\d{1,3}(?:\.\d{1,3}){0,3})[.)]\s+(.{3,110})$/.exec(trimmed);
      if (md) candidates.push({ title: md[2], start: offset, kind: "markdown", depth: md[1].length, ordinal: 0 });
      else if (marked && /[\p{L}]/u.test(marked[2]) && !/[.!?;:]$/.test(marked[2])) {
        const marker = marked[1];
        const roman = /^[IVXLCDM]+$/.test(marker) ? romanValue(marker) : 0;
        const kind = /^\d/.test(marker) ? "number" : roman ? "roman" : "alpha";
        candidates.push({ title: trimmed, start: offset, kind, depth: kind === "number" ? marker.split(".").length : 1, ordinal: kind === "number" ? Number(marker.split(".").at(-1)) : roman || marker.charCodeAt(0) - 64 });
      }
    }
    offset += line.length + 1;
  }
  const firstPair = (kind: Heading["kind"]) => {
    const items = candidates.filter(item => item.kind === kind && item.depth === 1);
    const index = items.findIndex((item, i) => i > 0 && item.ordinal === items[i - 1].ordinal + 1);
    return index > 0 ? items[index - 1].start : Number.POSITIVE_INFINITY;
  };
  const qualifies = (kind: Heading["kind"]) => Number.isFinite(firstPair(kind));
  // An explicit Markdown document wins. Otherwise require a sequential pair;
  // an isolated numbered sentence or measurement must never create a section.
  const root = candidates.some(item => item.kind === "markdown") ? "markdown"
    : ([...(["roman", "alpha", "number"] as const)]).sort((a, b) => firstPair(a) - firstPair(b)).find(qualifies);
  if (!root) return [];
  if (qualifies("alpha")) for (const item of candidates) {
    const letter = /^([A-Z])[.)]/.exec(item.title)?.[1];
    if (letter && letter !== "I" && item.kind === "roman" && !(root === "roman" && qualifies("roman") && item.ordinal < 10)) {
      item.kind = "alpha"; item.ordinal = letter.charCodeAt(0) - 64;
    }
  }
  const supported = new Set<Heading["kind"]>([root]);
  if (root === "roman") { if (qualifies("alpha")) supported.add("alpha"); if (qualifies("number")) supported.add("number"); }
  if (root === "alpha") { if (qualifies("roman")) supported.add("roman"); if (qualifies("number")) supported.add("number"); }
  return candidates.filter(item => supported.has(item.kind) && (item.kind !== "number" || item.depth === 1 || root === "number"));
}

export function outlineText(text: string): OutlineNode[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const headings = detectHeadings(normalized);
  if (!headings.length) return [{ title: "Tài liệu", preview: normalized.slice(0, 180), start: 0, end: normalized.length, children: [] }];
  const rootKind = headings[0].kind;
  const rank = (item: Heading) => item.kind === "markdown" ? item.depth : item.kind === rootKind ? item.depth : item.kind === "alpha" ? 2 : 3;
  const roots: OutlineNode[] = [];
  const stack: Array<{ node: OutlineNode; level: number }> = [];
  if (headings[0].start > 0) roots.push({ title: "Mở đầu", preview: normalized.slice(0, headings[0].start).trim().slice(0, 180), start: 0, end: headings[0].start, children: [] });
  for (const heading of headings) {
    const level = rank(heading);
    while (stack.length && stack.at(-1)!.level >= level) stack.pop()!.node.end = heading.start;
    const node: OutlineNode = { title: heading.title, preview: "", start: heading.start, end: normalized.length, children: [] };
    if (stack.length) stack.at(-1)!.node.children.push(node); else roots.push(node);
    stack.push({ node, level });
  }
  const setPreview = (nodes: OutlineNode[]) => nodes.forEach(node => {
    node.preview = normalized.slice(node.start, node.children[0]?.start ?? node.end).replace(/^.*\n?/, "").trim().slice(0, 180);
    setPreview(node.children);
  });
  setPreview(roots);
  return roots;
}

function splitLongSection(text: string, title: string, baseOffset: number, limit: number, overlap: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + limit);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(". ", end), text.lastIndexOf(" ", end));
      if (boundary > cursor + Math.floor(limit * 0.65)) end = boundary + 1;
    }
    const content = text.slice(cursor, end).trim();
    if (content) chunks.push({ chunkIndex: chunks.length, title, content, charStart: baseOffset + cursor, charEnd: baseOffset + end });
    if (end >= text.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
  }
  return chunks;
}

export function chunkText(text: string): TextChunk[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const limit = envInt("MAX_CHUNK_CHARS", 12000);
  const overlap = Math.min(envInt("CHUNK_OVERLAP_CHARS", 500), Math.floor(limit / 4));
  const sections = outlineText(normalized);
  const result: TextChunk[] = [];
  let pending: OutlineNode[] = [];
  const flush = () => {
    if (!pending.length) return;
    const start = pending[0].start, end = pending.at(-1)!.end;
    result.push({ chunkIndex: result.length, title: pending.length === 1 ? pending[0].title : `${pending[0].title} – ${pending.at(-1)!.title}`, content: normalized.slice(start, end).trim(), charStart: start, charEnd: end });
    pending = [];
  };
  for (const section of sections) {
    if (section.end - section.start > limit) {
      flush();
      for (const part of splitLongSection(normalized.slice(section.start, section.end), section.title, section.start, limit, overlap)) result.push({ ...part, chunkIndex: result.length });
    } else {
      if (pending.length && section.end - pending[0].start > limit) flush();
      pending.push(section);
    }
  }
  flush();
  return result;
}
