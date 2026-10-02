import { NextRequest } from "next/server";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok } from "@/lib/http";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; inputId: string }> }) {
  try {
    const { id, inputId } = await context.params;
    await getAnalysis(await getIdentity(request), id);
    const db = getAdminDb();
    const { data: input, error } = await db.from("analysis_inputs")
      .select("original_name,storage_bucket,storage_path").eq("analysis_id", id).eq("id", inputId).maybeSingle();
    if (error) throw new ApiError(503, "SOURCE_LOAD_FAILED", "Chưa đọc được thông tin tệp gốc. Hãy thử lại.");
    if (!input) throw new ApiError(404, "SOURCE_NOT_FOUND", "Không tìm thấy tệp trong phiên này.");
    if (input.storage_bucket !== "analysis-inputs" || !input.storage_path)
      throw new ApiError(404, "SOURCE_NOT_STORED", "Phiên cũ chưa lưu tệp gốc; nội dung trích xuất vẫn nằm trong bước kiểm tra.");
    const { data, error: signingError } = await db.storage.from("analysis-inputs").createSignedUrl(input.storage_path, 600);
    if (signingError || !data) throw new ApiError(503, "SOURCE_URL_FAILED", "Chưa mở được tệp gốc. Hãy thử lại.");
    return ok({ url: data.signedUrl, name: input.original_name, expiresInSeconds: 600 });
  } catch (error) { return errorResponse(error); }
}
