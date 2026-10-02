import { describe, expect, it } from "vitest";
import sharp from "sharp";
import JSZip from "jszip";
import { mkdir, writeFile } from "node:fs/promises";
import { renderVisual, svgToPng, visualKind, visualSource } from "@/lib/visual-renderer";
import { reportToDocx, reportToHtml, reportToPdf, reportToMarkdown, reportToMarkdownZip } from "@/lib/report";

describe("canonical stored report images", () => {
  it.each([
    "flowchart TD\n A[Đầu vào] --> B{Hợp lệ?}\n B -->|Có| C[Xử lý]\n B -->|Không| D[Báo lỗi]",
    "sequenceDiagram\n participant U as Người dùng\n participant S as Hệ thống\n U->>S: Tài liệu\n S-->>U: Báo cáo",
    "classDiagram\n class Document {\n +String title\n }\n Document --> Result",
    "stateDiagram-v2\n [*] --> Input\n Input --> Done\n Done --> [*]",
    "erDiagram\n DOCUMENT ||--o{ SECTION : contains\n DOCUMENT {\n string title\n }",
  ])("renders server-side Mermaid with real PNG dimensions: %s", async source => {
    const image = await renderVisual("mermaid", source);
    expect(image.bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    const metadata = await sharp(image.bytes).metadata();
    expect(metadata.width).toBe(1800);
    expect(metadata.height).toBeGreaterThan(50);
    const stats = await sharp(image.bytes).stats();
    expect(stats.channels[0].stdev).toBeGreaterThan(5);
  });
  it("uses identical PNGs for HTML, PDF, Word and image references for Markdown", async () => {
    const diagram = "flowchart TD\n A[Đầu vào] --> B[Xử lý]\n B --> C[Kết quả]";
    const math = "T(n)=n\\log_2 n+\\frac{1}{n}";
    const d = await renderVisual("mermaid", diagram);
    const f = await renderVisual("latex", math);
    const report = { title: "Kiểm tra ảnh tiếng Việt", sections: [{ title: "Sơ đồ và công thức", blocks: [
      { type: "mermaid", contentType: "mermaid" as const, content: diagram, metadata: { assetUrl: "https://example.com/diagram.png" } },
      { type: "formula", contentType: "latex" as const, content: math, metadata: { assetUrl: "https://example.com/formula.png" } },
    ] }], images: new Map([[`mermaid:${diagram}`, d], [`latex:${math}`, f]]) };
    const html = reportToHtml(report);
    expect(html.match(/data:image\/png;base64/g)).toHaveLength(2);
    expect(html).not.toContain("<math");
    expect(html).not.toContain("data:image/svg");
    const docx = await reportToDocx(report);
    const zip = await JSZip.loadAsync(docx);
    const images = Object.keys(zip.files).filter(name => name.startsWith("word/media/") && name.endsWith(".png"));
    expect(images).toHaveLength(2);
    const bytes = await Promise.all(images.map(name => zip.file(name)!.async("nodebuffer")));
    expect(bytes.some(b => b.equals(d.bytes))).toBe(true);
    expect(bytes.some(b => b.equals(f.bytes))).toBe(true);
    const bundle = await JSZip.loadAsync(await reportToMarkdownZip(report));
    const markdown = await bundle.file("report.md")!.async("string");
    expect(markdown).toContain("![Công thức](images/visual-2.png)");
    expect(markdown).not.toContain("https://");
    expect((await bundle.file("images/visual-1.png")!.async("nodebuffer")).equals(d.bytes)).toBe(true);
    expect((await bundle.file("images/visual-2.png")!.async("nodebuffer")).equals(f.bytes)).toBe(true);
    const pdf = await reportToPdf(report);
    expect(pdf.toString("latin1").match(/\/Subtype \/Image/g)?.length).toBeGreaterThanOrEqual(2);
    expect(reportToMarkdown(report)).toContain("![Công thức](https://example.com/formula.png)");
    await mkdir("tmp/canonical-images", { recursive: true });
    await Promise.all([writeFile("tmp/canonical-images/report.pdf", pdf),writeFile("tmp/canonical-images/report.docx", docx),writeFile("tmp/canonical-images/report.html", html),writeFile("tmp/canonical-images/diagram.png", d.bytes),writeFile("tmp/canonical-images/formula.png", f.bytes)]);
  });
  it("rasterizes Vietnamese labels in formulas with the bundled font", async () => {
    const image = await renderVisual("latex", "t=\\frac{\\text{Thời gian xử lý}}{n}");
    expect(image.height).toBeGreaterThan(20);
    await writeFile("tmp/canonical-images/vietnamese-formula.png", image.bytes);
  });
  it("rejects unsafe and unsupported diagrams rather than creating a broken successful export", async () => {
    expect(() => svgToPng('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="https://example.com/leak"/></svg>')).toThrow();
    expect(() => svgToPng('<svg viewBox="0 0 1 999999999"><path/></svg>')).toThrow();
    await expect(renderVisual("latex", "\\frac{" )).rejects.toThrow();
    await expect(renderVisual("plantuml", "@startuml\nA -> B\n@enduml")).rejects.toThrow("PlantUML");
  });
  it("recognizes legacy math and strips fenced source consistently", () => {
    expect(visualKind({ type: "equation", content: "x=1" })).toBe("latex");
    expect(visualSource({ type: "mermaid", content: "```mermaid\ngraph TD\nA-->B\n```" })).toBe("graph TD\nA-->B");
  });
});
