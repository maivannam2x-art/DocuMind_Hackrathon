import { NextRequest } from "next/server";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { extractFile } from "@/lib/documents";
import { ApiError, errorResponse, ok } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };
type InputRow = {
  id: string;
  original_name: string;
  mime_type: string | null;
  byte_size: number;
  storage_bucket: string | null;
  storage_path: string | null;
};

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    if (!["draft", "needs_review"].includes(analysis.status)) {
      throw new ApiError(409, "INVALID_ANALYSIS_STATE", "Không thể đọc thêm tệp ở trạng thái hiện tại.", { status: analysis.status });
    }
    const db = getAdminDb();
    const { data: inputs, error } = await db.from("analysis_inputs")
      .select("id,original_name,mime_type,byte_size,storage_bucket,storage_path")
      .eq("analysis_id", id).in("status", ["staged", "error"]).order("position");
    if (error) throw new ApiError(500, "INPUT_LOAD_FAILED", "Không tải được danh sách tệp.", error.message);

    const completed: Array<{ id: string; name: string; characters: number; extraction: unknown }> = [];
    for (const input of (inputs ?? []) as InputRow[]) {
      if (!input.storage_bucket || !input.storage_path) {
        throw new ApiError(422, "FILE_UPLOAD_INCOMPLETE", `Tệp ${input.original_name} chưa được tải lên đầy đủ. Hãy chọn tải lại tệp.`);
      }
      const { data: fileBlob, error: downloadError } = await db.storage.from(input.storage_bucket).download(input.storage_path);
      if (downloadError || !fileBlob) {
        throw new ApiError(422, "FILE_UPLOAD_INCOMPLETE", `Không đọc được tệp ${input.original_name}. Hãy tải lại tệp rồi thử lại.`, downloadError?.message);
      }
      const bytes = Buffer.from(await fileBlob.arrayBuffer());
      if (bytes.length !== Number(input.byte_size)) {
        await db.from("analysis_inputs").update({ status: "error", metadata: { extraction: "failed", reason: "size_mismatch" } }).eq("id", input.id);
        throw new ApiError(422, "FILE_SIZE_MISMATCH", `Kích thước tệp ${input.original_name} không khớp. Hãy tải lại tệp.`);
      }
      try {
        const file = new File([bytes], input.original_name, { type: input.mime_type ?? "application/octet-stream" });
        const extracted = await extractFile(file);
        const { error: saveError } = await db.from("analysis_inputs").update({
          original_text: extracted.text,
          normalized_text: extracted.text,
          status: "extracted",
          metadata: extracted.metadata ?? { extraction: "text_parser" },
        }).eq("id", input.id);
        if (saveError) throw new ApiError(500, "INPUT_SAVE_FAILED", `Không lưu được nội dung trích xuất từ ${input.original_name}.`, saveError.message);
        completed.push({ id: input.id, name: input.original_name, characters: extracted.text.length, extraction: extracted.metadata });
      } catch (cause) {
        const safeCode = cause instanceof ApiError ? cause.code : "DOCUMENT_EXTRACTION_FAILED";
        await db.from("analysis_inputs").update({ status: "error", metadata: { extraction: "failed", errorCode: safeCode } }).eq("id", input.id);
        throw cause;
      }
    }
    return ok({ analysisId: id, inputs: completed, nextStep: "validate" });
  } catch (error) {
    return errorResponse(error);
  }
}
