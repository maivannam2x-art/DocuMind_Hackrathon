import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getAdminDb, envInt } from "@/lib/db";
import { ApiError } from "@/lib/http";

const COOKIE_NAME = "dm_guest";
export type RequestIdentity = { userId: string | null; guestHash: string | null; guestToken?: string };

function hashGuestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getIdentity(request: NextRequest, createGuest = false): Promise<RequestIdentity> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    const { data, error } = await getAdminDb().auth.getUser(token);
    if (error || !data.user) throw new ApiError(401, "INVALID_AUTH", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
    return { userId: data.user.id, guestHash: null };
  }
  let guestToken = request.cookies.get(COOKIE_NAME)?.value;
  if (!guestToken && createGuest) guestToken = randomBytes(32).toString("base64url");
  if (!guestToken) throw new ApiError(401, "SESSION_REQUIRED", "Không tìm thấy phiên làm việc.");
  return { userId: null, guestHash: hashGuestToken(guestToken), guestToken };
}

export function ownerFilter(identity: RequestIdentity) {
  return identity.userId ? { user_id: identity.userId } : { guest_session_hash: identity.guestHash };
}

export function setGuestCookie(response: Response, identity: RequestIdentity) {
  if (identity.userId || !identity.guestToken) return response;
  const maxAge = envInt("GUEST_SESSION_TTL_HOURS", 24) * 60 * 60;
  response.headers.append("Set-Cookie", `${COOKIE_NAME}=${identity.guestToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}

export async function getAnalysis(identity: RequestIdentity, analysisId: string) {
  const { data, error } = await getAdminDb().from("analyses")
    .select("*").eq("id", analysisId)
    .match(ownerFilter(identity)).maybeSingle();
  if (error) throw new ApiError(500, "DATABASE_ERROR", "Không thể đọc phân tích.", error.message);
  if (!data) throw new ApiError(404, "ANALYSIS_NOT_FOUND", "Không tìm thấy phân tích.");
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    await getAdminDb().from("analyses").update({ status: "expired" }).eq("id", analysisId);
    throw new ApiError(410, "ANALYSIS_EXPIRED", "Phiên khách đã hết hạn.");
  }
  return data;
}
