import {ApiError,errorResponse} from "@/lib/http";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { envInt, getAdminDb } from "@/lib/db";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || Buffer.byteLength(presented) !== Buffer.byteLength(secret)) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(secret));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Không có quyền chạy dọn dữ liệu." } }, { status: 401 });
  const db = getAdminDb();
  const { data: expired, error } = await db.from("analyses").select("id").not("expires_at", "is", null).lte("expires_at", new Date().toISOString()).limit(500);
  if (error) return errorResponse(new ApiError(503,"CLEANUP_QUERY_FAILED","Không chạy được dọn dữ liệu.",error.message));
  let removed = 0;
  for (const row of expired ?? []) {
    const [inputs, exports, assets] = await Promise.all([
      db.from("analysis_inputs").select("storage_path").eq("analysis_id", row.id).not("storage_path", "is", null),
      db.from("exports").select("storage_path").eq("analysis_id", row.id).not("storage_path", "is", null),
      db.from("generated_assets").select("storage_path").eq("analysis_id",row.id).not("storage_path","is",null),
    ]);
    if(inputs.error || exports.error || assets.error)continue;
    const inputPaths = (inputs.data ?? []).map((item: { storage_path: string }) => item.storage_path);
    const exportPaths = (exports.data ?? []).map((item: { storage_path: string }) => item.storage_path);
    const inputRemoval = inputPaths.length ? await db.storage.from("analysis-inputs").remove(inputPaths) : { error: null };
    const exportRemoval = exportPaths.length ? await db.storage.from("analysis-exports").remove(exportPaths) : { error: null };
    const paths=(assets.data??[]).map((item:{storage_path:string})=>item.storage_path);
    const assetRemoval=paths.length?await db.storage.from("analysis-assets").remove(paths):{error:null};
    if (inputRemoval.error || exportRemoval.error || assetRemoval.error) continue;
    const { error: deleteError } = await db.from("analyses").delete().eq("id", row.id);
    if (!deleteError) removed++;
  }
  const retentionDays=envInt("LLM_LOG_RETENTION_DAYS",30);
  const logCleanup=await db.from("llm_exchanges").delete().lt("created_at",new Date(Date.now()-retentionDays*86400000).toISOString());
  const quotaCleanup=await db.from("api_rate_limits").delete().lt("expires_at",new Date().toISOString());
  return NextResponse.json({ data: { logRetentionDays:retentionDays, logCleanupSucceeded:!logCleanup.error, quotaCleanupSucceeded:!quotaCleanup.error, expiredFound: expired?.length ?? 0, removed } });
}
