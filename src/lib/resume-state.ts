import { ingestBlocked } from "@/lib/ingest-state";
export function resumeState(
  analysis: { status: string; confirmed_at?: string | null },
  inputs: Array<{ status?: string; metadata?: Record<string, unknown> | null }>,
) {
  if (analysis.status === "completed") return "result";
  if (analysis.confirmed_at) return "analysis";
  if (inputs.some((i) => ["staged", "error"].includes(i.status ?? "")))
    return ingestBlocked(inputs) ? "blocked" : "ingest";
  // Extraction can finish after F5 while the browser never sends /validate.
  // Finish that checkpoint before presenting review, without re-reading extracted files.
  if (analysis.status === "draft" && inputs.length) return "ingest";
  return "review";
}
export function outlineFromReport(
  report?: { inputs?: Array<{ structure?: unknown[] }> } | null,
) {
  return (Array.isArray(report?.inputs) ? report.inputs : []).flatMap(
    (input) => (Array.isArray(input.structure) ? input.structure : []),
  );
}
