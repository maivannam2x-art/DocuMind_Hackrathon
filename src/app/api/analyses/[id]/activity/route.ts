import { NextRequest } from "next/server";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok } from "@/lib/http";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const analysis = await getAnalysis(await getIdentity(request), id);
    const db = getAdminDb();
    const [
      { data: items, error },
      { data: chunks, error: chunkError },
      { data: inputs, error: inputError },
    ] = await Promise.all([
      db
        .from("analysis_activity")
        .select("id,actor,label,status,model,created_at,completed_at")
        .eq("analysis_id", id)
        .order("created_at", { ascending: false })
        .limit(40),
      db
        .from("analysis_chunks")
        .select("status,title,quiz_finished")
        .eq("analysis_id", id)
        .order("chunk_index"),
      db
        .from("analysis_inputs")
        .select("status,original_name,metadata")
        .eq("analysis_id", id)
        .order("position"),
    ]);
    if (error || chunkError || inputError)
      throw new ApiError(
        503,
        "PROGRESS_UNAVAILABLE",
        "Chưa tải được tiến độ. Hãy thử lại.",
      );
    return ok({
      analysis,
      items: items ?? [],
      chunks: chunks ?? [],
      inputs: inputs ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
