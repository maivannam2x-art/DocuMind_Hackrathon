import { enforceRateLimit } from "@/lib/rate-limit";
import { NextRequest } from "next/server";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { extractFileStep } from "@/lib/documents";
import { startActivity, finishActivity } from "@/lib/activity";
import { TERMINAL_INGEST_ERRORS } from "@/lib/ingest-state";
import type { ExtractionProgress } from "@/lib/ordered-extraction";
import { createHash } from "node:crypto";
import { ApiError, errorResponse, ok } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await getIdentity(request);
    await enforceRateLimit(request, identity, "ingest");
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    if (
      analysis.confirmed_at ||
      !["draft", "needs_review", "failed"].includes(analysis.status)
    )
      throw new ApiError(
        409,
        "INVALID_ANALYSIS_STATE",
        "Không thể đọc thêm tệp ở trạng thái hiện tại.",
      );
    const db = getAdminDb();
    const { data: inputs, error } = await db
      .from("analysis_inputs")
      .select("*")
      .eq("analysis_id", id)
      .in("status", ["staged", "error"])
      .order("position");
    if (error)
      throw new ApiError(
        503,
        "INPUT_LOAD_FAILED",
        "Chưa tải được danh sách tệp.",
      );
    const input = inputs?.[0];
    if (!input)
      return ok({
        analysisId: id,
        inputs: [],
        nextStep: "validate",
        remainingFiles: 0,
      });
    if (TERMINAL_INGEST_ERRORS.has(input.metadata?.errorCode))
      throw new ApiError(
        422,
        "INPUT_REPLACEMENT_REQUIRED",
        analysis.error_message ??
          "Tệp vượt giới hạn hoặc không hợp lệ. Hãy tách/chuyển đổi tệp rồi tạo phiên mới.",
      );
    const lease = new Date(Date.now() + 300000).toISOString();
    const { data: claim, error: claimError } = await db
      .from("analysis_inputs")
      .update({ ingest_lease_until: lease })
      .eq("id", input.id)
      .or(
        `ingest_lease_until.is.null,ingest_lease_until.lt.${new Date().toISOString()}`,
      )
      .select("updated_at")
      .maybeSingle();
    if (claimError)
      throw new ApiError(
        503,
        "INGEST_CLAIM_FAILED",
        "Không bắt đầu được lượt đọc tài liệu.",
      );
    if (!claim)
      return ok({
        analysisId: id,
        nextStep: "ingest",
        remainingFiles: inputs!.length,
        waitMs: 2000,
      });
    let task: string | null = null;
    try {
      task = await startActivity(
        id,
        "system",
        `Tải tệp riêng tư và kiểm tra kích thước: ${input.original_name}`,
      );
      if (!input.storage_bucket || !input.storage_path)
        throw new ApiError(
          422,
          "FILE_UPLOAD_INCOMPLETE",
          "Tệp chưa tải lên đầy đủ. Hãy tải lại tệp.",
        );
      const { data: fileBlob, error: downloadError } = await db.storage
        .from(input.storage_bucket)
        .download(input.storage_path);
      if (downloadError || !fileBlob)
        throw new ApiError(
          422,
          "FILE_UPLOAD_INCOMPLETE",
          "Không đọc được tệp đã tải lên. Hãy tải lại tệp.",
        );
      const bytes = Buffer.from(await fileBlob.arrayBuffer());
      if (bytes.length !== Number(input.byte_size))
        throw new ApiError(
          422,
          "FILE_SIZE_MISMATCH",
          "Kích thước tệp không khớp. Hãy tải lại tệp.",
        );
      await finishActivity(task, "succeeded");
      task = null;
      const hash = createHash("sha256").update(bytes).digest("hex");
      const checkpoint =
        input.metadata?.sourceHash === hash
          ? (input.metadata?.extractionProgress as ExtractionProgress)
          : undefined;
      const extracted = await extractFileStep(
        new File([bytes], input.original_name, {
          type: input.mime_type ?? "application/octet-stream",
        }),
        checkpoint,
        checkpoint ? (input.normalized_text ?? "") : "",
        id,
      );
      task = await startActivity(
        id,
        "system",
        `Lưu checkpoint và giữ thứ tự nguồn: ${input.original_name}`,
      );
      const { data: saved, error: saveError } = await db
        .from("analysis_inputs")
        .update({
          original_text: extracted.text,
          normalized_text: extracted.text,
          status: extracted.complete ? "extracted" : "staged",
          metadata: { ...extracted.metadata, sourceHash: hash },
          ingest_lease_until: null,
        })
        .eq("id", input.id)
        .eq("ingest_lease_until", lease)
        .select("id")
        .maybeSingle();
      if (saveError || !saved)
        throw new ApiError(
          503,
          "INPUT_SAVE_FAILED",
          "Không lưu được checkpoint đọc tài liệu.",
        );
      await db
        .from("analyses")
        .update({ status: "draft", error_code: null, error_message: null })
        .eq("id", id)
        .is("confirmed_at", null);
      await finishActivity(task, "succeeded");
      return ok({
        analysisId: id,
        inputs: [
          {
            id: input.id,
            name: input.original_name,
            characters: extracted.text.length,
          },
        ],
        nextStep:
          !extracted.complete || inputs!.length > 1 ? "ingest" : "validate",
        remainingFiles: inputs!.length - (extracted.complete ? 1 : 0),
        progress: extracted.metadata?.extractionProgress,
      });
    } catch (cause) {
      await finishActivity(task, "failed");
      const code =
        cause instanceof ApiError ? cause.code : "DOCUMENT_EXTRACTION_FAILED";
      const message =
        cause instanceof Error ? cause.message : "Không đọc được tài liệu.";
      await db
        .from("analysis_inputs")
        .update({
          status: "error",
          ingest_lease_until: null,
          metadata: { ...input.metadata, errorCode: code,
            ...(cause instanceof ApiError && cause.details && typeof cause.details === "object" && "extractionLocation" in cause.details
              ? { extractionErrorLocation: cause.details.extractionLocation } : {}),
          },
        })
        .eq("id", input.id)
        .eq("ingest_lease_until", lease);
      await db
        .from("analyses")
        .update({ status: "failed", error_code: code, error_message: message })
        .eq("id", id)
        .is("confirmed_at", null);
      throw cause;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
