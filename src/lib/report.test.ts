import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { reportToDocx, reportToHtml, reportToMarkdown, reportToPdf } from "@/lib/report";

const report = {
  title: "Báo cáo cơ sở dữ liệu",
  summary: "Tóm tắt Unicode: tiếng Việt và transaction.",
  sections: [{ title: "Giao dịch", summary: "Đảm bảo tính toàn vẹn.", blocks: [
    { type: "list", content: ["Atomicity", "Consistency"] },
    { type: "json", contentType: "json" as const, content: { isolation: "serializable" } },
  ] }],
};

describe("report export formats", () => {
  it("renders readable HTML and Markdown with an explicit JSON label", () => {
    expect(reportToMarkdown(report)).toContain("Dữ liệu JSON:");
    expect(reportToHtml(report)).toContain("JSON · dữ liệu có cấu trúc");
    expect(reportToHtml(report)).toContain("Báo cáo cơ sở dữ liệu");
  });

  it("embeds rendered diagram previews in HTML and native images in PDF and Word", async () => {
    const pixelPng = (await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#6248dc"/></svg>')).png().toBuffer()).toString("base64");
    const imageReport = {
      ...report,
      sections: [{ title: "Luồng API", blocks: [{
        type: "diagram",
        contentType: "mermaid" as const,
        content: "sequenceDiagram\nClient->>API: GET",
        metadata: { inlineSvgBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString("base64"), inlinePngBase64: pixelPng, inlinePngWidth: 1, inlinePngHeight: 1 },
      }] }],
    };
    const html = reportToHtml(imageReport);
    expect(html).toContain("data:image/svg+xml;base64,");
    const pdf = await reportToPdf(imageReport);
    const docx = await reportToDocx(imageReport);
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(docx.toString("latin1")).toContain("word/media/");
    expect(docx.toString("latin1")).toContain(".png");
  });

  it("creates valid PDF and DOCX file containers", async () => {
    const pdf = await reportToPdf(report);
    const docx = await reportToDocx(report);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(docx.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(pdf.length).toBeGreaterThan(1000);
    expect(docx.length).toBeGreaterThan(1000);
  });
});
