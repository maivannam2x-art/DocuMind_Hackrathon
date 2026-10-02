import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { VisualImage } from "@/lib/visual-renderer";

export function validateVisualSvg(svg: string) {
  const value = svg.trim();
  if (value.length > 2_000_000 || !value.startsWith("<svg") || !value.includes("</svg>") ||
    /<!DOCTYPE|<!ENTITY|<\s*(script|foreignObject|iframe|object|embed|image)\b|\bon[a-z]+\s*=|javascript:|data:|@import|url\(\s*["']?\s*(?!#)[^\s)]|(?:href|src)\s*=\s*["']\s*(?!#)/i.test(value)) {
    throw new Error("Ảnh SVG không hợp lệ hoặc chứa tài nguyên bên ngoài.");
  }
  return value;
}
export function svgToPng(svg: string, targetWidth = 1800): VisualImage {
  const safe = validateVisualSvg(svg);
  const box = safe.match(/viewBox=["']([\d.e+\s-]+)["']/i)?.[1].trim().split(/\s+/).map(Number);
  if (!box || (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0 || targetWidth * box[3] / box[2] > 10000)) throw new Error("Kích thước sơ đồ không hợp lệ hoặc quá cao.");
  const rendered = new Resvg(safe, {
    background: "#ffffff",
    fitTo: { mode: "width", value: targetWidth },
    font: { fontFiles: [path.join(process.cwd(), "public/fonts/DocuMindSans.ttf")], loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" },
  }).render();
  if (rendered.height > 10000) throw new Error("Sơ đồ quá cao để xuất ảnh rõ ràng. Hãy chia thành các sơ đồ nhỏ.");
  const bytes = Buffer.from(rendered.asPng());
  if (bytes.length > 4_000_000) throw new Error("Ảnh sơ đồ vượt kích thước xuất cho phép.");
  return { bytes, width: rendered.width, height: rendered.height };
}
