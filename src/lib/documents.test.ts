import { afterEach, describe, expect, it, vi } from "vitest";
import { chunkText, extractFile, mimeTypeForFilename, normalizeText } from "@/lib/documents";
import { Document, Packer, Paragraph } from "docx";
import { reportToPdf } from "@/lib/report";
import sharp from "sharp";

const originalProvider = process.env.LLM_PROVIDER;
const originalKey = process.env.GEMINI_API_KEY;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalProvider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = originalProvider;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
});

describe("document preparation", () => {
  it("normalizes line endings, control characters, and repeated whitespace", () => {
    expect(normalizeText(" A\r\nB\u0001  C\n\n\nD ")).toBe("A\nB C\n\nD");
  });

  it("extracts Markdown and source-code files as normalized UTF-8 text", async () => {
    const markdown = new File(["# API Design\r\n\r\nRoutes and schemas"], "api-design.md", { type: "text/markdown" });
    const source = new File(["export const answer = 42;"], "answer.ts", { type: "text/typescript" });

    await expect(extractFile(markdown)).resolves.toMatchObject({
      name: "api-design.md",
      mimeType: "text/markdown",
      text: "# API Design\n\nRoutes and schemas",
    });
    await expect(extractFile(source)).resolves.toMatchObject({
      name: "answer.ts",
      mimeType: "text/typescript",
      text: "export const answer = 42;",
    });
  });

  it("maps supported raster images and rejects unknown file extensions", () => {
    expect(mimeTypeForFilename("diagram.PNG")).toBe("image/png");
    expect(mimeTypeForFilename("formula.jpeg")).toBe("image/jpeg");
    expect(mimeTypeForFilename("archive.exe")).toBeNull();
  });

  it("uses Gemini Vision to extract text, formulas, and diagram code from an image", async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    const vision = { text: "TCP thiết lập kết nối qua ba bước.", visualDescription: "SYN, SYN-ACK và ACK theo thứ tự.", formulas: ["RTT = t_2 - t_1"], diagramSource: "sequenceDiagram\nA->>B: SYN" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(vision) }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 18 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([pngSignature], "network-diagram.png", { type: "image/png" });

    const extracted = await extractFile(file);
    expect(extracted.text).toContain("TCP thiết lập kết nối");
    expect(extracted.text).toContain("$$RTT = t_2 - t_1$$");
    expect(extracted.text).toContain("```mermaid");
    expect(extracted.metadata).toMatchObject({ extraction: "gemini_vision", formulaCount: 1, hasDiagram: true });
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { contents: Array<{ parts: Array<{ inlineData?: { mimeType: string; data: string } }> }> };
    expect(request.contents[0].parts[1].inlineData?.mimeType).toBe("image/png");
    expect(request.contents[0].parts[1].inlineData?.data).toBe(pngSignature.toString("base64"));
  });

  it("returns a setup error when image OCR is requested while the mock provider is active", async () => {
    process.env.LLM_PROVIDER = "mock";
    const file = new File([pngSignature], "network.png", { type: "image/png" });
    await expect(extractFile(file)).rejects.toMatchObject({ status: 503, code: "VISION_PROVIDER_REQUIRED" });
  });

  it("rejects files whose extension does not match their binary signature", async () => {
    const file = new File(["not a png"], "broken.png", { type: "image/png" });
    await expect(extractFile(file)).rejects.toMatchObject({ status: 422, code: "FILE_CONTENT_MISMATCH" });
  });

  it("keeps headings as chunk titles and covers all content", () => {
    const chunks = chunkText("# Part one\nA useful paragraph.\n\n## Part two\nAnother useful paragraph.");
    expect(chunks.map(chunk => chunk.title)).toEqual(["Part one", "Part two"]);
    expect(chunks.map(chunk => chunk.content).join("\n")).toContain("Another useful paragraph.");
  });

  it("splits long text into bounded overlapping chunks", () => {
    const previous = { limit: process.env.MAX_CHUNK_CHARS, overlap: process.env.CHUNK_OVERLAP_CHARS };
    process.env.MAX_CHUNK_CHARS = "200";
    process.env.CHUNK_OVERLAP_CHARS = "20";
    const source = "This is a sentence with enough content. ".repeat(30);
    const chunks = chunkText(source);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.content.length <= 200)).toBe(true);
    if (previous.limit === undefined) delete process.env.MAX_CHUNK_CHARS; else process.env.MAX_CHUNK_CHARS = previous.limit;
    if (previous.overlap === undefined) delete process.env.CHUNK_OVERLAP_CHARS; else process.env.CHUNK_OVERLAP_CHARS = previous.overlap;
  });

  it("extracts real PDF and DOCX IT documents, then chunks their text", async () => {
    const paragraph = "TCP connection handshake uses SYN, SYN-ACK, and ACK before ESTABLISHED. ";
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ text: paragraph.repeat(30) })] }] }));
    const docxResult = await extractFile(new File([Uint8Array.from(docx)], "network.docx"));
    expect(docxResult.text).toContain("SYN-ACK");
    expect(chunkText(docxResult.text).length).toBeGreaterThan(0);

    const pdf = await reportToPdf({ title: "Mạng máy tính", sections: [{ title: "TCP", blocks: [{ type: "paragraph", content: paragraph.repeat(10) }] }] });
    const pdfResult = await extractFile(new File([Uint8Array.from(pdf)], "network.pdf"));
    expect(pdfResult.text).toContain("SYN-ACK");
  });

  it("covers a near-limit long IT document through bounded ordered chunks", () => {
    const content = Array.from({ length: 180 }, (_, i) => `## Phần ${i + 1}: PostgreSQL index\nB-tree giúp truy vấn WHERE nhanh hơn trong ví dụ ${i + 1}. ${"EXPLAIN ANALYZE cho biết query plan và chi phí thực thi. ".repeat(40)}`).join("\n\n");
    const chunks = chunkText(content);
    expect(content.length).toBeGreaterThan(400_000);
    expect(chunks.length).toBeGreaterThan(40);
    expect(chunks.every(chunk => chunk.content.length <= 12_000)).toBe(true);
    expect(chunks.at(-1)?.content).toContain("ví dụ 180");
    expect(chunks.every((chunk, index) => index === 0 || chunk.charStart >= chunks[index - 1].charStart)).toBe(true);
  });

  it("sends a real JPEG image to Gemini Vision and retains OCR formula", async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).jpeg().toBuffer();
    const vision = { text: "Độ phức tạp thuật toán O(n log n)", visualDescription: "Biểu đồ tăng trưởng", formulas: ["T(n)=n\\log n"], diagramSource: "" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(vision) }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const extracted = await extractFile(new File([Uint8Array.from(image)], "complexity.jpg"));
    expect(extracted.text).toContain("$$T(n)=n\\log n$$");
    expect(extracted.metadata).toMatchObject({ extraction: "gemini_vision", formulaCount: 1 });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
  });
});
