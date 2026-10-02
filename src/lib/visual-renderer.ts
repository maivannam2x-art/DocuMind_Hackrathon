import { svgToPng } from "@/lib/svg-raster";
export { svgToPng, validateVisualSvg } from "@/lib/svg-raster";
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
