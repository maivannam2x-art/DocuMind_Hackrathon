import { NextRequest } from "next/server";
import { z } from "zod";
import { getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  username: z.union([z.string().trim().regex(/^[a-zA-Z0-9_-]{3,24}$/), z.literal("")]).optional(),
}).refine(value => value.displayName !== undefined || value.username !== undefined, {
  message: "Thêm tối thiểu một thông tin hồ sơ cần cập nhật.",
});

export async function GET(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity.userId) throw new ApiError(401, "AUTH_REQUIRED", "Đăng nhập để xem hồ sơ tài khoản.");
    const db = getAdminDb();
    const [{ data: profile, error: profileError }, { data: auth, error: authError }] = await Promise.all([
      db.from("profiles").select("username, display_name, avatar_url").eq("id", identity.userId).maybeSingle(),
      db.auth.admin.getUserById(identity.userId),
    ]);
    if (profileError || authError) throw new ApiError(500, "PROFILE_READ_FAILED", "Không tải được hồ sơ tài khoản.", profileError?.message ?? authError?.message);
    return ok({
      email: auth.user?.email ?? "",
      displayName: profile?.display_name ?? auth.user?.user_metadata?.display_name ?? "",
      username: profile?.username ?? "",
      avatarUrl: profile?.avatar_url ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity.userId) throw new ApiError(401, "AUTH_REQUIRED", "Đăng nhập để chỉnh sửa hồ sơ tài khoản.");
    const parsed = updateProfileSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "INVALID_PROFILE", "Tên hiển thị hoặc tên người dùng chưa hợp lệ.", parsed.error.flatten());
    const update: Record<string, string | null> = {};
    if (parsed.data.displayName !== undefined) update.display_name = parsed.data.displayName;
    if (parsed.data.username !== undefined) update.username = parsed.data.username.trim().toLowerCase() || null;
    const { data, error } = await getAdminDb().from("profiles").update(update).eq("id", identity.userId)
      .select("username, display_name, avatar_url").single();
    if (error?.code === "23505") throw new ApiError(409, "USERNAME_TAKEN", "Tên người dùng này đã được sử dụng.");
    if (error || !data) throw new ApiError(500, "PROFILE_UPDATE_FAILED", "Không lưu được thay đổi hồ sơ.", error?.message);
    return ok({ displayName: data.display_name ?? "", username: data.username ?? "", avatarUrl: data.avatar_url ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}

