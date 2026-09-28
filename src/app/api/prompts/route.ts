import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const specializationId = new URL(request.url).searchParams.get("specializationId");
    let query = getAdminDb().from("prompt_templates")
      .select("id,purpose,name,version,specialization_id,topic_id")
      .eq("purpose", "section_generation").eq("is_active", true)
      .order("name").order("version", { ascending: false });
    if (specializationId) query = query.or(`specialization_id.is.null,specialization_id.eq.${specializationId}`);
    const { data, error } = await query;
    if (error) throw new ApiError(500, "DATABASE_ERROR", "Không tải được danh sách prompt IT.", error.message);
    return ok({ items: (data ?? []).map((item: Record<string, unknown>) => ({
      ...item,
      scope: item.topic_id ? "it" : "general_fallback",
      description: item.topic_id ? "Prompt chuyên sâu cho tài liệu IT." : "Prompt dự phòng cho tài liệu ngoài IT hoặc chưa xác định được chủ đề; kết quả sẽ ít chuyên sâu hơn.",
    })) });
  } catch (error) { return errorResponse(error); }
}
