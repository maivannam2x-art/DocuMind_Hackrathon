import { NextRequest } from "next/server";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    if (analysis.status !== "needs_review") throw new ApiError(409, "CONFIRM_NOT_AVAILABLE", "Hãy kiểm tra và xác thực nội dung trước khi xác nhận.");
    const { count, error } = await getAdminDb().from("analysis_chunks").select("*", { count: "exact", head: true }).eq("analysis_id", id);
    if (error || !count) throw new ApiError(422, "NO_CHUNKS", "Không có cấu trúc tài liệu để xử lý.");
    if ((analysis.validation_report?.blockingErrors?.length ?? 0) > 0) throw new ApiError(422, "VALIDATION_BLOCKED", "Hãy xử lý các lỗi đầu vào trước khi xác nhận.");
    const { data, error: updateError } = await getAdminDb().from("analyses").update({
      status: "ready", confirmed_at: new Date().toISOString(), error_code: null, error_message: null,
    }).eq("id", id).eq("status", "needs_review").select("id,status,confirmed_at,validation_report").maybeSingle();
    if (updateError || !data) throw new ApiError(409, "CONFIRM_CONFLICT", "Phân tích đã thay đổi, hãy tải lại trước khi xác nhận.", updateError?.message);
    return ok({ analysis: data, nextStep: "run" });
  } catch (error) { return errorResponse(error); }
}

