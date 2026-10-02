import { NextRequest } from "next/server";
import { getAnalysis, getIdentity } from "@/lib/auth";
import { getAdminDb, envInt } from "@/lib/db";
import { chunkText, normalizeText, outlineText } from "@/lib/documents";
import { ApiError, errorResponse, ok } from "@/lib/http";
import { locateIssue, inputIssueStatus, type ValidationIssue } from "@/lib/validation-location";
import { sourceContentBlocks } from "@/lib/source-content";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    const { id } = await context.params;
    const analysis = await getAnalysis(identity, id);
    if (!["draft", "needs_review"].includes(analysis.status)) {
      throw new ApiError(409, "INVALID_ANALYSIS_STATE", "Chỉ có thể kiểm tra đầu vào mới hoặc đang ở bước duyệt.", { status: analysis.status });
    }
    const db = getAdminDb();
    const { data: inputs, error } = await db.from("analysis_inputs").select("*").eq("analysis_id", id).order("position");
    if (error || !inputs?.length) throw new ApiError(422, "NO_INPUTS", "Chưa có tài liệu đầu vào.");
    const maxChars = envInt("MAX_ANALYSIS_CHARS", 500000);
    const totalText = inputs.map((input: Record<string, string | null>) => input.edited_text ?? input.normalized_text ?? input.original_text ?? "").join("\n\n");
    const totalChars = totalText.length;
    let rules: ValidationIssue[] = [];
    const hasVisualSource = sourceContentBlocks(totalText).some(block => ["latex", "mermaid", "plantuml"].includes(block.contentType ?? ""));
    if (totalChars < 40 && !hasVisualSource) rules.push({ code: "input_text_required", severity: "error", message: "Chưa có đủ văn bản, sơ đồ hoặc công thức để phân tích. Ảnh minh họa thuần túy được bỏ qua." });
    if (totalChars > maxChars) rules.push({ code: "input_max_characters", severity: "error", message: `Tổng nội dung vượt ${maxChars.toLocaleString()} ký tự.` });
    const chunkRows: Array<Record<string, unknown>> = [];
    const inputReports: Array<Record<string, unknown>> = [];
    let headingCount = 0;
    for (const input of inputs as Array<Record<string, unknown> & { id: string; original_name: string; edited_text?: string | null; normalized_text?: string | null; original_text?: string | null }>) {
      const text = normalizeText(input.edited_text ?? input.normalized_text ?? input.original_text ?? "");
      const metadata = input.metadata as Record<string, unknown> | null;
      if (input.status === "staged" || metadata?.errorCode) {
        const progress = metadata?.extractionProgress as { nextUnit?: number } | undefined;
        const sourceLocation = metadata?.extractionErrorLocation as { page?: number; unit?: number } | undefined;
        rules.push({ code: "extraction_incomplete", severity: "error", message: `Tệp chưa đọc xong. ${metadata?.errorCode ? `Mã lỗi: ${metadata.errorCode}. ` : ""}Tiếp tục đọc hoặc tải lại tệp trước khi xác nhận.`, inputId: input.id,
          ...(sourceLocation ?? (metadata?.pageCount && progress ? { page: (progress.nextUnit ?? 0) + 1 } : {})) });
      }
      if (Array.isArray(metadata?.ocrWarnings)) for (const warning of metadata.ocrWarnings) rules.push({ code: "visual_review_needed", severity: "warning", message: `${input.original_name}: ${String(warning)}`, inputId: input.id });
      if (Number(metadata?.skippedIllustrations) > 0) rules.push({ code: "illustrations_skipped", severity: "info", message: `${input.original_name}: bỏ qua ${metadata?.skippedIllustrations} ảnh minh họa không chứa dữ liệu kỹ thuật.`, inputId: input.id });
      const hasVisual = sourceContentBlocks(text).some(block => ["latex", "mermaid", "plantuml"].includes(block.contentType ?? ""));
      if (text.length < 40 && !hasVisual) {
        if (Number(metadata?.skippedIllustrations) > 0 && !text) continue;
        rules.push({ code: "input_text_required", severity: "error", message: `Không trích xuất đủ văn bản từ ${input.original_name || "đầu vào"}.`, inputId: input.id });
      }
      if (text.length > 0 && text.length < 500) rules.push({ code: "input_low_text", severity: "warning", message: "Nội dung ngắn; kết quả có thể ít chi tiết. Kiểm tra bản gốc nếu nghi ngờ thiếu nội dung.", inputId: input.id });
      let chunks: ReturnType<typeof chunkText> = [];
      try { chunks = chunkText(text); }
      catch (cause) {
        if (!(cause instanceof ApiError)) throw cause;
        rules.push({ code: cause.code, severity: "error", message: cause.message, inputId: input.id });
      }
      const structure = outlineText(text);
      headingCount += structure.filter(item => item.title !== "Tài liệu" && item.title !== "Mở đầu").length;
      for (const chunk of chunks) chunkRows.push({
        analysis_id: id, input_id: input.id, chunk_index: chunk.chunkIndex, title: chunk.title,
        content: chunk.content, char_start: chunk.charStart, char_end: chunk.charEnd, status: "pending",
      });
      inputReports.push({
        id: input.id, name: input.original_name, characters: text.length,
        words: text ? text.split(/\s+/).length : 0, chunkCount: chunks.length,
        structure, 
      });
    }
    if (headingCount === 0) rules.push({ code: "structure_no_heading", severity: "info", message: "Không phát hiện tiêu đề rõ ràng; tài liệu được chia theo độ dài." });
    rules = rules.map(rule => locateIssue(rule, inputs.find(input => input.id === rule.inputId)?.original_name));
    const blocking = rules.some(rule => rule.severity === "error");
    const report = {
      valid: !blocking, blockingErrors: rules.filter(rule => rule.severity === "error"),
      warnings: rules.filter(rule => rule.severity === "warning"),
      notes: rules.filter(rule => rule.severity === "info"),
      totalCharacters: totalChars, totalWords: totalText ? totalText.split(/\s+/).length : 0,
      inputCount: inputs.length, chunkCount: chunkRows.length, inputs: inputReports,
    };
    await db.from("analysis_chunks").delete().eq("analysis_id", id);
    if (!blocking && chunkRows.length) {
      const { error: chunkError } = await db.from("analysis_chunks").insert(chunkRows);
      if (chunkError) throw new ApiError(503, "CHUNK_SAVE_FAILED", "Không lưu được cấu trúc tài liệu.", chunkError.message);
    }
    for (const input of inputs) {
      await db.from("analysis_inputs").update({
        status: inputIssueStatus(input.id, rules),
        validation_report: { characterCount: inputReports.find(x => x.id === input.id)?.characters ?? 0, issues: rules.filter(rule => !rule.inputId || rule.inputId === input.id) },
      }).eq("id", input.id);
    }
    await db.from("analyses").update({ validation_report: report, status: blocking ? "draft" : "needs_review", error_code: null, error_message: null }).eq("id", id);
    return ok({ analysisId: id, status: blocking ? "draft" : "needs_review", report });
  } catch (error) { return errorResponse(error); }
}
