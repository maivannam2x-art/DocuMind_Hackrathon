import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { validateSignUp } from "@/lib/auth-validation";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
const schema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
  passwordConfirmation: z.string().min(8).max(72),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new ApiError(403, "INVALID_ORIGIN", "Hãy đăng ký trực tiếp trên DocuMind.");
    if (Number(request.headers.get("content-length") ?? 0) > 4096)
      throw new ApiError(413, "REGISTRATION_TOO_LARGE", "Thông tin đăng ký quá dài.");
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "INVALID_REGISTRATION", "Thông tin đăng ký chưa hợp lệ.");
    const validation = validateSignUp(parsed.data);
    if (validation) throw new ApiError(400, "INVALID_REGISTRATION", validation);
    const db = getAdminDb();
    const email = parsed.data.email.toLowerCase();
    // Shared, atomic limits cannot be reset by clearing cookies. The trusted
    // Vercel header is overwritten by the platform; other proxies need a trusted
    // address adapter. Local/unknown addresses share a conservative bucket.
    const address = request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown";
    for (const [key, limit] of [[`registration:address:${address}`, 15], [`registration:email:${email}`, 5]] as const) {
      const { data, error } = await db.rpc("consume_api_quota", {
        p_key: createHash("sha256").update(key).digest("hex"), p_limit: limit, p_window_seconds: 3600,
      });
      if (error || !Array.isArray(data) || !data[0])
        throw new ApiError(503, "REGISTRATION_UNAVAILABLE", "Chưa thể tạo tài khoản. Hãy thử lại sau.");
      if (!data[0].allowed)
        throw new ApiError(429, "RATE_LIMITED", "Đã vượt số lần đăng ký. Hãy thử lại sau.", { retryAfter: data[0].retry_after });
    }
    // This endpoint creates NEW accounts only. It never changes the password,
    // confirmation state or privileges of an existing account.
    const { data, error } = await db.auth.admin.createUser({
      email, password: parsed.data.password, email_confirm: true,
      user_metadata: { display_name: parsed.data.displayName },
    });
    if (error?.code === "email_exists" || error?.status === 422 && /already|registered|exists/i.test(error.message))
      throw new ApiError(409, "REGISTRATION_CONFLICT", "Không thể tạo tài khoản với email này. Hãy đăng nhập nếu đã có tài khoản.");
    if (error?.code === "weak_password")
      throw new ApiError(400, "WEAK_PASSWORD", "Mật khẩu chưa đáp ứng yêu cầu bảo mật của hệ thống.");
    if (error || !data.user)
      throw new ApiError(503, "REGISTRATION_UNAVAILABLE", "Chưa thể tạo tài khoản. Hãy thử lại sau.");
    // No secrets, password, admin key or session tokens in the response/log.
    return ok({ registered: true, emailConfirmationRequired: false }, 201);
  } catch (error) { return errorResponse(error); }
}
