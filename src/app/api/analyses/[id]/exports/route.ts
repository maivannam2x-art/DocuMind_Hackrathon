import { enforceRateLimit } from "@/lib/rate-limit";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok, readJson } from "@/lib/http";
import { safeBody } from "@/lib/validation";
import { reportToDocx, reportToHtml, reportToMarkdown, reportToPdf, type ReportDocument } from "@/lib/report";

const exportSchema = z.object({ format: z.enum(["pdf", "docx", "markdown", "html", "json"]) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    await enforceRateLimit(request, identity, "export");
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    if (analysis.status !== "completed") throw new ApiError(409, "RESULT_NOT_READY", "Chỉ xuất được kết quả đã hoàn tất.");
    const { format } = safeBody(exportSchema, await readJson(request));
    const db = getAdminDb();
    const { data: result, error } = await db.from("analysis_results").select("id,result_json").eq("analysis_id", id).eq("is_current", true).maybeSingle();
    if (error || !result) throw new ApiError(404, "RESULT_NOT_FOUND", "Không có kết quả để xuất.");
    let document = result.result_json as ReportDocument;
    if (["html", "pdf", "docx"].includes(format)) {
      const { data: assets } = await db.from("generated_assets").select("asset_type,source,storage_bucket,storage_path")
        .eq("analysis_id", id).eq("result_id", result.id).eq("asset_type", "mermaid");
      const svgBySource = new Map<string, { svg: string; png: string; width: number; height: number }>();
      for (const asset of assets ?? []) {
        if (!asset.source || !asset.storage_bucket || !asset.storage_path) continue;
        try {
          const { data: image } = await db.storage.from(asset.storage_bucket).download(asset.storage_path);
          if (!image) continue;
          const svg = Buffer.from(await image.arrayBuffer()).toString("utf8").trim();
          if (!svg.startsWith("<svg") || !svg.includes("</svg>") || /<\s*(script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|javascript:|data:text\/html|(?:href|src)\s*=\s*["']\s*https?:/i.test(svg)) continue;
          const png = await sharp(Buffer.from(svg)).resize({ width: 1800, height: 1200, fit: "inside", withoutEnlargement: true }).png().toBuffer();
          const dimensions = await sharp(png).metadata();
          if (png.length > 4_000_000 || !dimensions.width || !dimensions.height) continue;
          svgBySource.set(String(asset.source).trim(), { svg: Buffer.from(svg).toString("base64"), png: png.toString("base64"), width: dimensions.width, height: dimensions.height });
        } catch (assetError) {
          console.warn("Skipping an unavailable rendered diagram in export", assetError instanceof Error ? assetError.message : "unknown error");
        }
      }
      if (svgBySource.size && document.sections) {
        document = {
          ...document,
          sections: document.sections.map(section => ({
            ...section,
            blocks: section.blocks.map(block => {
              const source = typeof block.content === "string" ? block.content.trim() : "";
              const image = svgBySource.get(source);
              return image ? { ...block, metadata: { ...block.metadata, inlineSvgBase64: image.svg, inlinePngBase64: image.png, inlinePngWidth: image.width, inlinePngHeight: image.height } } : block;
            }),
          })),
        };
      }
    }
    const extensions = { markdown: "md", docx: "docx", pdf: "pdf", html: "html", json: "json" } as const;
    const contentTypes = {
      markdown: "text/markdown; charset=utf-8",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pdf: "application/pdf",
      html: "text/html; charset=utf-8",
      json: "application/json; charset=utf-8",
    } as const;
    const extension = extensions[format];
    const contentType = contentTypes[format];
    const data = format === "json" ? Buffer.from(JSON.stringify(document, null, 2), "utf8")
      : format === "markdown" ? Buffer.from(reportToMarkdown(document), "utf8")
      : format === "html" ? Buffer.from(reportToHtml(document), "utf8")
      : format === "docx" ? await reportToDocx(document)
      : await reportToPdf(document);
    const safeTitle = analysis.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "documind-report";
    const prefix = identity.userId ? `users/${identity.userId}` : `guests/${identity.guestHash}`;
    const storagePath = `${prefix}/${id}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from("analysis-exports").upload(storagePath, data, { contentType, upsert: false });
    if (uploadError) throw new ApiError(500, "EXPORT_STORAGE_FAILED", "Không lưu được tệp xuất.", uploadError.message);
    const { data: row, error: rowError } = await db.from("exports").insert({
      analysis_id: id, result_id: result.id, format, status: "ready", storage_bucket: "analysis-exports", storage_path: storagePath,
    }).select("id,format,status,created_at").single();
    if (rowError || !row) throw new ApiError(500, "EXPORT_SAVE_FAILED", "Không ghi nhận được tệp xuất.", rowError?.message);
    const { data: signed, error: signedError } = await db.storage.from("analysis-exports").createSignedUrl(storagePath, 300, { download: `${safeTitle}.${extension}` });
    if (signedError) throw new ApiError(500, "EXPORT_LINK_FAILED", "Không tạo được liên kết tải tệp.", signedError.message);
    return ok({ export: row, downloadUrl: signed.signedUrl, expiresInSeconds: 300 });
  } catch (error) { return errorResponse(error); }
}
