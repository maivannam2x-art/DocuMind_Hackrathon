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
    const includeContent = new URL(request.url).searchParams.get("includeContent") === "true";
    const inputColumns = includeContent
      ? "id,input_kind,original_name,mime_type,byte_size,status,validation_report,position,original_text,normalized_text,edited_text,storage_path,storage_bucket"
      : "id,input_kind,original_name,mime_type,byte_size,status,validation_report,position";
    const [{ data: inputs }, { data: chunks }, { data: result }, { data: quizzes }] = await Promise.all([
      db.from("analysis_inputs").select(inputColumns).eq("analysis_id", id).order("position"),
      db.from("analysis_chunks").select("id,input_id,chunk_index,title,content,status,error_message").eq("analysis_id", id).order("chunk_index"),
      db.from("analysis_results").select("id,version,schema_version,result_json,summary,created_at").eq("analysis_id", id).eq("is_current", true).maybeSingle(),
      db.from("quizzes").select("id,title,status,created_at").eq("analysis_id", id).order("created_at", { ascending: false }),
    ]);
    let responseInputs: Record<string, unknown>[] = (inputs ?? []) as unknown as Record<string, unknown>[];
    if (includeContent && responseInputs.length) {
      responseInputs = await Promise.all(responseInputs.map(async input => {
        const mimeType = String(input.mime_type ?? "");
        const storagePath = typeof input.storage_path === "string" ? input.storage_path : null;
        let previewUrl: string | null = null;
        if (storagePath && ["image/png", "image/jpeg"].includes(mimeType)) {
          const { data: signed } = await db.storage.from(String(input.storage_bucket ?? "analysis-inputs")).createSignedUrl(storagePath, 600);
          previewUrl = signed?.signedUrl ?? null;
        }
        const safeInput = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "storage_path" && key !== "storage_bucket"));
        return { ...safeInput, previewUrl };
      }));
    }
    return ok({ analysis, inputs: responseInputs, chunks: chunks ?? [], result: result ?? null, quizzes: quizzes ?? [] });
  } catch (error) { return errorResponse(error); }
}
