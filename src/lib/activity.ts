import { getAdminDb } from "@/lib/db";
export type Activity = {
  id: string;
  actor: "ai" | "system";
  label: string;
  status: "running" | "succeeded" | "failed";
  model?: string | null;
  created_at: string;
  completed_at?: string | null;
};
/** Persist only operational labels, never document text or private model reasoning. */
export async function startActivity(
  analysisId: string | undefined,
  actor: Activity["actor"],
  label: string,
  model?: string,
) {
  if (!analysisId) return null;
  const { data, error } = await getAdminDb()
    .from("analysis_activity")
    .insert({
      analysis_id: analysisId,
      actor,
      label: label.slice(0, 300),
      model: model ?? null,
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw new Error("Không lưu được trạng thái tác vụ.");
  return data.id as string;
}
export async function finishActivity(
  id: string | null,
  status: "succeeded" | "failed",
  label?: string,
) {
  if (!id) return;
  const { error } = await getAdminDb()
    .from("analysis_activity")
    .update({ status, completed_at: new Date().toISOString(), ...(label ? { label: label.slice(0, 300) } : {}) })
    .eq("id", id);
  if (error) console.error("Không cập nhật được nhật ký tác vụ", error.code);
}
export async function internalTask<T>(
  analysisId: string | undefined,
  label: string,
  work: () => Promise<T> | T,
): Promise<T> {
  const id = await startActivity(analysisId, "system", label);
  try {
    const value = await work();
    await finishActivity(id, "succeeded");
    return value;
  } catch (error) {
    await finishActivity(id, "failed");
    throw error;
  }
}
