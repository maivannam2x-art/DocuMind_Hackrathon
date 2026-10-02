import { quizSettings } from "@/lib/quiz-settings";
import { enforceRateLimit } from "@/lib/rate-limit";
import { NextRequest } from "next/server";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok } from "@/lib/http";
import { createQuizForAnalysis, type ChunkRow } from "@/lib/pipeline";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 90;

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

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    await enforceRateLimit(request, identity, "quiz");
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    if (analysis.status !== "completed") throw new ApiError(409, "ANALYSIS_NOT_COMPLETE", "Chỉ tạo quiz sau khi phân tích hoàn tất.");
    if (!analysis.quiz_enabled) throw new ApiError(409, "QUIZ_NOT_ENABLED", "Phiên này không bật tạo quiz.");
    const db = getAdminDb();
    const { data: existing } = await db.from("quizzes").select("id,title,settings,status,created_at")
      .eq("analysis_id", id).eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      const { data: existingQuestions } = await db.from("quiz_questions")
        .select("id,question_index,question_type,prompt,options,difficulty").eq("quiz_id", existing.id).order("question_index");
      if (existingQuestions?.length) return ok({ quiz: existing, questions: existingQuestions });
    }
    const [{ data: result, error: resultError }, { data: chunks, error: chunkError }] = await Promise.all([
      db.from("analysis_results").select("id").eq("analysis_id", id).eq("is_current", true).maybeSingle(),
      db.from("analysis_chunks").select("*").eq("analysis_id", id).eq("status", "complete").order("chunk_index"),
    ]);
    if (resultError || !result) throw new ApiError(404, "RESULT_NOT_FOUND", "Không tìm thấy kết quả phân tích.", resultError?.message);
    if (chunkError || !chunks?.length) throw new ApiError(422, "QUIZ_SOURCE_MISSING", "Không tìm thấy phần tài liệu để tạo quiz.", chunkError?.message);
    await createQuizForAnalysis({
      analysisId: id,
      resultId: result.id,
      topicId: analysis.topic_id ?? null,
      specializationId: analysis.specialization_id ?? null,
      settings: quizSettings(analysis.quiz_settings), chunks: chunks as ChunkRow[],
    });
    const { data: quiz, error: quizError } = await db.from("quizzes").select("id,title,settings,status,created_at")
      .eq("analysis_id", id).eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (quizError || !quiz) throw new ApiError(quizError?503:422, quizError?"QUIZ_CREATE_FAILED":"QUIZ_SOURCE_INSUFFICIENT", "Tài liệu chưa đủ để tạo câu hỏi đúng cấu hình. Hãy bổ sung nội dung hoặc chọn độ khó khác.");
    const { data: questions, error: questionError } = await db.from("quiz_questions")
      .select("id,question_index,question_type,prompt,options,difficulty").eq("quiz_id", quiz.id).order("question_index");
    if (questionError || !questions?.length) throw new ApiError(500, "QUIZ_CREATE_FAILED", "Quiz chưa có câu hỏi.", questionError?.message);
    return ok({ quiz, questions });
  } catch (error) { return errorResponse(error); }
}
