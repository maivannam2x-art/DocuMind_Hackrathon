import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { ApiError } from "@/lib/http";
import { envInt } from "@/lib/db";

export type ExtractedFile = { text: string; mimeType: string; byteSize: number; name: string };

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

export async function extractFile(file: File): Promise<ExtractedFile> {
  const name = file.name || "document";
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const expectedMime = MIME_BY_EXT[extension];
  if (!expectedMime || !["pdf", "docx", "txt"].includes(extension)) {
    throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", "Chỉ hỗ trợ PDF, DOCX và TXT ở phiên bản backend này.");
  }
  const maxBytes = envInt("MAX_UPLOAD_MB", 20) * 1024 * 1024;
  if (file.size > maxBytes) throw new ApiError(413, "FILE_TOO_LARGE", `Mỗi tệp tối đa ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";
  try {
    if (extension === "pdf") text = (await pdfParse(buffer)).text;
    else if (extension === "docx") text = (await mammoth.extractRawText({ buffer })).value;
    else text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } catch (error) {
    throw new ApiError(422, "DOCUMENT_EXTRACTION_FAILED", `Không trích xuất được tệp ${name}.`, error instanceof Error ? error.message : undefined);
  }
  return { name, mimeType: expectedMime, byteSize: file.size, text: normalizeText(text) };
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
  const limit = envInt("MAX_CHUNK_CHARS", 12000);
  const overlap = Math.min(envInt("CHUNK_OVERLAP_CHARS", 500), Math.floor(limit / 4));
  const headingPattern = /^(#{1,6}\s+.+|(?:\d+(?:\.\d+)*[.)]?\s+)[^\n]{2,100})$/gm;
  const headings = Array.from(normalized.matchAll(headingPattern));
  const sections: Array<{ title: string; content: string; start: number }> = [];
  if (!headings.length) sections.push({ title: "Tài liệu", content: normalized, start: 0 });
  else {
    if (headings[0].index && headings[0].index > 0) sections.push({ title: "Mở đầu", content: normalized.slice(0, headings[0].index).trim(), start: 0 });
    for (let i = 0; i < headings.length; i++) {
      const current = headings[i];
      const contentStart = current.index ?? 0;
      const nextStart = headings[i + 1]?.index ?? normalized.length;
      const title = current[0].replace(/^#{1,6}\s+/, "").trim();
      const content = normalized.slice(contentStart, nextStart).trim();
      sections.push({ title, content, start: contentStart });
    }
  }
  const result: TextChunk[] = [];
  for (const section of sections) {
    for (const part of splitLongSection(section.content, section.title, section.start, limit, overlap)) {
      result.push({ ...part, chunkIndex: result.length });
    }
  }
  return result;
}

