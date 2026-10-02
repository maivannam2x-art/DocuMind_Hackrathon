import pdfParse from "pdf-parse";
import { ApiError } from "@/lib/http";
import { envInt } from "@/lib/db";
import { MOCK_OCR_NOTICE } from "@/lib/mock-llm";
import { prepareDocx, preparePdf, processExtractionUnit, recognizeSource, serializeSourceBlocks, type ExtractionProgress, type ExtractionUnit } from "@/lib/ordered-extraction";

export type ExtractedFile = { text: string; mimeType: string; byteSize: number; name: string; metadata?: Record<string, unknown> };

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  csv: "text/csv",
  log: "text/plain",
  cs: "text/x-csharp",
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

function isMockProvider() {
  return (process.env.LLM_PROVIDER ?? "mock").toLowerCase() === "mock";
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

export async function extractFileStep(file: File, checkpoint?: ExtractionProgress, previousText = ""): Promise<ExtractedFile & { complete: boolean }> {
  const name = file.name || "document";
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = MIME_BY_EXT[extension];
  if (!mimeType) throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", "Hỗ trợ PDF, DOCX, văn bản/mã nguồn và PNG/JPEG. Word .doc cũ cần chuyển sang .docx.");
  if (file.size > envInt("MAX_UPLOAD_MB", 20) * 1024 * 1024) throw new ApiError(413, "FILE_TOO_LARGE", "Tệp vượt giới hạn tải lên.");
  if (!file.size) throw new ApiError(422, "EMPTY_FILE", `Tệp ${name} đang trống.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  verifyFileSignature(extension, buffer);
  try {
    // Deterministic tests/demo can still read a text-only PDF. Production Gemini
    // reads every page, including pages that also have a complete text layer.
    if (extension === "pdf" && isMockProvider()) {
      const text = normalizeText(joinPdfHyphenation((await pdfParse(new Uint8Array(buffer) as Buffer)).text));
      if (text.length < 40) {
        // Scanned PDF without a text layer: use the static OCR sample so the review flow stays usable.
        const scanned = normalizeText(serializeSourceBlocks(await recognizeSource({ name })));
        return { name, mimeType, byteSize: file.size, text: scanned, complete: true, metadata: { extraction: "pdf_scan_mock", ocrWarnings: [MOCK_OCR_NOTICE] } };
      }
      return { name, mimeType, byteSize: file.size, text, complete: true, metadata: { extraction: "pdf_text_demo", ocrWarnings: ["Chế độ demo chỉ đọc lớp chữ của PDF; hình cần Gemini."] } };
    }
    if (extension !== "pdf" && extension !== "docx" && !mimeType.startsWith("image/")) return {
      name, mimeType, byteSize: file.size, text: normalizeText(new TextDecoder("utf-8").decode(buffer)), complete: true, metadata: { extraction: "text_parser" },
    };
    const prepared = extension === "pdf" ? await preparePdf(buffer) : null;
    const word = extension === "docx" ? await prepareDocx(buffer) : null;
    const units: ExtractionUnit[] = prepared?.units ?? word?.units ?? [{ kind: "image", data: buffer, mimeType }];
    const state: ExtractionProgress = checkpoint?.version === 2 ? { ...checkpoint, warnings: [...checkpoint.warnings] } : {
      version: 2, nextUnit: 0, totalUnits: units.length, skippedIllustrations: 0, visualBlocks: 0, warnings: word?.warnings ?? [],
    };
    if (state.totalUnits !== units.length || state.nextUnit < 0 || state.nextUnit > units.length) throw new ApiError(409, "EXTRACTION_SOURCE_CHANGED", "Cấu trúc tệp thay đổi. Hãy tải lại tệp để đọc từ đầu.");
    const pieces = previousText ? [previousText] : [];
    let modelCalls = 0;
    for (; state.nextUnit < units.length; state.nextUnit++) {
      const unit = units[state.nextUnit];
      if (unit.kind !== "text" && modelCalls >= 1) break;
      const blocks = await processExtractionUnit(unit, name, prepared?.pdf);
      if (unit.kind !== "text") modelCalls++;
      if (unit.kind !== "text" && isMockProvider() && !state.warnings.includes(MOCK_OCR_NOTICE)) state.warnings.push(MOCK_OCR_NOTICE);
      state.skippedIllustrations += blocks.filter(block => block.kind === "illustration").length;
      state.visualBlocks += blocks.filter(block => ["latex", "mermaid", "description"].includes(block.kind)).length;
      if (blocks.some(block => block.kind === "description")) state.warnings.push(`Đơn vị ${state.nextUnit + 1}: một sơ đồ/công thức chỉ có mô tả; cần đối chiếu nguồn.`);
      const content = serializeSourceBlocks(blocks);
      if (content) pieces.push(content);
    }
    const text = normalizeText(pieces.join("\n\n"));
    if (text.length > envInt("MAX_ANALYSIS_CHARS", 500000)) throw new ApiError(413, "EXTRACTED_TEXT_TOO_LONG", "Văn bản sau trích xuất vượt giới hạn. Hãy tách tài liệu.");
    const complete = state.nextUnit === units.length;
    return { name, mimeType, byteSize: file.size, text, complete, metadata: {
      extraction: extension === "pdf" ? "pdf_ordered_vision" : extension === "docx" ? "docx_ordered" : "gemini_vision",
      extractionProgress: state, readingOrderPreserved: true, skippedIllustrations: state.skippedIllustrations,
      visualBlockCount: state.visualBlocks, ...(state.warnings.length ? { ocrWarnings: state.warnings } : {}),
      ...(extension === "pdf" ? { pageCount: units.length, pagesProcessed: state.nextUnit } : {}),
    } };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "DOCUMENT_EXTRACTION_FAILED", `Không đọc được cấu trúc tệp ${name}. Hãy kiểm tra tệp hoặc chuyển sang PDF/DOCX hợp lệ.`, error instanceof Error ? error.message : undefined);
  }
}

export async function extractFile(file: File): Promise<ExtractedFile> {
  let value = await extractFileStep(file);
  while (!value.complete) value = await extractFileStep(file, value.metadata?.extractionProgress as ExtractionProgress, value.text);
  return value;
}

export function normalizeText(value: string) {
  return value
    // PDF text layers often carry decomposed Vietnamese (NFD); compose so search,
    // keyword matching and fonts treat "ạ" as one character.
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\uFEFF\u200B-\u200D\u2060\u00AD]/g, "")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    // Keep leading indentation (Python/YAML/code blocks); collapse runs elsewhere.
    .split("\n").map(line => {
      const indent = /^[ \t]*/.exec(line)![0];
      return indent.replace(/\t/g, "    ") + line.slice(indent.length).replace(/[ \t]+/g, " ").trimEnd();
    }).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+/, "")
    .trimEnd();
}

/** Joins words split by a hyphen at a PDF line break ("infor-\nmation" → "information"). */
export function joinPdfHyphenation(value: string) {
  return value.replace(/([a-zà-ỹ])-\n([a-zà-ỹ])/g, "$1$2");
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

function detectHeadings(text: string): { headings: Heading[]; rootKind?: Heading["kind"] } {
  const candidates: Heading[] = [];
  let inFence = false;
  let offset = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) inFence = !inFence;
    if (!inFence && trimmed.length <= 125) {
      const md = /^(#{1,6})\s+(.{3,110})$/.exec(trimmed);
      const marked = /^([A-Z]|[IVXLCDM]{2,8}|\d{1,3}(?:\.\d{1,3}){0,3})[.)]\s+(.{3,110})$/.exec(trimmed)
        ?? /^(\d{1,3}(?:\.\d{1,3}){1,3})\s+(.{3,110})$/.exec(trimmed);
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
    const index = items.findIndex((item, i) => {
      if (i === 0 || item.ordinal !== items[i - 1].ordinal + 1) return false;
      if (kind !== "number") return true;
      const firstLineEnd = text.indexOf("\n", items[i - 1].start);
      return firstLineEnd >= 0 && text.slice(firstLineEnd + 1, item.start).trim().length > 0;
    });
    return index > 0 ? items[index - 1].start : Number.POSITIVE_INFINITY;
  };
  const qualifies = (kind: Heading["kind"]) => Number.isFinite(firstPair(kind));
  // An explicit Markdown document wins. Otherwise require a sequential pair;
  // an isolated numbered sentence or measurement must never create a section.
  const root = candidates.some(item => item.kind === "markdown") ? "markdown"
    : ([...(["roman", "alpha", "number"] as const)]).sort((a, b) => firstPair(a) - firstPair(b)).find(qualifies);
  if (!root) return { headings: [] };
  if (qualifies("alpha")) for (const item of candidates) {
    const letter = /^([A-Z])[.)]/.exec(item.title)?.[1];
    if (letter && letter !== "I" && item.kind === "roman" && root !== "roman") {
      item.kind = "alpha"; item.ordinal = letter.charCodeAt(0) - 64;
    }
  }
  const supported = new Set<Heading["kind"]>([root]);
  if (root === "roman") { if (qualifies("alpha")) supported.add("alpha"); if (qualifies("number")) supported.add("number"); }
  if (root === "alpha") { if (qualifies("roman")) supported.add("roman"); if (qualifies("number")) supported.add("number"); }
  if (root === "number" && qualifies("alpha")) supported.add("alpha");
  const numeric = candidates.filter(item => item.kind === "number");
  const acceptedNumeric = new Set<string>();
  if (supported.has("number")) {
    for (const item of numeric.filter(item => item.depth === 1)) acceptedNumeric.add(item.title);
    // A decimal measurement such as "1.5 milliseconds" is not a subsection.
    // Nested numbering needs its parent and must start at .1 or form a sibling sequence.
    for (let depth = 2; depth <= 4; depth++) for (const item of numeric.filter(item => item.depth === depth)) {
      const marker = /^\d+(?:\.\d+)*/.exec(item.title)?.[0] ?? "";
      const parts = marker.split(".");
      const parent = parts.slice(0, -1).join(".");
      const parentPresent = numeric.some(candidate => acceptedNumeric.has(candidate.title) &&
        (/^\d+(?:\.\d+)*/.exec(candidate.title)?.[0] ?? "") === parent);
      const hasSibling = numeric.some(candidate => candidate !== item && candidate.depth === depth &&
        (/^\d+(?:\.\d+)*/.exec(candidate.title)?.[0] ?? "").startsWith(`${parent}.`) &&
        Math.abs(candidate.ordinal - item.ordinal) === 1);
      if (parentPresent && (item.ordinal === 1 || hasSibling)) acceptedNumeric.add(item.title);
    }
  }
  return { rootKind: root, headings: candidates.filter(item => supported.has(item.kind) &&
    (item.kind !== "number" || acceptedNumeric.has(item.title))) };
}

export function outlineText(text: string): OutlineNode[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const { headings, rootKind } = detectHeadings(normalized);
  if (!headings.length) return [{ title: "Tài liệu", preview: normalized.slice(0, 180), start: 0, end: normalized.length, children: [] }];
  const rank = (item: Heading) => item.kind === "markdown" ? item.depth : item.kind === rootKind ? item.depth : item.kind === "alpha" ? 2 : item.kind === "number" ? 2 + item.depth : 3;
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
  const protectedSpans = [...text.matchAll(/```[\s\S]*?```|\$\$[\s\S]*?\$\$/g)].map(match => ({ start: match.index!, end: match.index! + match[0].length }));
  if (protectedSpans.some(span => span.end - span.start > limit)) throw new ApiError(422, "VISUAL_SOURCE_TOO_LONG", "Một khối mã/sơ đồ/công thức vượt giới hạn phần xử lý. Hãy rút gọn hoặc tách khối đó ở bước kiểm tra.");
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + limit);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(". ", end), text.lastIndexOf(" ", end));
      if (boundary > cursor + Math.floor(limit * 0.65)) end = boundary + 1;
      const span = protectedSpans.find(span => span.start < end && span.end > end);
      if (span) end = span.start > cursor ? span.start : span.end;
    }
    const content = text.slice(cursor, end).trim();
    if (content) chunks.push({ chunkIndex: chunks.length, title, content, charStart: baseOffset + cursor, charEnd: baseOffset + end });
    if (end >= text.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
    const span = protectedSpans.find(span => span.start < cursor && span.end > cursor);
    if (span) cursor = span.end;
  }
  return chunks;
}

export function chunkText(text: string): TextChunk[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const limit = envInt("MAX_CHUNK_CHARS", 12000);
  const overlap = Math.min(envInt("CHUNK_OVERLAP_CHARS", 500), Math.floor(limit / 4));
  const minMajorSection = Math.min(Math.max(400, envInt("MIN_MAJOR_SECTION_CHARS", 2500)), Math.floor(limit * 0.6));
  const sections = outlineText(normalized);
  // A heading owns only its introduction; children own the rest of its span.
  // These ordered, non-overlapping pieces preserve the complete source while
  // giving the splitter real subsection boundaries to use before hard limits.
  const pieces: Array<{ title: string; start: number; end: number }> = [];
  const collect = (node: OutlineNode, parents: string[]) => {
    const path = [...parents, node.title];
    const ownEnd = node.children[0]?.start ?? node.end;
    if (ownEnd > node.start) pieces.push({ title: path.join(" › "), start: node.start, end: ownEnd });
    for (const child of node.children) collect(child, path);
  };
  for (const section of sections) collect(section, []);
  const result: TextChunk[] = [];
  let pending: typeof pieces = [];
  const flush = () => {
    if (!pending.length) return;
    const start = pending[0].start, end = pending.at(-1)!.end;
    const paths = pending.map(item => item.title.split(" › "));
    const common = paths[0].filter((part, index) => paths.every(path => path[index] === part));
    const title = common.length ? common.join(" › ") : pending.length === 1 ? pending[0].title : `${pending[0].title} – ${pending.at(-1)!.title}`;
    result.push({ chunkIndex: result.length, title, content: normalized.slice(start, end).trim(), charStart: start, charEnd: end });
    pending = [];
  };
  for (const section of pieces) {
    const pendingRoot = pending[0]?.title.split(" › ")[0];
    const nextRoot = section.title.split(" › ")[0];
    if (pending.length && pendingRoot !== nextRoot && section.start - pending[0].start >= minMajorSection) flush();
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
