import { afterEach, describe, expect, it, vi } from "vitest";
import { chunkText, extractFile, mimeTypeForFilename, normalizeText, outlineText } from "@/lib/documents";
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
    expect(extracted.text).toContain("$$\nRTT = t_2 - t_1\n$$");
    expect(extracted.text).toContain("```mermaid");
    expect(extracted.metadata).toMatchObject({ extraction: "gemini_vision", readingOrderPreserved: true, visualBlockCount: 3 });
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
    expect(outlineText("# Part one\nA useful paragraph.\n\n## Part two\nAnother useful paragraph.")[0].children[0].title).toBe("Part two");
    expect(chunks).toHaveLength(1); // Short headings do not spend a model call each.
    expect(chunks.map(chunk => chunk.content).join("\n")).toContain("Another useful paragraph.");
  });

  it("recognizes Roman parents and alphabetic children while ignoring numbered prose", () => {
    const source = `Giới thiệu về mạng máy tính.\nI. Giao thức mạng\nA. TCP handshake\nSYN, SYN-ACK và ACK.\nB. Kiểm soát lỗi\nGói tin được kiểm tra.\n1.5 milliseconds is the RTT measurement.\nII. Cơ sở dữ liệu\nA. MVCC\nDữ liệu đồng thời.\nB. Index\nB-tree index tìm kiếm nhanh.`;
    const nodes = outlineText(source);
    expect(nodes.map(node => node.title)).toEqual(["Mở đầu", "I. Giao thức mạng", "II. Cơ sở dữ liệu"]);
    expect(nodes[1].children.map(node => node.title)).toEqual(["A. TCP handshake", "B. Kiểm soát lỗi"]);
    expect(nodes[2].children.map(node => node.title)).toEqual(["A. MVCC", "B. Index"]);
    expect(nodes[1].end).toBe(nodes[2].start);
    expect(chunkText(source)).toHaveLength(1);
    expect(chunkText(source)[0].content).toContain("1.5 milliseconds");
  });

  it("uses a sequential A/B/C or 1/2/3 outline, but does not treat isolated numeric lines as headings", () => {
    const alphabetic = outlineText("A. Kiến trúc hệ thống\nAPI gateway.\nB. Dữ liệu\nPostgreSQL.\nC. Triển khai\nVercel.");
    expect(alphabetic.map(node => node.title)).toEqual(["A. Kiến trúc hệ thống", "B. Dữ liệu", "C. Triển khai"]);
    const numeric = outlineText("1. Giao thức TCP\nNội dung một.\n1.1. Handshake\nBa bước.\n2. Giao thức UDP\nNội dung hai.");
    expect(numeric.map(node => node.title)).toEqual(["1. Giao thức TCP", "2. Giao thức UDP"]);
    expect(numeric[0].children[0].title).toBe("1.1. Handshake");
    const mixed = outlineText("1. Kiến trúc\nNội dung của chương.\nA. Gateway\nXử lý request.\nB. Service\nXử lý nghiệp vụ.\n2. Dữ liệu\nNội dung chương hai.");
    expect(mixed.map(node => node.title)).toEqual(["1. Kiến trúc", "2. Dữ liệu"]);
    expect(mixed[0].children.map(node => node.title)).toEqual(["A. Gateway", "B. Service"]);
    expect(outlineText("1.5 milliseconds is the RTT.\nMột câu khác mô tả thời gian.")).toHaveLength(1);
    const firstAlphabetic = outlineText("A. Thiết kế\nMô tả.\nB. Triển khai\nI. Ví dụ trích dẫn\nII. Ví dụ tiếp theo\nNội dung.");
    expect(firstAlphabetic.map(node => node.title)).toEqual(["A. Thiết kế", "B. Triển khai"]);
  });

  it("keeps small headings and typed visual source together for one AI request", () => {
    const source = "I. Thuật toán\nA. Công thức\n$$T(n)=n\\log n$$\nB. Sơ đồ\n```mermaid\nflowchart TD\n A-->B\n```\nII. Kết quả\nA. Giải thích\nThời gian chạy tuyến tính.";
    const chunks = chunkText(source);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("$$T(n)=n\\log n$$");
    expect(chunks[0].content).toContain("```mermaid");
  });

  it("keeps a long IT chapter hierarchy and splits at children before the hard character limit", () => {
    const paragraph = "Request đi qua gateway, auth, service rồi tới PostgreSQL. ".repeat(16);
    const source = [
      "I. Kiến trúc API", "Mở đầu về dịch vụ và hợp đồng API.",
      "A. Vòng đời request", paragraph,
      "1. Kiểm tra token", "JWT được xác minh trước khi truy cập dữ liệu.",
      "2. Gọi service", paragraph,
      "B. Bảo mật", "Ghi log truy cập và kiểm tra quyền.",
      "1.5 milliseconds is the latency measurement.",
      "II. Lưu trữ dữ liệu", "PostgreSQL giữ transaction và index.",
      "A. Mô hình quan hệ", paragraph,
      "1.1. Khóa ngoại", "Khóa ngoại đảm bảo toàn vẹn tham chiếu.",
      "1.2 Chỉ mục", paragraph,
      "B. Giao dịch", paragraph,
    ].join("\n");
    const oldLimit = process.env.MAX_CHUNK_CHARS;
    process.env.MAX_CHUNK_CHARS = "1500";
    try {
      const normalized = normalizeText(source);
      const tree = outlineText(source);
      expect(tree.map(node => node.title)).toEqual(["I. Kiến trúc API", "II. Lưu trữ dữ liệu"]);
      expect(tree[0].children.map(node => node.title)).toEqual(["A. Vòng đời request", "B. Bảo mật"]);
      expect(tree[0].children[0].children.map(node => node.title)).toEqual(["1. Kiểm tra token", "2. Gọi service"]);
      expect(tree[1].children[0].children.map(node => node.title)).toEqual(["1.1. Khóa ngoại", "1.2 Chỉ mục"]);
      const titles = (nodes: typeof tree): string[] => nodes.flatMap(node => [node.title, ...titles(node.children)]);
      expect(titles(tree)).not.toContain("1.5 milliseconds is the latency measurement.");
      expect(tree[0].end).toBe(tree[1].start);

      const chunks = chunkText(source);
      expect(chunks.length).toBeGreaterThan(2);
      expect(chunks.every(chunk => chunk.content.length <= 1500)).toBe(true);
      expect(chunks.some(chunk => chunk.title.includes("II. Lưu trữ dữ liệu › A. Mô hình quan hệ"))).toBe(true);
      expect(chunks.some(chunk => chunk.content.includes("1.5 milliseconds"))).toBe(true);
      expect(chunks.every(chunk => normalized.slice(chunk.charStart, chunk.charEnd).trim() === chunk.content)).toBe(true);
      let covered = 0;
      for (const chunk of chunks) {
        expect(chunk.charStart).toBeLessThanOrEqual(covered); // overlap is fine, missing text is not
        covered = Math.max(covered, chunk.charEnd);
      }
      expect(covered).toBe(normalized.length);
    } finally {
      if (oldLimit === undefined) delete process.env.MAX_CHUNK_CHARS; else process.env.MAX_CHUNK_CHARS = oldLimit;
    }
  });

  it("does not turn numbered short list items into chapters without body text", () => {
    const source = "1. TCP\n2. UDP\n3. HTTP\nĐây là một danh sách thuật ngữ, sau đó là đoạn giải thích giao thức mạng.";
    expect(outlineText(source)).toHaveLength(1);
    expect(outlineText(source)[0].title).toBe("Tài liệu");
  });

  it("does not mix two substantial Roman chapters in one AI request", () => {
    const sentence = "API kiểm tra quyền rồi giao service lưu transaction trong PostgreSQL. ";
    const source = [
      "I. Kiến trúc hệ thống", "A. Gateway", sentence.repeat(65), "B. Service", sentence.repeat(65),
      "II. Cơ sở dữ liệu", "A. Chỉ mục", sentence.repeat(60), "B. Giao dịch", sentence.repeat(60),
    ].join("\n");
    const chunks = chunkText(source);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].title).toBe("I. Kiến trúc hệ thống");
    expect(chunks[1].title).toBe("II. Cơ sở dữ liệu");
    expect(chunks[0].content).not.toContain("II. Cơ sở dữ liệu");
    expect(chunks[1].content).toContain("B. Giao dịch");
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
    expect(chunks.length).toBeGreaterThan(33); // 400k+ characters still require bounded requests.
    expect(chunks.every(chunk => chunk.content.length <= 12_000)).toBe(true);
    expect(chunks.at(-1)?.content).toContain("ví dụ 180");
    expect(chunks.every((chunk, index) => index === 0 || chunk.charStart >= chunks[index - 1].charStart)).toBe(true);
  });

  it("preserves 12 large Roman chapters and nested IT headings across about 400k characters", () => {
    const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
    const block = "Gateway nhận request; service kiểm tra dữ liệu và thực hiện transaction trong PostgreSQL. ".repeat(120);
    const content = roman.map((mark, index) => [
      `${mark}. Chương ${index + 1} về hệ thống IT`, `Giới thiệu chương ${index + 1}.`,
      "A. Kiến trúc", block,
      "1. Kiểm tra đầu vào", "Validation kiểm tra schema và phản hồi lỗi có cấu trúc.",
      "2. Xử lý nghiệp vụ", block,
      "B. Dữ liệu", block,
    ].join("\n")).join("\n");
    expect(content.length).toBeGreaterThan(300_000);
    const tree = outlineText(content);
    expect(tree).toHaveLength(12);
    expect(tree[0].children.map(node => node.title)).toEqual(["A. Kiến trúc", "B. Dữ liệu"]);
    expect(tree[11].title).toContain("XII.");
    const chunks = chunkText(content);
    expect(chunks.length).toBeGreaterThan(24);
    expect(chunks.every(chunk => chunk.content.length <= 12_000)).toBe(true);
    expect(chunks.some(chunk => chunk.title.includes("XII. Chương 12"))).toBe(true);
    const normalized = normalizeText(content);
    let end = 0;
    for (const chunk of chunks) {
      expect(chunk.charStart).toBeLessThanOrEqual(end);
      end = Math.max(end, chunk.charEnd);
    }
    expect(end).toBe(normalized.length);
  });

  it("sends a real JPEG image to Gemini Vision and retains OCR formula", async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).jpeg().toBuffer();
    const vision = { text: "Độ phức tạp thuật toán O(n log n)", visualDescription: "Biểu đồ tăng trưởng", formulas: ["T(n)=n\\log n"], diagramSource: "" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(vision) }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const extracted = await extractFile(new File([Uint8Array.from(image)], "complexity.jpg"));
    expect(extracted.text).toContain("$$\nT(n)=n\\log n\n$$");
    expect(extracted.metadata).toMatchObject({ extraction: "gemini_vision", readingOrderPreserved: true, visualBlockCount: 2 });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
  });
});
