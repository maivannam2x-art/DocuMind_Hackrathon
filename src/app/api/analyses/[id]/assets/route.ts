import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok, readJson } from "@/lib/http";
import { safeBody } from "@/lib/validation";

const visualAssetSchema = z.object({
  resultId: z.string().uuid(),
  assetType: z.literal("mermaid"),
  source: z.string().trim().min(1).max(100_000),
  svg: z.string().min(100).max(2_000_000),
  title: z.string().trim().max(200).optional(),
});
type Context = { params: Promise<{ id: string }> };

function containsSource(resultJson: unknown, source: string) {
  if (!resultJson || typeof resultJson !== "object") return false;
  const sections = (resultJson as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return false;
  return sections.some(section => {
    if (!section || typeof section !== "object" || !Array.isArray((section as { blocks?: unknown }).blocks)) return false;
    return (section as { blocks: unknown[] }).blocks.some(block => {
      if (!block || typeof block !== "object") return false;
      const item = block as { type?: unknown; contentType?: unknown; content?: unknown };
      return (item.type === "mermaid" || item.contentType === "mermaid" || item.type === "diagram")
        && typeof item.content === "string" && item.content.trim() === source;
    });
  });
}

function validateSvg(svg: string) {
  const normalized = svg.trim();
  if (!normalized.startsWith("<svg") || !normalized.includes("</svg>")) {
    throw new ApiError(422, "INVALID_RENDERED_ASSET", "Không tạo được ảnh sơ đồ hợp lệ.");
  }
  if (/<\s*(script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|javascript:|data:text\/html|(?:href|src)\s*=\s*["']\s*https?:/i.test(normalized)) {
    throw new ApiError(422, "UNSAFE_RENDERED_ASSET", "Sơ đồ chứa thành phần không an toàn nên không được lưu.");
  }
  return normalized;
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    await getAnalysis(identity, id);
    const body = safeBody(visualAssetSchema, await readJson(request));
    const db = getAdminDb();
    const { data: result, error: resultError } = await db.from("analysis_results")
      .select("id,result_json").eq("id", body.resultId).eq("analysis_id", id).eq("is_current", true).maybeSingle();
    if (resultError || !result) throw new ApiError(404, "RESULT_NOT_FOUND", "Không tìm thấy kết quả hiện tại của phân tích.");
    if (!containsSource(result.result_json, body.source)) throw new ApiError(400, "ASSET_SOURCE_MISMATCH", "Sơ đồ không thuộc kết quả đã lưu.");

    const safeSvg = validateSvg(body.svg);
    const sourceHash = createHash("sha256").update(body.source).digest("hex");
    const ownerPrefix = identity.userId ? `users/${identity.userId}` : `guests/${identity.guestHash}`;
    const storagePath = `${ownerPrefix}/${id}/${body.resultId}/${sourceHash}.svg`;
    const { error: uploadError } = await db.storage.from("analysis-assets").upload(storagePath, Buffer.from(safeSvg, "utf8"), {
      contentType: "image/svg+xml", cacheControl: "3600", upsert: true,
    });
    if (uploadError) throw new ApiError(503, "ASSET_STORAGE_UNAVAILABLE", "Chưa lưu được ảnh sơ đồ. Sơ đồ vẫn hiển thị trong phiên này.", uploadError.message);

    const { data: previous, error: previousError } = await db.from("generated_assets").select("id")
      .eq("analysis_id", id).eq("result_id", body.resultId).eq("asset_type", "mermaid").eq("source", body.source).limit(1).maybeSingle();
    if (previousError) {
      await db.storage.from("analysis-assets").remove([storagePath]);
      throw new ApiError(500, "ASSET_METADATA_LOAD_FAILED", "Không đọc được thông tin ảnh sơ đồ.", previousError.message);
    }
    const asset = {
      analysis_id: id,
      result_id: body.resultId,
      asset_type: "mermaid",
      title: body.title || "Sơ đồ đã kết xuất",
      source: body.source,
      metadata: { renderer: "mermaid", mimeType: "image/svg+xml", sourceHash },
      storage_bucket: "analysis-assets",
      storage_path: storagePath,
    };
    const { error: saveError } = previous
      ? await db.from("generated_assets").update(asset).eq("id", previous.id)
      : await db.from("generated_assets").insert(asset);
    if (saveError) {
      await db.storage.from("analysis-assets").remove([storagePath]);
      throw new ApiError(500, "ASSET_METADATA_SAVE_FAILED", "Không lưu được thông tin ảnh sơ đồ.", saveError.message);
    }
    const { data: signed, error: signedError } = await db.storage.from("analysis-assets").createSignedUrl(storagePath, 600);
    if (signedError || !signed?.signedUrl) throw new ApiError(503, "ASSET_LINK_FAILED", "Đã lưu sơ đồ nhưng chưa tạo được liên kết xem.");
    return ok({ stored: true, assetType: body.assetType, signedUrl: signed.signedUrl, expiresInSeconds: 600 });
  } catch (error) {
    return errorResponse(error);
  }
}
