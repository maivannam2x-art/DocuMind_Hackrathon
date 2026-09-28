import { NextRequest } from "next/server";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    await getAnalysis(identity, id);
    const db = getAdminDb();
    const { data: quiz, error } = await db.from("quizzes").select("id,title,settings,status,created_at")
      .eq("analysis_id", id).eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new ApiError(500, "DATABASE_ERROR", "Không tải được quiz.", error.message);
    if (!quiz) throw new ApiError(404, "QUIZ_NOT_FOUND", "Phân tích này chưa có quiz.");
    const { data: questions, error: questionError } = await db.from("quiz_questions")
      .select("id,question_index,question_type,prompt,options,difficulty").eq("quiz_id", quiz.id).order("question_index");
    if (questionError) throw new ApiError(500, "DATABASE_ERROR", "Không tải được câu hỏi.", questionError.message);
    return ok({ quiz, questions: questions ?? [] });
  } catch (error) { return errorResponse(error); }
}

