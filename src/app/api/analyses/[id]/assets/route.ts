import { NextRequest } from "next/server";
import { z } from "zod";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok, readJson } from "@/lib/http";
import { safeBody } from "@/lib/validation";
import { ensureVisualAsset } from "@/lib/visual-assets";
import { visualKind, visualSource } from "@/lib/visual-renderer";
import type { ReportDocument } from "@/lib/report";

const schema = z.object({ resultId: z.string().uuid(), assetType: z.enum(["mermaid", "latex", "plantuml"]), source: z.string().trim().min(1).max(10000), svg: z.string().min(100).max(2_000_000).optional(), title: z.string().trim().max(200).optional() });
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    await getAnalysis(identity, id);
    const body = safeBody(schema, await readJson(request));
    const db = getAdminDb();
    const { data: result, error } = await db.from("analysis_results").select("id,result_json").eq("id", body.resultId).eq("analysis_id", id).eq("is_current", true).maybeSingle();
    if (error || !result) throw new ApiError(404, "RESULT_NOT_FOUND", "Không tìm thấy kết quả hiện tại.");
    const block = (result.result_json as ReportDocument).sections?.flatMap(s => s.blocks ?? []).find(b => visualKind(b) === body.assetType && visualSource(b) === body.source);
    if (!block) throw new ApiError(400, "ASSET_SOURCE_MISMATCH", "Sơ đồ/công thức không thuộc kết quả đã lưu.");
    const asset = await ensureVisualAsset(id, result.id, block, body.svg);
    const { data: signed, error: signedError } = await db.storage.from("analysis-assets").createSignedUrl(asset.storage_path!, 3600);
    if (signedError || !signed) throw new ApiError(503, "ASSET_LINK_FAILED", "Đã lưu ảnh nhưng chưa tạo được liên kết xem.");
    return ok({ stored: true, assetType: body.assetType, signedUrl: signed.signedUrl, storagePath: asset.storage_path, mimeType: "image/png", width: asset.image.width, height: asset.image.height, expiresInSeconds: 3600 });
  } catch (error) { return errorResponse(error); }
}
