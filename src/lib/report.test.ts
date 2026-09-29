import { describe, expect, it } from "vitest";
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

  it("creates valid PDF and DOCX file containers", async () => {
    const pdf = await reportToPdf(report);
    const docx = await reportToDocx(report);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(docx.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(pdf.length).toBeGreaterThan(1000);
    expect(docx.length).toBeGreaterThan(1000);
  });
});
