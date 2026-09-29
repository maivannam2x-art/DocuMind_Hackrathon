import path from "node:path";
import PDFDocument from "pdfkit";
import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { blockToPlainText, type ResultBlock } from "@/lib/result-content";

export type ReportSection = { title: string; summary?: string; blocks: ResultBlock[] };
export type ReportDocument = { title?: string; summary?: string; sections?: ReportSection[] };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function isList(block: ResultBlock) {
  return block.type === "list" || block.type === "key_points";
}

function isCode(block: ResultBlock) {
  return block.contentType === "code" || ["code", "sql", "command"].includes(block.type);
}

function markdownBlock(block: ResultBlock) {
  const text = blockToPlainText(block);
  if (isList(block)) return (Array.isArray(block.content) ? block.content : [block.content]).map(item => `- ${String(item)}`).join("\n");
  if (isCode(block)) return `\n\`\`\`\n${text}\n\`\`\``;
  if (block.contentType === "mermaid" || block.type === "mermaid") return `\n\`\`\`mermaid\n${text}\n\`\`\``;
  if (block.contentType === "latex" || ["formula", "math", "equation"].includes(block.type)) return `\n$$\n${text}\n$$`;
  return text;
}

export function reportToMarkdown(report: ReportDocument) {
  const lines = [`# ${report.title || "Báo cáo học tập"}`, "", report.summary || "", ""];
  for (const section of report.sections ?? []) {
    lines.push(`## ${section.title}`, "");
    if (section.summary) lines.push(section.summary, "");
    for (const block of section.blocks ?? []) lines.push(markdownBlock(block), "");
  }
  return lines.join("\n").trim() + "\n";
}

function htmlBlock(block: ResultBlock) {
  const text = blockToPlainText(block);
  if (isList(block)) return `<ul>${(Array.isArray(block.content) ? block.content : [block.content]).map(item => `<li>${escapeHtml(String(item))}</li>`).join("")}</ul>`;
  const label = block.contentType === "json" || block.type === "json" ? "JSON · dữ liệu có cấu trúc" : block.contentType || block.type.replaceAll("_", " ");
  const className = isCode(block) || block.contentType === "json" || block.type === "json" || block.contentType === "mermaid" ? "source" : "content";
  return `<div class="block"><span class="label">${escapeHtml(label)}</span><pre class="${className}">${escapeHtml(text)}</pre></div>`;
}

export function reportToHtml(report: ReportDocument) {
  const sections = (report.sections ?? []).map(section => `<section><h2>${escapeHtml(section.title)}</h2>${section.summary ? `<p class="section-summary">${escapeHtml(section.summary)}</p>` : ""}${(section.blocks ?? []).map(htmlBlock).join("")}</section>`).join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(report.title || "Báo cáo học tập")}</title><style>body{font:16px/1.65 Arial,sans-serif;color:#202235;max-width:920px;margin:48px auto;padding:0 24px}header{border-bottom:1px solid #e4e5ed;padding-bottom:24px;margin-bottom:28px}h1{font-size:32px;margin:0 0 10px}h2{font-size:22px;margin:0 0 12px}section{margin:30px 0}.section-summary{color:#62667b}.block{margin:14px 0}.label{display:block;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:#7060c7;font-weight:700;margin-bottom:7px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f7fb;border-radius:8px;padding:14px;font:14px/1.65 ui-monospace,monospace}.content{background:transparent;padding:0;font:inherit}ul{padding-left:24px}@media print{body{margin:0 auto;padding:0 8mm}section{break-inside:avoid}}</style></head><body><header><h1>${escapeHtml(report.title || "Báo cáo học tập")}</h1>${report.summary ? `<p>${escapeHtml(report.summary)}</p>` : ""}</header>${sections}</body></html>`;
}

export async function reportToPdf(report: ReportDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const document = new PDFDocument({ size: "A4", margins: { top: 52, bottom: 52, left: 52, right: 52 }, bufferPages: true });
  const done = new Promise<Buffer>((resolve, reject) => {
    document.on("data", chunk => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document.font(path.join(process.cwd(), "public/fonts/DocuMindSans.ttf"));
  document.fontSize(22).fillColor("#25243b").text(report.title || "Báo cáo học tập");
  document.moveDown(0.6);
  if (report.summary) document.fontSize(11).fillColor("#55596c").text(report.summary, { lineGap: 3 });
  for (const section of report.sections ?? []) {
    document.moveDown(1);
    if (document.y > 700) document.addPage();
    document.fontSize(16).fillColor("#5646aa").text(section.title, { lineGap: 2 });
    document.moveDown(0.3);
    if (section.summary) document.fontSize(10).fillColor("#55596c").text(section.summary, { lineGap: 3 });
    for (const block of section.blocks ?? []) {
      const content = markdownBlock(block).replace(/```[a-z]*\n?|```|\$\$\n?/g, "").trim();
      document.moveDown(0.45);
      document.fontSize(8).fillColor("#7568bd").text(block.contentType === "json" || block.type === "json" ? "JSON · dữ liệu có cấu trúc" : block.type.replaceAll("_", " ").toUpperCase());
      document.fontSize(10).fillColor("#303247").text(content, { lineGap: 3, continued: false });
    }
  }
  document.end();
  return done;
}

export async function reportToDocx(report: ReportDocument): Promise<Buffer> {
  const children: Paragraph[] = [new Paragraph({ text: report.title || "Báo cáo học tập", heading: HeadingLevel.TITLE })];
  if (report.summary) children.push(new Paragraph({ text: report.summary }));
  for (const section of report.sections ?? []) {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
    if (section.summary) children.push(new Paragraph({ text: section.summary }));
    for (const block of section.blocks ?? []) {
      const isJson = block.contentType === "json" || block.type === "json";
      const label = isJson ? "JSON · dữ liệu có cấu trúc" : block.type.replaceAll("_", " ");
      children.push(new Paragraph({ text: label, heading: HeadingLevel.HEADING_3 }));
      const values = isList(block) && Array.isArray(block.content) ? block.content.map(String) : [blockToPlainText(block)];
      for (const value of values) children.push(new Paragraph({ text: value, bullet: isList(block) ? { level: 0 } : undefined }));
    }
  }
  const document = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(document);
}
