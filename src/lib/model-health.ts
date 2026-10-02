import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
export type ModelHealth = {
  allowed: boolean;
  generation: number;
  failures: number;
  openUntil: string | null;
  retryAfter: number;
};
/** SHA-256 scopes health per API credential without storing the credential. */
export async function modelHealthEvent(key: string, model: string, event: "claim" | "success" | "failure", generation?: number, status?: number): Promise<ModelHealth> {
  let db;
  try { db = getAdminDb(); } catch { throw new ApiError(503, "MODEL_HEALTH_UNAVAILABLE", "Chưa cấu hình trạng thái model. Hãy thử lại sau."); }
  const { data, error } = await db.rpc("gemini_circuit_event", {
    p_scope: createHash("sha256").update(key).digest("hex"), p_model: model,
    p_event: event, p_generation: generation ?? null, p_status: status ?? null,
  });
  if (error || !data) throw new ApiError(503, "MODEL_HEALTH_UNAVAILABLE", "Chưa kiểm tra được trạng thái model. Tiến độ đã lưu; hãy tiếp tục sau.");
  return data as ModelHealth;
}
