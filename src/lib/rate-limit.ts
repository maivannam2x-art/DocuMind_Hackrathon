import { createHash } from "node:crypto";
import type { RequestIdentity } from "./auth";
import { getAdminDb } from "./db";
import { ApiError } from "./http";
export async function enforceRateLimit(
  request: Request,
  identity: RequestIdentity,
  operation: "chat" | "run" | "ingest" | "quiz" | "create" | "export",
) {
  const owner = identity.userId
    ? `user:${identity.userId}`
    : `guest:${identity.guestHash}`;
  const limit =
    operation === "chat"
      ? 20
      : operation === "create"
        ? 15
        : operation === "export"
          ? 20
          : 120;
  const windowSeconds = operation === "create" ? 3600 : 60;
  // Vercel overwrites x-vercel-forwarded-for. Never store raw network addresses.
  const address = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    .trim();
  const buckets = [
    { key: `${operation}:${owner}`, limit, seconds: windowSeconds },
  ];
  if (!identity.userId && address)
    buckets.push({ key: `guest-ai:${address}`, limit: 240, seconds: 3600 });
  for (const bucket of buckets) {
    const key = createHash("sha256").update(bucket.key).digest("hex");
    const { data, error } = await getAdminDb().rpc("consume_api_quota", {
      p_key: key,
      p_limit: bucket.limit,
      p_window_seconds: bucket.seconds,
    });
    if (error || !Array.isArray(data) || !data[0])
      throw new ApiError(
        503,
        "QUOTA_UNAVAILABLE",
        "Chưa thể kiểm tra hạn mức xử lý. Hãy thử lại sau.",
      );
    if (!data[0].allowed)
      throw new ApiError(
        429,
        "RATE_LIMITED",
        `Bạn đã gửi quá nhiều yêu cầu. Thử lại sau ${data[0].retry_after} giây.`,
        { retryAfter: data[0].retry_after },
      );
  }
}
