import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok } from "@/lib/http";
import { safeBody } from "@/lib/validation";

const exportSchema = z.object({ format: z.enum(["json", "markdown", "html"]) });
type Context = { params: Promise<{ id: string }> };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function markdown(result: Record<string, unknown>) {
  const sections = Array.isArray(result.sections) ? result.sections as Array<Record<string, unknown>> : [];
  const lines = [`# ${String(result.title ?? "DocuMind")}`, "", String(result.summary ?? ""), ""];
  for (const section of sections) {
    lines.push(`## ${String(section.title ?? "Phần")}`);
    if (section.summary) lines.push(String(section.summary), "");
    for (const raw of Array.isArray(section.blocks) ? section.blocks : []) {
      const block = raw as Record<string, unknown>;
      const content = typeof block.content === "string" ? block.content : JSON.stringify(block.content, null, 2);
      if (block.type === "list" || block.type === "key_points") {
        for (const item of Array.isArray(block.content) ? block.content : [content]) lines.push(`- ${String(item)}`);
      } else lines.push(content);
      lines.push("");
    }
  }
  return lines.join("\n");
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    if (analysis.status !== "completed") throw new ApiError(409, "RESULT_NOT_READY", "Chỉ xuất được kết quả đã hoàn tất.");
    const { format } = safeBody(exportSchema, await request.json());
    const db = getAdminDb();
    const { data: result, error } = await db.from("analysis_results").select("id,result_json").eq("analysis_id", id).eq("is_current", true).maybeSingle();
    if (error || !result) throw new ApiError(404, "RESULT_NOT_FOUND", "Không có kết quả để xuất.");
    const document = result.result_json as Record<string, unknown>;
    const data = format === "json" ? JSON.stringify(document, null, 2)
      : format === "markdown" ? markdown(document)
      : `<!doctype html><html lang="vi"><meta charset="utf-8"><title>${escapeHtml(analysis.title)}</title><body><pre>${escapeHtml(markdown(document))}</pre></body></html>`;
    const extension = format === "markdown" ? "md" : format;
    const contentType = format === "json" ? "application/json" : format === "html" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8";
    const prefix = identity.userId ? `users/${identity.userId}` : `guests/${identity.guestHash}`;
    const storagePath = `${prefix}/${id}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from("analysis-exports").upload(storagePath, Buffer.from(data, "utf8"), { contentType, upsert: false });
    if (uploadError) throw new ApiError(500, "EXPORT_STORAGE_FAILED", "Không lưu được tệp xuất.", uploadError.message);
    const { data: row, error: rowError } = await db.from("exports").insert({
      analysis_id: id, result_id: result.id, format, status: "ready", storage_bucket: "analysis-exports", storage_path: storagePath,
    }).select("id,format,status,created_at").single();
    if (rowError || !row) throw new ApiError(500, "EXPORT_SAVE_FAILED", "Không ghi nhận được tệp xuất.", rowError?.message);
    const { data: signed, error: signedError } = await db.storage.from("analysis-exports").createSignedUrl(storagePath, 300);
    if (signedError) throw new ApiError(500, "EXPORT_LINK_FAILED", "Không tạo được liên kết tải tệp.", signedError.message);
    return ok({ export: row, downloadUrl: signed.signedUrl, expiresInSeconds: 300 });
  } catch (error) { return errorResponse(error); }
}

