import { attachVisualLinks } from "@/lib/visual-assets";
import { NextRequest } from "next/server";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    if (analysis.status !== "completed") throw new ApiError(409, "RESULT_NOT_READY", "Kết quả chưa hoàn tất.", { status: analysis.status });
    const { data, error } = await getAdminDb().from("analysis_results").select("*").eq("analysis_id", id).eq("is_current", true).maybeSingle();
    if (error || !data) throw new ApiError(404, "RESULT_NOT_FOUND", "Chưa có kết quả cho phân tích này.");
    return ok({ analysis: { id, title: analysis.title, topicId: analysis.topic_id, status: analysis.status }, result: { ...data, result_json: await attachVisualLinks(id, data.id, data.result_json) } });
  } catch (error) { return errorResponse(error); }
}

