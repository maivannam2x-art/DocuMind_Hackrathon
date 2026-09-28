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
    return ok({ items: data ?? [] });
  } catch (error) { return errorResponse(error); }
}

