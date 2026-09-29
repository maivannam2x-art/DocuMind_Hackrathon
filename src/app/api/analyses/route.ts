import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getIdentity, ownerFilter, setGuestCookie, type RequestIdentity } from "@/lib/auth";
import { getAdminDb, envInt } from "@/lib/db";
import { extractFile, mimeTypeForFilename, normalizeText } from "@/lib/documents";
import { ApiError, errorResponse, ok, readJson } from "@/lib/http";
import { assertHasAnalysisInput, createAnalysisSchema, safeBody } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  let identity: RequestIdentity | undefined;
  let createdAnalysisId: string | null = null;
  const uploadedPaths: string[] = [];
  try {
    identity = await getIdentity(request, true);
    const db = getAdminDb();
    let body: ReturnType<typeof createAnalysisSchema.parse>;
    let files: File[] = [];
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const raw: Record<string, unknown> = {};
      for (const key of ["title", "topicCode", "specializationId", "promptTemplateId", "customPrompt", "quizEnabled", "text"]) {
        const value = form.get(key);
        if (value !== null) raw[key] = value;
      }
      files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
      body = safeBody(createAnalysisSchema, raw);
    } else {
      body = safeBody(createAnalysisSchema, await readJson(request));
    }
    assertHasAnalysisInput(body.text, files.length, body.files?.length ?? 0);
    if (files.length > 10) throw new ApiError(413, "TOO_MANY_FILES", "Mỗi phân tích hỗ trợ tối đa 10 tệp.");
    const title = body.title?.trim() || "Phân tích mới";
    const fileSpecs = body.files ?? [];
    if (files.length + fileSpecs.length > 10) throw new ApiError(413, "TOO_MANY_FILES", "Mỗi phân tích hỗ trợ tối đa 10 tệp.");
    if (files.length && fileSpecs.length) throw new ApiError(400, "MIXED_UPLOAD_MODES", "Hãy tải tệp theo một luồng duy nhất.");
    const topicCode = body.topicCode?.toUpperCase() ?? (body.specializationId ? "IT" : undefined);
    if (topicCode && !["IT", "AUTO", "GENERAL"].includes(topicCode)) throw new ApiError(400, "UNSUPPORTED_TOPIC", "Hiện có thể chọn IT hoặc để hệ thống tự nhận diện chủ đề.");
    const { data: topic, error: topicError } = topicCode === "IT"
      ? await db.from("topics").select("id").eq("code", "IT").eq("is_active", true).maybeSingle()
      : { data: null, error: null };
    if (topicError || (topicCode === "IT" && !topic)) throw new ApiError(500, "IT_TOPIC_NOT_CONFIGURED", "Chưa cấu hình chủ đề Công nghệ thông tin.", topicError?.message);
    const topicId = topic?.id as string | undefined;
    if (body.specializationId) {
      if (!topicId) throw new ApiError(400, "IT_TOPIC_REQUIRED", "Chọn chủ đề IT trước khi chọn chuyên ngành.");
      const { data: specialization, error } = await db.from("topic_specializations").select("id").eq("id", body.specializationId).eq("topic_id", topicId).eq("is_active", true).maybeSingle();
      if (error || !specialization) throw new ApiError(400, "INVALID_IT_SPECIALIZATION", "Chuyên ngành không thuộc danh mục IT.");
    }
    if (body.promptTemplateId) {
      const promptQuery = db.from("prompt_templates").select("id")
        .eq("id", body.promptTemplateId).eq("purpose", "section_generation").eq("is_active", true);
      const { data: selectedPrompt, error } = topicId ? await promptQuery.eq("topic_id", topicId).maybeSingle() : await promptQuery.is("topic_id", null).maybeSingle();
      if (error || !selectedPrompt) throw new ApiError(400, "INVALID_PROMPT_TEMPLATE", "Prompt đã chọn không phải mẫu phân tích IT đang hoạt động.");
    }
    const ttl = envInt("GUEST_SESSION_TTL_HOURS", 24);
    const { data: analysis, error: createError } = await db.from("analyses").insert({
      ...ownerFilter(identity), title, topic_id: topicId ?? null, specialization_id: body.specializationId ?? null,
      prompt_template_id: body.promptTemplateId ?? null, custom_prompt: body.customPrompt ?? null,
      quiz_enabled: body.quizEnabled ?? false, status: "draft",
      expires_at: identity.userId ? null : new Date(Date.now() + ttl * 60 * 60 * 1000).toISOString(),
    }).select().single();
    if (createError || !analysis) throw new ApiError(500, "ANALYSIS_CREATE_FAILED", "Không tạo được phiên phân tích.", createError?.message);
    createdAnalysisId = analysis.id;

    const inputs: Array<Record<string, unknown>> = [];
    const addTextInput = (value: string, originalName: string, inputKind: "file" | "pasted_text", mimeType: string, byteSize: number, storagePath?: string) => {
      const normalized = normalizeText(value);
      inputs.push({
        analysis_id: analysis.id, input_kind: inputKind, original_name: originalName,
        mime_type: mimeType, byte_size: byteSize, storage_bucket: storagePath ? "analysis-inputs" : null,
        storage_path: storagePath ?? null, original_text: value, normalized_text: normalized,
        status: "extracted", position: inputs.length, metadata: { extraction: "complete" },
      });
    };
    const storageMimeType = (mimeType: string) => ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"].includes(mimeType) ? mimeType : "text/plain";
    if (body.text?.trim()) addTextInput(body.text, "Nội dung đã dán", "pasted_text", "text/plain", Buffer.byteLength(body.text));
    const uploadSpecs: Array<{ inputId: string; name: string; byteSize: number; mimeType: string; storagePath: string }> = [];
    for (const spec of fileSpecs) {
      const mimeType = mimeTypeForFilename(spec.name);
      if (!mimeType) throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", `Chưa hỗ trợ tệp ${spec.name}.`);
      const inputId = randomUUID();
      const extension = spec.name.split(".").pop()?.toLowerCase() ?? "txt";
      const prefix = identity.userId ? `users/${identity.userId}` : `guests/${identity.guestHash}`;
      const storagePath = `${prefix}/${analysis.id}/${inputId}.${extension}`;
      uploadSpecs.push({ inputId, name: spec.name, byteSize: spec.byteSize, mimeType: storageMimeType(mimeType), storagePath });
      inputs.push({
        id: inputId, analysis_id: analysis.id, input_kind: "file", original_name: spec.name,
        mime_type: mimeType, byte_size: spec.byteSize, storage_bucket: "analysis-inputs", storage_path: storagePath,
        original_text: null, normalized_text: null, status: "staged", position: inputs.length,
        metadata: { extraction: "pending" },
      });
    }
    const maxTotalChars = envInt("MAX_ANALYSIS_CHARS", 500000);
    let totalChars = body.text?.length ?? 0;
    for (const file of files) {
      const extracted = await extractFile(file);
      totalChars += extracted.text.length;
      if (totalChars > maxTotalChars) throw new ApiError(413, "ANALYSIS_TOO_LARGE", `Tổng nội dung vượt giới hạn ${maxTotalChars.toLocaleString()} ký tự.`);
      const inputId = randomUUID();
      const extension = extracted.name.split(".").pop()?.toLowerCase() ?? "txt";
      const prefix = identity.userId ? `users/${identity.userId}` : `guests/${identity.guestHash}`;
      const storagePath = `${prefix}/${analysis.id}/${inputId}.${extension}`;
      const { error: uploadError } = await db.storage.from("analysis-inputs").upload(storagePath, Buffer.from(await file.arrayBuffer()), {
        contentType: storageMimeType(extracted.mimeType), upsert: false,
      });
      if (uploadError) throw new ApiError(500, "FILE_STORAGE_FAILED", `Không lưu được tệp ${file.name}.`, uploadError.message);
      uploadedPaths.push(storagePath);
      addTextInput(extracted.text, extracted.name, "file", extracted.mimeType, extracted.byteSize, storagePath);
      inputs[inputs.length - 1].id = inputId;
    }
    if (totalChars > maxTotalChars) throw new ApiError(413, "ANALYSIS_TOO_LARGE", `Tổng nội dung vượt giới hạn ${maxTotalChars.toLocaleString()} ký tự.`);
    const { data: savedInputs, error: inputError } = await db.from("analysis_inputs").insert(inputs).select("id,input_kind,original_name,status,position,byte_size");
    if (inputError) throw new ApiError(500, "INPUT_SAVE_FAILED", "Không lưu được đầu vào.", inputError.message);
    const uploads = [];
    for (const spec of uploadSpecs) {
      // Allow retrying the same slot if a mobile/network upload times out after the server saved it.
      const { data: signed, error: signError } = await db.storage.from("analysis-inputs").createSignedUploadUrl(spec.storagePath, { upsert: true });
      if (signError || !signed?.token) throw new ApiError(503, "FILE_UPLOAD_SETUP_FAILED", `Không tạo được phiên tải tệp ${spec.name}.`, signError?.message);
      uploads.push({ inputId: spec.inputId, name: spec.name, signedUrl: signed.signedUrl, mimeType: spec.mimeType });
    }
    const response = ok({ analysis, inputs: savedInputs, uploads, nextStep: uploadSpecs.length || files.length ? "upload" : "validate" }, 201);
    return setGuestCookie(response, identity);
  } catch (error) {
    if (identity && createdAnalysisId) {
      const db = getAdminDb();
      if (uploadedPaths.length) await db.storage.from("analysis-inputs").remove(uploadedPaths);
      await db.from("analyses").delete().eq("id", createdAnalysisId).match(ownerFilter(identity));
    }
    return errorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
    let historyQuery = getAdminDb().from("analyses").select("id,title,status,topic_id,quiz_enabled,error_code,created_at,updated_at,completed_at", { count: "exact" })
      .match(ownerFilter(identity));
    if (!identity.userId) historyQuery = historyQuery.gt("expires_at", new Date().toISOString());
    const { data, error, count } = await historyQuery.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new ApiError(500, "DATABASE_ERROR", "Không tải được lịch sử.", error.message);
    return ok({ items: data ?? [], total: count ?? 0, limit, offset });
  } catch (error) { return errorResponse(error); }
}
