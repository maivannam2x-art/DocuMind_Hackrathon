import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    const db = getAdminDb();
    const { data: topics, error } = await db.from("topics").select("id,code,name,description,sort_order")
      .eq("is_active", true).order("sort_order");
    if (error) throw error;
    const { data: specializations, error: childError } = await db.from("topic_specializations")
      .select("id,topic_id,parent_id,name,slug,description,sort_order").eq("is_active", true).order("sort_order");
    if (childError) throw childError;
    return NextResponse.json({ data: (topics ?? []).map((topic: Record<string, unknown>) => ({
      ...topic, specializations: (specializations ?? []).filter((item: Record<string, unknown>) => item.topic_id === topic.id),
    })) });
  } catch (error) { return errorResponse(error); }
}

