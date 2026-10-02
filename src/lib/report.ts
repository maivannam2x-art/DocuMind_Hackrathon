import JSZip from "jszip";
import path from "node:path";
import { visualKind, visualSource, type VisualImage } from "@/lib/visual-renderer";
import PDFDocument from "pdfkit";
import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import katex from "katex";
import { renderFormulaPng } from "@/lib/formula";
import {
  isListBlock,
  blockToPlainText,
  listItemText,
  tableValues,
  type ResultBlock,
} from "@/lib/result-content";

export type ReportSection = {
  title: string;
  summary?: string;
  blocks: ResultBlock[];
};
export type ReportDocument = {
  title?: string;
  summary?: string;
  conclusion?: string;
  sections?: ReportSection[];
  /** Binary buffers exist only during export; never persist this field in JSON/database. */
  images?: Map<string, VisualImage>;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char,
  );
}

function isList(block: ResultBlock) {
  return isListBlock(block);
}

function isCode(block: ResultBlock) {
  return (
    block.contentType === "code" ||
    ["code", "sql", "command"].includes(block.type)
  );
}

function isFormula(block: ResultBlock) {
  return (
    block.contentType === "latex" ||
    ["formula", "math", "equation"].includes(block.type)
  );
}

function blockLabel(block: ResultBlock) {
  if (isList(block))
    return block.type === "key_points" ? "Ý chính" : "Danh sách";
  if (block.contentType === "json" || block.type === "json")
    return "JSON · dữ liệu có cấu trúc";
  if (block.contentType === "image" || block.type === "image")
    return "Hình ảnh";
  if (
    block.contentType === "mermaid" ||
    block.type === "mermaid" ||
    block.type === "diagram"
  )
    return "Sơ đồ · mã nguồn";
  if (isFormula(block)) return "Công thức · LaTeX";
  return block.type.replaceAll("_", " ");
}

function isVisual(block: ResultBlock) {
  return (
    block.contentType === "mermaid" ||
    block.type === "mermaid" ||
    block.type === "diagram" ||
    block.contentType === "image" ||
    block.type === "image"
  );
}

function embeddedVisualPng(block: ResultBlock, images?: Map<string, VisualImage>) {
  const image = images?.get(`${visualKind(block)}:${visualSource(block)}`);
  if (image) return image;
  if (!isVisual(block)) return null;
  const encoded =
    typeof block.metadata?.inlinePngBase64 === "string"
      ? block.metadata.inlinePngBase64
      : "";
  if (
    !encoded ||
    encoded.length > 5_600_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    return null;
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length > 4_000_000 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    return null;
  const width = Number(block.metadata?.inlinePngWidth);
  const height = Number(block.metadata?.inlinePngHeight);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > 10000 ||
    height > 10000
  )
    return null;
  return { bytes, width, height };
}

function scaleDiagram(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function markdownBlock(block: ResultBlock) {
  const text = blockToPlainText(block);
  if (visualKind(block) && typeof block.metadata?.assetUrl === "string")
    return `![${isFormula(block) ? "Công thức" : "Sơ đồ"}](${block.metadata.assetUrl})`;
  if (block.contentType === "table" || block.type === "table") {
    const table = tableValues(block.content);
    if (table)
      return [table.headers, table.headers.map(() => "---"), ...table.rows]
        .map(
          (row) =>
            `| ${row.map((cell) => cell.replaceAll("|", "\\|").replaceAll("\n", " ")).join(" | ")} |`,
        )
        .join("\n");
  }
  if (isList(block))
    return (Array.isArray(block.content) ? block.content : [block.content])
      .map((item) => `- ${listItemText(item)}`)
      .join("\n");
  if (isCode(block)) return `\n\`\`\`\n${text}\n\`\`\``;
  if (block.contentType === "mermaid" || block.type === "mermaid")
    return `\n\`\`\`mermaid\n${text}\n\`\`\``;
  if (
    block.contentType === "latex" ||
    ["formula", "math", "equation"].includes(block.type)
  )
    return `\n$$\n${text}\n$$`;
  return text;
}

export function reportToMarkdown(report: ReportDocument) {
  const lines = [
    `# ${report.title || "Báo cáo học tập"}`,
    "",
    report.summary || "",
    "",
  ];
  for (const section of report.sections ?? []) {
    lines.push(`## ${section.title}`, "");
    if (section.summary) lines.push(section.summary, "");
    for (const block of section.blocks ?? [])
      lines.push(markdownBlock(block), "");
  }
  if (report.conclusion) lines.push("## Kết luận", "", report.conclusion, "");
  return lines.join("\n").trim() + "\n";
}

/** Portable Markdown bundle: local PNG paths survive signed-URL expiration. */
export async function reportToMarkdownZip(report: ReportDocument) {
  const zip = new JSZip();
  const names = new Map<string, string>();
  for (const [key, image] of report.images ?? []) {
    const name = `images/visual-${names.size + 1}.png`;
    names.set(key, name);
    zip.file(name, image.bytes);
  }
  const portable = { ...report, sections: report.sections?.map(section => ({ ...section, blocks: section.blocks.map(block => ({ ...block, metadata: { ...block.metadata, assetUrl: names.get(`${visualKind(block)}:${visualSource(block)}`) } })) })) };
  zip.file("report.md", reportToMarkdown(portable));
  zip.file("README.txt", "Giải nén toàn bộ thư mục trước khi mở report.md. Thư mục images chứa ảnh sơ đồ và công thức, không cần Internet hoặc liên kết có thời hạn.");
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function htmlBlock(block: ResultBlock, images?: Map<string, VisualImage>) {
  const text = blockToPlainText(block);
  if (block.contentType === "table" || block.type === "table") {
    const table = tableValues(block.content);
    if (table)
      return `<table style="width:100%;border-collapse:collapse;margin:16px 0"><thead><tr>${table.headers.map((cell) => `<th style="border:1px solid #dedbe8;padding:8px;background:#f4f1fb;text-align:left">${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${table.rows.map((row) => `<tr>${row.map((cell) => `<td style="border:1px solid #dedbe8;padding:8px">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  if (isList(block))
    return `<ul>${(Array.isArray(block.content) ? block.content : [block.content]).map((item) => `<li>${escapeHtml(listItemText(item))}</li>`).join("")}</ul>`;
  const visual = embeddedVisualPng(block, images);
  if (visual) {
    const caption = typeof block.metadata?.caption === "string" ? block.metadata.caption : isFormula(block) ? "Công thức" : block.type === "image" ? "Hình ảnh" : "Sơ đồ";
    return `<figure class="${isFormula(block) ? "formula-export" : "diagram-export"}"><figcaption>${escapeHtml(caption)}</figcaption><img alt="${escapeHtml(String(block.metadata?.alt ?? caption))}" src="data:image/png;base64,${visual.bytes.toString("base64")}"></figure>`;
  }
  if (
    block.contentType === "latex" ||
    ["formula", "math", "equation"].includes(block.type)
  ) {
    const math =
      typeof block.metadata?.latex === "string" ? block.metadata.latex : text;
    const normalized = math.trim().replace(/^\$\$?|\$\$?$/g, "");
    try {
      return `<figure class="formula-export"><figcaption>CÔNG THỨC</figcaption>${katex.renderToString(normalized, { output: "mathml", displayMode: true, throwOnError: true, trust: false })}</figure>`;
    } catch {
      return `<div class="block"><span class="label">CÔNG THỨC · LaTeX</span><pre class="source">${escapeHtml(math)}</pre></div>`;
    }
  }
  const label = blockLabel(block);
  const className =
    isCode(block) ||
    block.contentType === "json" ||
    block.type === "json" ||
    block.contentType === "mermaid"
      ? "source"
      : "content";
  return `<div class="block"><span class="label">${escapeHtml(label)}</span><pre class="${className}">${escapeHtml(text)}</pre></div>`;
}

export function reportToHtml(report: ReportDocument) {
  const conclusion = report.conclusion
    ? `<section class="report-conclusion"><h2>Kết luận</h2><p>${escapeHtml(report.conclusion)}</p></section>`
    : "";
  const sections = (report.sections ?? [])
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.title)}</h2>${section.summary ? `<p class="section-summary">${escapeHtml(section.summary)}</p>` : ""}${(section.blocks ?? []).map(block => htmlBlock(block, report.images)).join("")}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(report.title || "Báo cáo học tập")}</title><style>body{font:16px/1.65 Arial,sans-serif;color:#202235;max-width:920px;margin:48px auto;padding:0 24px}header{border-bottom:1px solid #e4e5ed;padding-bottom:24px;margin-bottom:28px}h1{font-size:32px;margin:0 0 10px}h2{font-size:22px;margin:0 0 12px}section{margin:30px 0}.section-summary{color:#62667b}.report-conclusion{padding:18px;border-left:3px solid #7965dc;background:#f8f7ff;border-radius:0 10px 10px 0}.block{margin:14px 0}.label{display:block;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:#7060c7;font-weight:700;margin-bottom:7px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f7fb;border-radius:8px;padding:14px;font:14px/1.65 ui-monospace,monospace}.content{background:transparent;padding:0;font:inherit}ul{padding-left:24px}.diagram-export,.formula-export{margin:18px 0;padding:16px;border:1px solid #e7e5ef;border-radius:10px;break-inside:avoid}.diagram-export img{display:block;width:100%;height:auto;max-height:720px;object-fit:contain}.diagram-export figcaption,.formula-export figcaption{font-size:11px;color:#7060c7;font-weight:700;margin-bottom:12px}.formula-export img{max-width:100%;max-height:100px;width:auto;height:auto}.formula-export math{display:block;font-size:1.35em}.diagram-export details{margin-top:12px;font-size:12px}@media print{body{margin:0 auto;padding:0 8mm}section{break-inside:avoid}}</style></head><body><header><h1>${escapeHtml(report.title || "Báo cáo học tập")}</h1>${report.summary ? `<p>${escapeHtml(report.summary)}</p>` : ""}</header>${sections}${conclusion}</body></html>`;
}

export async function reportToPdf(report: ReportDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 52, bottom: 52, left: 52, right: 52 },
    bufferPages: true,
  });
  const done = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document.font(path.join(process.cwd(), "public/fonts/DocuMindSans.ttf"));
  document
    .fontSize(22)
    .fillColor("#25243b")
    .text(report.title || "Báo cáo học tập");
  document.moveDown(0.6);
  if (report.summary)
    document
      .fontSize(11)
      .fillColor("#55596c")
      .text(report.summary, { lineGap: 3 });
  for (const section of report.sections ?? []) {
    document.moveDown(1);
    if (document.y > 700) document.addPage();
    document
      .fontSize(16)
      .fillColor("#5646aa")
      .text(section.title, { lineGap: 2 });
    document.moveDown(0.3);
    if (section.summary)
      document
        .fontSize(10)
        .fillColor("#55596c")
        .text(section.summary, { lineGap: 3 });
    for (const block of section.blocks ?? []) {
      if (block.contentType === "table" || block.type === "table") {
        const table = tableValues(block.content);
        if (table && table.headers.length <= 6) {
          const width = 490 / table.headers.length;
          const drawRow = (row: string[], header = false) => {
            document.fontSize(9);
            const height = Math.max(
              24,
              ...row.map(
                (cell) =>
                  document.heightOfString(cell, {
                    width: width - 14,
                    lineGap: 2,
                  }) + 14,
              ),
            );
            if (height > 650) {
              document
                .fontSize(9)
                .fillColor("#303247")
                .text(
                  row
                    .map((cell, i) => `${table.headers[i]}: ${cell}`)
                    .join("\n"),
                  { lineGap: 3 },
                );
              return;
            }
            if (document.y + height > 780) {
              document.addPage();
              if (!header) drawRow(table.headers, true);
            }
            const top = document.y;
            row.forEach((cell, i) => {
              const left = 52 + i * width;
              document
                .save()
                .rect(left, top, width, height)
                .fillAndStroke(header ? "#f4f1fb" : "#ffffff", "#dedbe8")
                .restore();
              document
                .fillColor(header ? "#5646aa" : "#303247")
                .text(cell, left + 7, top + 7, {
                  width: width - 14,
                  lineGap: 2,
                });
            });
            document.x = 52;
            document.y = top + height;
          };
          document.moveDown(0.5);
          drawRow(table.headers, true);
          table.rows.forEach((row) => drawRow(row));
          document.moveDown(0.5);
          continue;
        }
      }
      const visual = embeddedVisualPng(block, report.images);
      if (visual) {
        const size = scaleDiagram(visual.width, visual.height, 490, isFormula(block) ? 64 : 600);
        if (document.y + size.height + 28 > 790) document.addPage();
        document
          .fontSize(8)
          .fillColor("#7568bd")
          .text(
            block.contentType === "image" || block.type === "image"
              ? "HÌNH ẢNH"
              : isFormula(block) ? "CÔNG THỨC" : "SƠ ĐỒ",
          );
        document.moveDown(0.25);
        const imageTop = document.y;
        document.image(visual.bytes, 52, imageTop, size);
        document.y = imageTop + size.height;
        document.moveDown(0.45);
        continue;
      }
      if (isFormula(block)) {
        try {
          const formula = await renderFormulaPng(
            typeof block.metadata?.latex === "string"
              ? block.metadata.latex
              : blockToPlainText(block),
          );
          const size = scaleDiagram(
            formula.width / 3,
            formula.height / 3,
            490,
            120,
          );
          if (document.y + size.height + 32 > 790) document.addPage();
          document.fontSize(8).fillColor("#7568bd").text("CÔNG THỨC");
          document.moveDown(0.3);
          const top = document.y;
          document.image(formula.bytes, 52, top, size);
          document.y = top + size.height;
          document.moveDown(0.45);
          continue;
        } catch {
          /* Preserve the labeled LaTeX source for an invalid formula. */
        }
      }
      const content = markdownBlock(block)
        .replace(/```[a-z]*\n?|```|\$\$\n?/g, "")
        .trim();
      document.moveDown(0.45);
      document
        .fontSize(8)
        .fillColor("#7568bd")
        .text(blockLabel(block).toUpperCase());
      document
        .fontSize(10)
        .fillColor("#303247")
        .text(content, { lineGap: 3, continued: false });
    }
  }
  if (report.conclusion) {
    document.moveDown(0.8);
    document.fontSize(15).fillColor("#5646aa").text("Kết luận");
    document.moveDown(0.25);
    document
      .fontSize(10)
      .fillColor("#303247")
      .text(report.conclusion, { lineGap: 3 });
  }
  document.end();
  return done;
}

export async function reportToDocx(report: ReportDocument): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      text: report.title || "Báo cáo học tập",
      heading: HeadingLevel.TITLE,
    }),
  ];
  if (report.summary) children.push(new Paragraph({ text: report.summary }));
  for (const section of report.sections ?? []) {
    children.push(
      new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
    );
    if (section.summary)
      children.push(new Paragraph({ text: section.summary }));
    for (const block of section.blocks ?? []) {
      if (block.contentType === "table" || block.type === "table") {
        const table = tableValues(block.content);
        if (table) {
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [table.headers, ...table.rows].map(
                (row, i) =>
                  new TableRow({
                    tableHeader: i === 0,
                    children: row.map(
                      (cell) =>
                        new TableCell({ children: [new Paragraph(cell)] }),
                    ),
                  }),
              ),
            }),
          );
          continue;
        }
      }
      const visual = embeddedVisualPng(block, report.images);
      if (visual) {
        const scaled = scaleDiagram(visual.width, visual.height, 520, isFormula(block) ? 64 : 600);
        children.push(
          new Paragraph({
            text:
              block.contentType === "image" || block.type === "image"
                ? "Hình ảnh"
                : isFormula(block) ? "Công thức" : "Sơ đồ",
            heading: HeadingLevel.HEADING_3,
          }),
        );
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: visual.bytes,
                transformation: scaled,
                type: "png",
              }),
            ],
          }),
        );
        continue;
      }
      if (isFormula(block)) {
        try {
          const formula = await renderFormulaPng(
            typeof block.metadata?.latex === "string"
              ? block.metadata.latex
              : blockToPlainText(block),
          );
          const scaled = scaleDiagram(
            formula.width / 2.25,
            formula.height / 2.25,
            520,
            160,
          );
          children.push(
            new Paragraph({
              text: "Công thức",
              heading: HeadingLevel.HEADING_3,
            }),
          );
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: formula.bytes,
                  transformation: scaled,
                  type: "png",
                }),
              ],
            }),
          );
          continue;
        } catch {
          /* Preserve the labeled LaTeX source for an invalid formula. */
        }
      }
      children.push(
        new Paragraph({
          text: blockLabel(block),
          heading: HeadingLevel.HEADING_3,
        }),
      );
      const values =
        isList(block) && Array.isArray(block.content)
          ? block.content.map(listItemText)
          : [blockToPlainText(block)];
      for (const value of values)
        children.push(
          new Paragraph({
            text: value,
            bullet: isList(block) ? { level: 0 } : undefined,
          }),
        );
    }
  }
  if (report.conclusion)
    children.push(
      new Paragraph({ text: "Kết luận", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: report.conclusion }),
    );
  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22, color: "303247" },
          paragraph: { spacing: { after: 140, line: 320 } },
        },
        title: {
          run: { font: "Arial", size: 36, bold: true, color: "25243B" },
          paragraph: { spacing: { after: 240 } },
        },
        heading1: {
          run: { font: "Arial", size: 28, bold: true, color: "5646AA" },
          paragraph: { spacing: { before: 260, after: 120 } },
        },
        heading3: {
          run: { font: "Arial", size: 22, bold: true, color: "7568BD" },
          paragraph: { spacing: { before: 140, after: 80 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
