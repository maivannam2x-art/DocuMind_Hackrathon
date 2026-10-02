import { enforceRateLimit } from "@/lib/rate-limit";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { prepareReportImages, attachVisualLinks } from "@/lib/visual-assets";
import { z } from "zod";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok, readJson } from "@/lib/http";
import { safeBody } from "@/lib/validation";
import { reportToDocx, reportToHtml, reportToMarkdownZip, reportToPdf, type ReportDocument } from "@/lib/report";

export const maxDuration = 120;
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
    const sourceDocument = result.result_json as ReportDocument;
    const { images } = await prepareReportImages(id, result.id, sourceDocument);
    const document = format === "json"
      ? await attachVisualLinks(id, result.id, sourceDocument)
      : { ...sourceDocument, images };
    const extensions = { markdown: "zip", docx: "docx", pdf: "pdf", html: "html", json: "json" } as const;
    const contentTypes = {
      markdown: "application/zip",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pdf: "application/pdf",
      html: "text/html; charset=utf-8",
      json: "application/json; charset=utf-8",
    } as const;
    const extension = extensions[format];
    const contentType = contentTypes[format];
    const data = format === "json" ? Buffer.from(JSON.stringify(document, null, 2), "utf8")
      : format === "markdown" ? await reportToMarkdownZip(document)
      : format === "html" ? Buffer.from(reportToHtml(document), "utf8")
      : format === "docx" ? await reportToDocx(document)
      : await reportToPdf(document);
    const safeTitle = analysis.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "documind-report";
    const prefix = identity.userId ? `users/${identity.userId}` : `guests/${identity.guestHash}`;
    const storagePath = `${prefix}/${id}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from("analysis-exports").upload(storagePath, data, { contentType, upsert: false });
    if (uploadError) throw new ApiError(503, "EXPORT_STORAGE_FAILED", "Không lưu được tệp xuất.", uploadError.message);
    const { data: row, error: rowError } = await db.from("exports").insert({
      analysis_id: id, result_id: result.id, format, status: "ready", storage_bucket: "analysis-exports", storage_path: storagePath,
    }).select("id,format,status,created_at").single();
    if (rowError || !row) throw new ApiError(503, "EXPORT_SAVE_FAILED", "Không ghi nhận được tệp xuất.", rowError?.message);
    const { data: signed, error: signedError } = await db.storage.from("analysis-exports").createSignedUrl(storagePath, 300, { download: `${safeTitle}.${extension}` });
    if (signedError) throw new ApiError(503, "EXPORT_LINK_FAILED", "Không tạo được liên kết tải tệp.", signedError.message);
    return ok({ export: row, downloadUrl: signed.signedUrl, expiresInSeconds: 300 });
  } catch (error) { return errorResponse(error); }
}
