import { createHash } from "node:crypto";
import sharp from "sharp";
import { getAdminDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { renderVisual, visualKind, visualSource, type VisualImage } from "@/lib/visual-renderer";
import type { ReportDocument } from "@/lib/report";
import type { ResultBlock } from "@/lib/result-content";

export async function ensureVisualAsset(analysisId: string, resultId: string, block: ResultBlock, svg?: string) {
  const db = getAdminDb();
  const kind = visualKind(block);
  const source = visualSource(block);
  if (!kind || !source) throw new ApiError(422, "VISUAL_SOURCE_INVALID", "Không tìm thấy mã sơ đồ hoặc công thức hợp lệ.");
  const { data: previous, error } = await db.from("generated_assets").select("id,storage_bucket,storage_path,metadata").eq("analysis_id", analysisId).eq("result_id", resultId).eq("asset_type", kind).eq("source", source).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new ApiError(503, "ASSET_METADATA_UNAVAILABLE", "Chưa đọc được thông tin ảnh đã lưu.");
  // Old SVG records are upgraded lazily; no re-analysis or LLM call is needed.
  if (previous?.storage_bucket === "analysis-assets" && previous.storage_path?.endsWith(".png") && (kind !== "latex" || previous.metadata?.renderer === "mathjax-resvg")) {
    const { data } = await db.storage.from("analysis-assets").download(previous.storage_path);
    if (data) {
      const bytes = Buffer.from(await data.arrayBuffer());
      const dimensions = await sharp(bytes).metadata();
      if (dimensions.format === "png" && dimensions.width && dimensions.height && bytes.length <= 4_000_000) return { ...previous, image: { bytes, width: dimensions.width, height: dimensions.height } as VisualImage };
    }
  }
  let image: VisualImage;
  try {
    try { image = await renderVisual(kind, source, svg); }
    catch (failure) {
      if (svg || !previous?.storage_path?.endsWith(".svg")) throw failure;
      const { data } = await db.storage.from("analysis-assets").download(previous.storage_path);
      if (!data) throw failure;
      image = await renderVisual(kind, source, await data.text());
    }
  } catch (failure) {
    throw new ApiError(422, "VISUAL_RENDER_FAILED", failure instanceof Error ? failure.message : "Không tạo được ảnh. Kiểm tra mã sơ đồ/công thức.", { assetType: kind });
  }
  const sourceHash = createHash("sha256").update(`${kind}:${source}`).digest("hex");
  const storagePath = `${analysisId}/${resultId}/${sourceHash}.png`;
  const { error: uploadError } = await db.storage.from("analysis-assets").upload(storagePath, image.bytes, { contentType: "image/png", cacheControl: "3600", upsert: true });
  if (uploadError) throw new ApiError(503, "ASSET_STORAGE_UNAVAILABLE", "Chưa lưu được ảnh trên Supabase. Hãy thử lại trước khi xuất báo cáo.");
  const asset = { analysis_id: analysisId, result_id: resultId, asset_type: kind, source, title: block.type, storage_bucket: "analysis-assets", storage_path: storagePath, metadata: { renderer: kind === "latex" ? "mathjax-resvg" : "mermaid-resvg", mimeType: "image/png", sourceHash, width: image.width, height: image.height } };
  const { error: saveError } = previous ? await db.from("generated_assets").update(asset).eq("id", previous.id) : await db.from("generated_assets").insert(asset);
  if (saveError) throw new ApiError(503, "ASSET_METADATA_UNAVAILABLE", "Ảnh đã tải lên nhưng chưa lưu được đường dẫn. Hãy thử lại.");
  return { ...asset, image };
}

export async function prepareReportImages(analysisId: string, resultId: string, report: ReportDocument, strict = true) {
  const images = new Map<string, VisualImage>();
  const failures: string[] = [];
  const seen = new Set<string>();
  const blocks: ResultBlock[] = [];
  for (const section of report.sections ?? []) for (const block of section.blocks ?? []) {
    if (!visualKind(block)) continue;
    const key = `${visualKind(block)}:${visualSource(block)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push(block);
  }
  // Bound rasterizer/Storage work to three concurrent tasks for long reports.
  for (let offset = 0; offset < blocks.length; offset += 3) {
    const outcomes = await Promise.allSettled(blocks.slice(offset, offset + 3).map(async block => {
      const key = `${visualKind(block)}:${visualSource(block)}`;
      try { const asset = await ensureVisualAsset(analysisId, resultId, block); images.set(key, asset.image); }
      catch (error) {
        if (strict) throw error;
        failures.push(error instanceof Error ? error.message : "Chưa dựng được ảnh.");
      }
    }));
    const rejected = outcomes.find(outcome => outcome.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
  }
  return { images, failures };
}

export async function attachVisualLinks(analysisId: string, resultId: string, report: ReportDocument): Promise<ReportDocument> {
  const db = getAdminDb();
  const { data, error } = await db.from("generated_assets").select("asset_type,source,storage_bucket,storage_path,metadata").eq("analysis_id", analysisId).eq("result_id", resultId).not("storage_path", "is", null).order("created_at", { ascending: false });
  if (error) throw new ApiError(503, "ASSET_METADATA_UNAVAILABLE", "Chưa đọc được thông tin ảnh đã lưu.");
  const links = new Map<string, Record<string, unknown>>();
  const assets = (data ?? []).filter(a => a.storage_bucket === "analysis-assets" && a.storage_path?.endsWith(".png"));
  const paths = Array.from(new Set(assets.map(a => a.storage_path as string)));
  if (paths.length) {
    const { data: signed, error: signedError } = await db.storage.from("analysis-assets").createSignedUrls(paths, 3600);
    if (signedError || !signed) throw new ApiError(503, "ASSET_LINK_UNAVAILABLE", "Chưa tạo được đường dẫn xem ảnh.");
    const urls = new Map(signed.filter(item => !item.error && item.signedUrl).map(item => [item.path, item.signedUrl]));
    for (const asset of assets) {
      const key = `${asset.asset_type}:${String(asset.source).trim()}`;
      if (links.has(key)) continue;
      const url = urls.get(asset.storage_path);
      if (!url) throw new ApiError(503, "ASSET_LINK_UNAVAILABLE", "Chưa tạo được đường dẫn xem một ảnh.");
      links.set(key, { assetUrl: url, storageBucket: asset.storage_bucket, storagePath: asset.storage_path, imageWidth: asset.metadata?.width, imageHeight: asset.metadata?.height, imageUrlExpiresAt: new Date(Date.now() + 3600000).toISOString() });
    }
  }
  return { ...report, sections: report.sections?.map(s => ({ ...s, blocks: (s.blocks ?? []).map(b => ({ ...b, metadata: { ...b.metadata, ...links.get(`${visualKind(b)}:${visualSource(b)}`) } })) })) };
}
