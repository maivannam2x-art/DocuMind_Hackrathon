import { NextRequest } from "next/server";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb } from "@/lib/db";
import { errorResponse, ok } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    const db = getAdminDb();
    const [{ data: inputs }, { data: chunks }, { data: result }, { data: quizzes }] = await Promise.all([
      db.from("analysis_inputs").select("id,input_kind,original_name,mime_type,byte_size,status,validation_report,position").eq("analysis_id", id).order("position"),
      db.from("analysis_chunks").select("id,input_id,chunk_index,title,content,status,error_message").eq("analysis_id", id).order("chunk_index"),
      db.from("analysis_results").select("id,version,schema_version,result_json,summary,created_at").eq("analysis_id", id).eq("is_current", true).maybeSingle(),
      db.from("quizzes").select("id,title,status,created_at").eq("analysis_id", id).order("created_at", { ascending: false }),
    ]);
    return ok({ analysis, inputs: inputs ?? [], chunks: chunks ?? [], result: result ?? null, quizzes: quizzes ?? [] });
  } catch (error) { return errorResponse(error); }
}

