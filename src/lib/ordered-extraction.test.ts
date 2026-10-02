import { afterEach, describe, expect, it, vi } from "vitest";
import { Document, ImageRun, Packer, Paragraph } from "docx";
import JSZip from "jszip";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractFile, extractFileStep, chunkText } from "@/lib/documents";
import type { ExtractionProgress } from "@/lib/ordered-extraction";
import { sourceContentBlocks, preserveSourceVisuals } from "@/lib/source-content";

const provider = process.env.LLM_PROVIDER, key = process.env.GEMINI_API_KEY;
afterEach(() => { vi.unstubAllGlobals(); process.env.LLM_PROVIDER = provider ?? "mock"; if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; });
function mockVision(values: unknown[]) {
  process.env.LLM_PROVIDER = "gemini"; process.env.GEMINI_API_KEY = "test-key";
  const mock = vi.fn();
  for (const value of values) mock.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 }));
  vi.stubGlobal("fetch", mock); return mock;
}

describe("ordered mixed document extraction", () => {
  it("reads native Word chart data in its document position instead of dropping the drawing", async () => {
    const zip = await JSZip.loadAsync(await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Before chart."), new Paragraph("Chart token"), new Paragraph("After chart.")] }] })));
    const xml = (await zip.file("word/document.xml")!.async("string")).replace("<w:t xml:space=\"preserve\">Chart token</w:t>", '<w:drawing xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><a:graphic><a:graphicData><c:chart r:id="rIdChartQA"/></a:graphicData></a:graphic></w:drawing>');
    expect(xml).toContain("rIdChartQA"); zip.file("word/document.xml", xml);
    zip.file("word/_rels/document.xml.rels", (await zip.file("word/_rels/document.xml.rels")!.async("string")).replace("</Relationships>", '<Relationship Id="rIdChartQA" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/></Relationships>'));
    zip.file("word/charts/chart1.xml", '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:ser><c:tx><c:v>API latency</c:v></c:tx><c:val><c:numLit><c:pt idx="0"><c:v>42</c:v></c:pt></c:numLit></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>');
    const mock = mockVision([{ blocks: [{ kind: "table", content: "| Metric | Value |\n| --- | --- |\n| API latency | 42 |" }] }]);
    const result = await extractFile(new File([Uint8Array.from(await zip.generateAsync({ type: "nodebuffer" }))], "chart.docx"));
    expect(mock).toHaveBeenCalledTimes(1);
    expect(result.text.indexOf("Before chart")).toBeLessThan(result.text.indexOf("API latency"));
    expect(result.text.indexOf("API latency")).toBeLessThan(result.text.indexOf("After chart"));
    const request = JSON.parse(String(mock.mock.calls[0][1].body)); expect(request.contents[0].parts[0].text).toContain("<c:v>42</c:v>");
  });
  it("preserves four DOCX image positions, skips a photo and converts Office Math in place", async () => {
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).png().toBuffer();
    const paragraphs = Array.from({ length: 4 }, (_, i) => [new Paragraph(`Before figure ${i + 1}.`), new Paragraph({ children: [new ImageRun({ data: image, type: "png", transformation: { width: 32, height: 32 } })] }), new Paragraph(`After figure ${i + 1}.`)]).flat();
    const zip = await JSZip.loadAsync(await Packer.toBuffer(new Document({ sections: [{ children: paragraphs }] })));
    const xml = (await zip.file("word/document.xml")!.async("string")).replace("</w:body>", '<w:p><w:r><w:t>Before native math.</w:t></w:r><m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>x+1</m:t></m:r></m:oMath><w:r><w:t>After native math.</w:t></w:r></w:p></w:body>');
    zip.file("word/document.xml", xml);
    const mock = mockVision([
      { blocks: [{ kind: "mermaid", content: "flowchart TD\nA[Input] --> B[Validate]" }] },
      { blocks: [{ kind: "illustration", content: "A landscape photo" }] },
      { blocks: [{ kind: "latex", content: "T(n)=n\\log n" }] },
      { blocks: [{ kind: "description", content: "Unclear chart axes; numbers unreadable." }] },
      { blocks: [{ kind: "latex", content: "x+1" }] },
    ]);
    const file = new File([Uint8Array.from(await zip.generateAsync({ type: "nodebuffer" }))], "mixed.docx");
    let value = await extractFileStep(file);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(value.complete).toBe(false);
    expect(value.text.indexOf("Before figure 1")).toBeLessThan(value.text.indexOf("```mermaid"));
    expect(value.text.indexOf("```mermaid")).toBeLessThan(value.text.indexOf("After figure 1"));
    while (!value.complete) value = await extractFileStep(file, value.metadata?.extractionProgress as ExtractionProgress, value.text);
    expect(mock).toHaveBeenCalledTimes(5);
    expect(value.text).not.toContain("landscape");
    expect(value.metadata).toMatchObject({ skippedIllustrations: 1, readingOrderPreserved: true });
    expect(value.text.indexOf("After figure 2")).toBeLessThan(value.text.indexOf("T(n)"));
    expect(value.text.indexOf("T(n)")).toBeLessThan(value.text.indexOf("After figure 3"));
    expect(value.text.indexOf("Before native math")).toBeLessThan(value.text.indexOf("x+1"));
    expect(value.text.indexOf("x+1")).toBeLessThan(value.text.indexOf("After native math"));
    expect(value.metadata?.ocrWarnings).toEqual(expect.arrayContaining([expect.stringContaining("chỉ có mô tả")]));
  });

  it("reads every PDF page including a page with text and an embedded diagram; resumes without duplication", async () => {
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
    const png = await pdf.embedPng(await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).png().toBuffer());
    const first = pdf.addPage(); first.drawText("Before diagram. This PDF has a substantial text layer.", { x: 40, y: 700, font, size: 12 }); first.drawImage(png, { x: 40, y: 600, width: 50, height: 50 }); first.drawText("After diagram.", { x: 40, y: 500, font, size: 12 });
    pdf.addPage().drawText("Page two.", { x: 40, y: 700, font, size: 12 });
    const mock = mockVision([{ blocks: [{ kind: "text", content: "Before diagram." }, { kind: "mermaid", content: "flowchart TD\nA --> B" }, { kind: "text", content: "After diagram." }] }, { blocks: [{ kind: "text", content: "Page two." }, { kind: "latex", content: "x^2" }] }]);
    const file = new File([Uint8Array.from(await pdf.save())], "mixed.pdf");
    const step = await extractFileStep(file);
    expect(step.complete).toBe(false); expect(mock).toHaveBeenCalledTimes(1);
    const final = await extractFileStep(file, step.metadata?.extractionProgress as ExtractionProgress, step.text);
    expect(final.complete).toBe(true); expect(mock).toHaveBeenCalledTimes(2);
    expect(final.text.match(/Before diagram/g)).toHaveLength(1);
    expect(final.text.indexOf("Before diagram")).toBeLessThan(final.text.indexOf("```mermaid"));
    expect(final.text.indexOf("After diagram")).toBeLessThan(final.text.indexOf("Page two"));
    for (const [, args] of mock.mock.calls) {
      const body = JSON.parse(String(args.body));
      const pageBytes = Buffer.from(body.contents[0].parts[1].inlineData.data, "base64");
      expect((await PDFDocument.load(pageBytes)).getPageCount()).toBe(1);
    }
  });

  it("rejects invalid Vision JSON rather than silently losing an image", async () => {
    mockVision([{ blocks: [{ kind: "diagram", content: "untyped" }] }]);
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    await expect(extractFile(new File([Uint8Array.from(png)], "diagram.png"))).rejects.toMatchObject({ code: "VISION_INVALID_RESPONSE" });
  });

  it("keeps complete diagram/formula source in one chunk and restores visuals omitted by the analysis model", () => {
    const old = process.env.MAX_CHUNK_CHARS; process.env.MAX_CHUNK_CHARS = "500";
    try {
      const diagram = "```mermaid\nflowchart TD\nA[Input] --> B[Validate]\n```";
      const math = "$$\nT(n)=n\\log n\n$$";
      const source = `${"A paragraph about APIs. ".repeat(19)}\n${diagram}\n${math}\n${"A paragraph about data. ".repeat(20)}`;
      const chunks = chunkText(source);
      expect(chunks.some(chunk => chunk.content.includes(diagram))).toBe(true);
      expect(chunks.some(chunk => chunk.content.includes(math))).toBe(true);
      expect(chunks.every(chunk => chunk.content.length <= 500)).toBe(true);
      const preserved = preserveSourceVisuals({ sections: [{ title: "Summary", blocks: [{ type: "paragraph", content: "The API validates inputs." }] }] }, source, "Chapter I");
      expect(preserved.sections.at(-1)?.blocks.map(block => (block as {contentType?: string}).contentType)).toEqual(["mermaid", "latex"]);
      expect(sourceContentBlocks(source).filter(block => block.contentType === "latex")[0].content).toBe("T(n)=n\\log n");
    } finally { if (old === undefined) delete process.env.MAX_CHUNK_CHARS; else process.env.MAX_CHUNK_CHARS = old; }
  });
});
