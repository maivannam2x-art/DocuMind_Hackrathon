import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json({ data }, { status, headers });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Nội dung yêu cầu không phải JSON hợp lệ.");
  }
}

export function errorResponse(error: unknown) {
  const requestId = randomUUID();
  if (error instanceof ApiError) {
    if (error.status >= 500) console.error(`[DocuMind API ${requestId}] ${error.code}`, error.details ?? error.message);
    let message = error.message;
    if (error.code === "LLM_PROVIDER_ERROR") message = "Dịch vụ AI đang bận hoặc tạm thời không phản hồi. Hãy thử lại sau ít phút.";
    else if (error.code === "VISION_INVALID_RESPONSE") message = "Không đọc được ảnh ở lần thử này. Hãy thử lại hoặc chỉnh sửa phần văn bản sau khi trích xuất.";
    else if (error.status >= 500 && !["LLM_KEY_MISSING", "VISION_PROVIDER_REQUIRED", "FILE_UPLOAD_SETUP_FAILED"].includes(error.code)) {
      message = `Hệ thống chưa thể hoàn tất yêu cầu. Hãy thử lại sau. Mã hỗ trợ: ${requestId}`;
    }
    // Internal provider/database errors are logged server-side; never send them to the browser.
    return NextResponse.json({ error: { code: error.code, message, requestId } }, { status: error.status, headers: error.status === 429 ? { "Retry-After": String((error.details as {retryAfter?:number})?.retryAfter ?? 60) } : undefined });
  }
  console.error(`[DocuMind API ${requestId}] INTERNAL_ERROR`, error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: `Hệ thống chưa thể hoàn tất yêu cầu. Hãy thử lại sau. Mã hỗ trợ: ${requestId}`, requestId } }, { status: 500 });
}

export function parseJson<T>(value: unknown): T {
  if (typeof value !== "string") return value as T;
  try { return JSON.parse(value) as T; } catch { return value as T; }
}
