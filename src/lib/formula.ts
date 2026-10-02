import { svgToPng } from "@/lib/svg-raster";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const mathDocument = mathjax.document("", { InputJax: new TeX({ packages: ["base", "ams"] }), OutputJax: new SVG({ fontCache: "none" }) });
const formulaCache = new Map<string, Promise<{ bytes: Buffer; width: number; height: number }>>();

export async function renderFormulaPng(latex: string) {
  const source = latex.trim().replace(/^\$\$?|\$\$?$/g, "");
  if (!source || source.length > 2000 || /[\u0000-\u001f]/.test(source)) throw new Error("Công thức LaTeX không hợp lệ để xuất ảnh.");
  const cached = formulaCache.get(source);
  if (cached) return cached;
  const pending = render(source);
  if (formulaCache.size >= 128) formulaCache.clear();
  formulaCache.set(source, pending);
  try { return await pending; }
  catch (error) { formulaCache.delete(source); throw error; }
}

async function render(source: string) {
  const rendered = adaptor.outerHTML(mathDocument.convert(source, { display: true }));
  if (rendered.includes('data-mml-node="merror"')) throw new Error("Công thức LaTeX không hợp lệ; giữ mã nguồn thay vì xuất ảnh lỗi.");
  const svgMatch = rendered.match(/<svg\b[\s\S]*?<\/svg>/);
  const boxMatch = svgMatch?.[0].match(/viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/);
  if (!svgMatch || !boxMatch || /<\s*(script|foreignObject|image|a)\b|(?:href|src)\s*=/i.test(svgMatch[0])) throw new Error("Không tạo được ảnh công thức an toàn.");
  const viewWidth = Number(boxMatch[1]);
  const viewHeight = Number(boxMatch[2]);
  if (!Number.isFinite(viewWidth) || !Number.isFinite(viewHeight) || viewWidth <= 0 || viewHeight <= 0) throw new Error("Kích thước công thức không hợp lệ.");
  const scale = Math.min(0.06, 1600 / viewWidth, 600 / viewHeight);
  const width = Math.max(20, Math.ceil(viewWidth * scale));
  const height = Math.max(20, Math.ceil(viewHeight * scale));
  const svg = svgMatch[0]
    .replace(/width="[^"]+"/, `width="${width}"`)
    .replace(/height="[^"]+"/, `height="${height}"`)
    .replaceAll("currentColor", "#202235");
  return svgToPng(svg, width);
}
