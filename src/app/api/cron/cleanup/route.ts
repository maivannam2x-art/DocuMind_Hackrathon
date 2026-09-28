import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/db";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || presented.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(secret));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Không có quyền chạy dọn dữ liệu." } }, { status: 401 });
  const db = getAdminDb();
  const { data: expired, error } = await db.from("analyses").select("id").not("expires_at", "is", null).lte("expires_at", new Date().toISOString()).limit(500);
  if (error) return NextResponse.json({ error: { code: "CLEANUP_QUERY_FAILED", message: error.message } }, { status: 500 });
  let removed = 0;
  for (const row of expired ?? []) {
    const [inputs, exports] = await Promise.all([
      db.from("analysis_inputs").select("storage_path").eq("analysis_id", row.id).not("storage_path", "is", null),
      db.from("exports").select("storage_path").eq("analysis_id", row.id).not("storage_path", "is", null),
    ]);
    const inputPaths = (inputs.data ?? []).map((item: { storage_path: string }) => item.storage_path);
    const exportPaths = (exports.data ?? []).map((item: { storage_path: string }) => item.storage_path);
    const inputRemoval = inputPaths.length ? await db.storage.from("analysis-inputs").remove(inputPaths) : { error: null };
    const exportRemoval = exportPaths.length ? await db.storage.from("analysis-exports").remove(exportPaths) : { error: null };
    if (inputRemoval.error || exportRemoval.error) continue;
    const { error: deleteError } = await db.from("analyses").delete().eq("id", row.id);
    if (!deleteError) removed++;
  }
  return NextResponse.json({ data: { expiredFound: expired?.length ?? 0, removed } });
}
