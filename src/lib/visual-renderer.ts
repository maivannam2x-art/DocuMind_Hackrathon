import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { renderMermaidSVG } from "beautiful-mermaid";
import { renderFormulaPng } from "@/lib/formula";
import type { ResultBlock } from "@/lib/result-content";

export type VisualImage = { bytes: Buffer; width: number; height: number };
export function visualKind(block: ResultBlock): "latex" | "mermaid" | "plantuml" | null {
  if (block.contentType === "latex" || ["formula", "math", "equation"].includes(block.type)) return "latex";
  if (block.contentType === "plantuml" || block.type === "plantuml") return "plantuml";
  if (block.contentType === "mermaid" || ["mermaid", "diagram"].includes(block.type)) return "mermaid";
  return null;
}
export function visualSource(block: ResultBlock) {
  const value = visualKind(block) === "latex" && typeof block.metadata?.latex === "string" ? block.metadata.latex : block.content;
  return typeof value === "string" ? value.trim().replace(/^```(?:mermaid|latex|tex|plantuml)?\s*|```$/g, "").trim() : "";
}
export function validateVisualSvg(svg: string) {
  const value = svg.trim();
  if (value.length > 2_000_000 || !value.startsWith("<svg") || !value.includes("</svg>") ||
    /<!DOCTYPE|<!ENTITY|<\s*(script|foreignObject|iframe|object|embed|image)\b|\bon[a-z]+\s*=|javascript:|data:|@import|url\(\s*["']?\s*(?!#)[^\s)]|(?:href|src)\s*=\s*["']\s*(?!#)/i.test(value)) {
    throw new Error("Ảnh SVG không hợp lệ hoặc chứa tài nguyên bên ngoài.");
  }
  return value;
}
export function svgToPng(svg: string): VisualImage {
  const safe = validateVisualSvg(svg);
  const box = safe.match(/viewBox=["']([\d.e+\s-]+)["']/i)?.[1].trim().split(/\s+/).map(Number);
  if (box && (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0 || 1800 * box[3] / box[2] > 10000)) throw new Error("Kích thước sơ đồ không hợp lệ hoặc quá cao.");
  const rendered = new Resvg(safe, {
    background: "#ffffff",
    fitTo: { mode: "width", value: 1800 },
    font: { fontFiles: [path.join(process.cwd(), "public/fonts/DocuMindSans.ttf")], loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" },
  }).render();
  if (rendered.height > 10000) throw new Error("Sơ đồ quá cao để xuất ảnh rõ ràng. Hãy chia thành các sơ đồ nhỏ.");
  const bytes = Buffer.from(rendered.asPng());
  if (bytes.length > 4_000_000) throw new Error("Ảnh sơ đồ vượt kích thước xuất cho phép.");
  return { bytes, width: rendered.width, height: rendered.height };
}
export async function renderVisual(kind: "latex" | "mermaid" | "plantuml", source: string, suppliedSvg?: string): Promise<VisualImage> {
  if (!source || source.length > 10000) throw new Error("Mã công thức hoặc sơ đồ trống hoặc quá dài.");
  if (kind === "latex") return renderFormulaPng(source);
  if (kind === "plantuml") throw new Error("PlantUML chưa có bộ dựng ảnh. Hãy chuyển sơ đồ sang Mermaid trước khi xuất.");
  if (suppliedSvg) return svgToPng(suppliedSvg);
  // Flatten CSS variables: native SVG rasterizers do not implement browser CSS color-mix().
  let svg = renderMermaidSVG(source, { bg: "#ffffff", fg: "#202235", line: "#6248dc", accent: "#6248dc", muted: "#55596c", surface: "#f4f1fb", border: "#dad6e5", font: "DejaVu Sans" });
  svg = svg.replace(/<style>[\s\S]*?<\/style>/g, "");
  const colors: Record<string, string> = { bg: "#ffffff", fg: "#202235", _text: "#202235", _text_sec: "#55596c", "_text-sec": "#55596c", "_text-muted": "#55596c", "_text-faint": "#888888", _line: "#6248dc", _arrow: "#6248dc", "_node-fill": "#f4f1fb", "_node-stroke": "#dad6e5", "_group-fill": "#ffffff", "_group-hdr": "#f4f1fb", "_inner-stroke": "#dad6e5", "_key-badge": "#f4f1fb" };
  svg = svg.replace(/var\(--([\w-]+)\)/g, (_, name: string) => colors[name] ?? "#202235").replace(/<text\b/g, '<text font-family="DejaVu Sans"');
  return svgToPng(svg);
}
