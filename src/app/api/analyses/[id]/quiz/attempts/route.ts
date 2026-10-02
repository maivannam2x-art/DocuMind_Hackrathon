import { NextRequest } from "next/server";
import { z } from "zod";
import { getAnalysis, getIdentity, ownerFilter } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { ApiError, errorResponse, ok, readJson } from "@/lib/http";
import { safeBody } from "@/lib/validation";

const answerSchema = z.object({ answers: z.record(z.string(), z.union([z.number().int(), z.string(), z.boolean()])) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    await getAnalysis(identity, id);
    const body = safeBody(answerSchema, await readJson(request));
    const db = getAdminDb();
    const { data: quiz, error: quizError } = await db.from("quizzes").select("id").eq("analysis_id", id).eq("status", "ready")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (quizError || !quiz) throw new ApiError(404, "QUIZ_NOT_FOUND", "Phân tích này chưa có quiz sẵn sàng.");
    const { data: questions, error } = await db.from("quiz_questions").select("id,question_type,answer,explanation").eq("quiz_id", quiz.id);
    if (error || !questions?.length) throw new ApiError(500, "QUIZ_LOAD_FAILED", "Không tải được câu trả lời quiz.");
    const feedback: Array<{ questionId: string; correct: boolean; answer: unknown; explanation: string | null }> = [];
    let correct = 0;
    for (const question of questions) {
      const submitted = body.answers[question.id];
      const right = (question.answer as { index?: number; value?: unknown })?.index ?? (question.answer as { value?: unknown })?.value;
      const isCorrect = submitted !== undefined && String(submitted) === String(right);
      if (isCorrect) correct++;
      feedback.push({ questionId: question.id, correct: isCorrect, answer: right, explanation: question.explanation });
    }
    const percentage = Math.round((correct / questions.length) * 10000) / 100;
    const { data: attempt, error: saveError } = await db.from("quiz_attempts").insert({
      quiz_id: quiz.id, ...ownerFilter(identity), answers: body.answers,
      score: percentage, total_questions: questions.length, status: "submitted", submitted_at: new Date().toISOString(),
    }).select("id,score,total_questions,status,submitted_at").single();
    if (saveError || !attempt) throw new ApiError(500, "ATTEMPT_SAVE_FAILED", "Không lưu được kết quả làm quiz.", saveError?.message);
    return ok({ attempt, correctAnswers: correct, feedback });
  } catch (error) { return errorResponse(error); }
}

export async function GET(request:NextRequest, context:Context){
  try{const identity=await getIdentity(request),{id}=await context.params;await getAnalysis(identity,id);
    const db=getAdminDb(),{data:quizzes,error:qError}=await db.from('quizzes').select('id').eq('analysis_id',id);
    if(qError)throw new ApiError(503,'ATTEMPTS_LOAD_FAILED','Không tải được lịch sử quiz.');
    if(!quizzes?.length)return ok({attempts:[]});
    const {data,error}=await db.from('quiz_attempts').select('id,score,total_questions,submitted_at').in('quiz_id',quizzes.map(q=>q.id)).match(ownerFilter(identity)).eq('status','submitted').order('submitted_at',{ascending:false}).limit(20);
    if(error)throw new ApiError(503,'ATTEMPTS_LOAD_FAILED','Không tải được lịch sử quiz.');return ok({attempts:data??[]});
  }catch(error){return errorResponse(error);}
}
