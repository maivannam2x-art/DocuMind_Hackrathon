import { describe, expect, it } from "vitest";
import sharp from "sharp";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import JSZip from "jszip";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  reportToDocx,
  reportToHtml,
  reportToMarkdown,
  reportToPdf,
} from "@/lib/report";

const report = {
  title: "Báo cáo cơ sở dữ liệu",
  summary: "Tóm tắt Unicode: tiếng Việt và transaction.",
  conclusion: "Kiểm soát transaction bằng ràng buộc và kiểm tra trạng thái.",
  sections: [
    {
      title: "Giao dịch",
      summary: "Đảm bảo tính toàn vẹn.",
      blocks: [
        { type: "list", content: ["Atomicity", "Consistency"] },
        {
          type: "json",
          contentType: "json" as const,
          content: { isolation: "serializable" },
        },
      ],
    },
  ],
};

describe("report export formats", () => {
  it("exports typed tables as actual Word/HTML tables and retains all cells in PDF", async () => {
    const tableReport = {
      title: "So sánh giao thức",
      sections: [
        {
          title: "TCP và UDP",
          blocks: [
            {
              type: "table",
              contentType: "table" as const,
              content: {
                headers: ["Giao thức", "Đặc điểm"],
                rows: [
                  ["TCP", "Kiểm soát lỗi và thứ tự"],
                  ["UDP", "Không bảo đảm giao nhận"],
                ],
              },
            },
          ],
        },
      ],
    };
    expect(reportToHtml(tableReport)).toContain("<thead>");
    expect(reportToMarkdown(tableReport)).toContain(
      "| TCP | Kiểm soát lỗi và thứ tự |",
    );
    const zip = await JSZip.loadAsync(await reportToDocx(tableReport));
    expect(await zip.file("word/document.xml")!.async("string")).toContain(
      "<w:tbl>",
    );
    const pdf = await pdfParse(
      new Uint8Array(await reportToPdf(tableReport)) as Buffer,
    );
    expect(pdf.text).toContain("Kiểm soát lỗi và thứ tự");
    expect(pdf.text).toContain("Không bảo đảm giao nhận");
  });
  it("renders readable HTML and Markdown with an explicit JSON label", () => {
    expect(reportToMarkdown(report)).toContain("Dữ liệu JSON:");
    expect(reportToMarkdown(report)).toContain("## Kết luận");
    expect(reportToMarkdown(report)).toContain(report.conclusion);
    expect(reportToHtml(report)).toContain("JSON · dữ liệu có cấu trúc");
    expect(reportToHtml(report)).toContain(report.conclusion);
    expect(reportToHtml(report)).toContain("Báo cáo cơ sở dữ liệu");
  });

  it("renders formulas as MathML in standalone HTML exports", () => {
    const html = reportToHtml({
      title: "Độ trễ TCP",
      sections: [
        {
          title: "RTT",
          blocks: [
            { type: "formula", contentType: "latex", content: "RTT=t_2-t_1" },
          ],
        },
      ],
    });
    expect(html).toContain("<math");
    expect(html).toContain("formula-export");
    expect(html).not.toContain('<pre class="source">RTT=t_2-t_1');
  });

  it("embeds formula images in PDF and Word rather than only LaTeX source", async () => {
    const formulaReport = {
      title: "Độ trễ",
      sections: [
        {
          title: "RTT",
          blocks: [
            {
              type: "formula",
              contentType: "latex" as const,
              content: "RTT=t_2-t_1",
            },
          ],
        },
      ],
    };
    const pdf = await reportToPdf(formulaReport);
    const docx = await reportToDocx(formulaReport);
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(docx.toString("latin1")).toContain("word/media/");
  });

  it("embeds rendered diagram previews in HTML and native images in PDF and Word", async () => {
    const pixelPng = (
      await sharp(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#6248dc"/></svg>',
        ),
      )
        .png()
        .toBuffer()
    ).toString("base64");
    const imageReport = {
      ...report,
      sections: [
        {
          title: "Luồng API",
          blocks: [
            {
              type: "diagram",
              contentType: "mermaid" as const,
              content: "sequenceDiagram\nClient->>API: GET",
              metadata: {
                inlineSvgBase64: Buffer.from(
                  '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
                ).toString("base64"),
                inlinePngBase64: pixelPng,
                inlinePngWidth: 1,
                inlinePngHeight: 1,
              },
            },
          ],
        },
      ],
    };
    const html = reportToHtml(imageReport);
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("data:image/svg+xml;base64,");
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
    await expect(
      mammoth.extractRawText({ buffer: docx }),
    ).resolves.toMatchObject({
      value: expect.stringContaining(report.conclusion),
    });
  });

  it("keeps Vietnamese typography and image/formula rendering across every format", async () => {
    const png = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#7257e8"/><circle cx="80" cy="45" r="27" fill="#fff"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    const visualReport = {
      title: "Tổng quan thuật toán và cơ sở dữ liệu",
      summary:
        "Tóm tắt: dữ liệu đầu vào được kiểm tra, lưu trữ và xử lý có cấu trúc.",
      conclusion:
        "Kết luận: kiểm thử công thức, sơ đồ và hình ảnh trước khi chia sẻ.",
      sections: [
        {
          title: "I. Kiến trúc xử lý",
          summary: "Độ trễ và luồng dữ liệu.",
          blocks: [
            {
              type: "diagram",
              contentType: "mermaid" as const,
              content: "flowchart LR\nA[Đầu vào] --> B[Xử lý]",
              metadata: {
                inlineSvgBase64: Buffer.from(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"></svg>',
                ).toString("base64"),
                inlinePngBase64: png.toString("base64"),
                inlinePngWidth: 160,
                inlinePngHeight: 90,
              },
            },
            {
              type: "image",
              contentType: "image" as const,
              content: "Ảnh nguồn",
              metadata: {
                alt: "Hình minh họa kiến trúc",
                caption: "Hình nguồn",
                inlinePngBase64: png.toString("base64"),
                inlinePngWidth: 160,
                inlinePngHeight: 90,
              },
            },
            {
              type: "formula",
              contentType: "latex" as const,
              content: "T_{avg}=\\frac{1}{n}\\sum_{i=1}^{n}T_i",
            },
            {
              type: "diagram",
              contentType: "mermaid" as const,
              content: "flowchart LR\nA-->[",
            },
          ],
        },
      ],
    };
    const [pdf, docx] = await Promise.all([
      reportToPdf(visualReport),
      reportToDocx(visualReport),
    ]);
    const [html, markdown] = [
      reportToHtml(visualReport),
      reportToMarkdown(visualReport),
    ];
    expect(html).toContain('alt="Hình minh họa kiến trúc"');
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("<math");
    expect(html).toContain("flowchart LR\nA--&gt;[");
    expect(markdown).toContain("```mermaid");
    expect(markdown).toContain("$$");
    expect(
      pdf.toString("latin1").match(/\/Subtype \/Image/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    const extractedPdf = await pdfParse(new Uint8Array(pdf) as Buffer);
    expect(extractedPdf.text).toContain(
      "Tổng quan thuật toán và cơ sở dữ liệu",
    );
    expect(extractedPdf.text).toContain(
      "dữ liệu đầu vào được kiểm tra, lưu trữ và xử lý",
    );
    expect(extractedPdf.text).toContain(
      "Kết luận: kiểm thử công thức, sơ đồ và hình ảnh",
    );
    const zip = await JSZip.loadAsync(docx);
    const styles = await zip.file("word/styles.xml")!.async("string");
    expect(styles).toContain('w:ascii="Arial"');
    expect(styles).toContain('w:eastAsia="Arial"');
    expect(
      Object.keys(zip.files).filter(
        (name) => name.startsWith("word/media/") && name.endsWith(".png"),
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      (await zip.file("word/document.xml")!.async("string")).match(
        /<wp:inline\b/g,
      )?.length,
    ).toBeGreaterThanOrEqual(3);
    expect((await mammoth.extractRawText({ buffer: docx })).value).toContain(
      "Kiến trúc xử lý",
    );
    const outputDir = process.env.REPORT_VISUAL_OUTPUT_DIR;
    if (outputDir) {
      await mkdir(outputDir, { recursive: true });
      await Promise.all([
        writeFile(path.join(outputDir, "documind-export.pdf"), pdf),
        writeFile(path.join(outputDir, "documind-export.docx"), docx),
        writeFile(path.join(outputDir, "documind-export.html"), html),
        writeFile(path.join(outputDir, "documind-export.md"), markdown),
        writeFile(
          path.join(outputDir, "documind-export.json"),
          JSON.stringify(visualReport, null, 2),
        ),
      ]);
    }
  });
});

it("does not label human-readable lists as raw JSON in report exports", async () => {
  const report = {
    title: "IT",
    sections: [
      {
        title: "Khái niệm",
        blocks: [
          {
            type: "list",
            contentType: "json" as const,
            content: [{ title: "API", detail: "Giao diện lập trình ứng dụng" }],
          },
        ],
      },
    ],
  };
  expect(reportToHtml(report)).toContain("<li>API:");
  expect(reportToMarkdown(report)).toContain("- API:");
  const pdf = await reportToPdf(report);
  const value = await pdfParse(new Uint8Array(pdf) as Buffer);
  expect(value.text).not.toContain("JSON");
  expect(value.text).toContain("Giao diện lập trình ứng dụng");
});
