import { afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ getAdminDb: () => ({ rpc }) }));
import { modelHealthEvent } from "./model-health";
afterEach(() => vi.resetAllMocks());
it("shares health through atomic RPC without sending or storing the API secret", async () => {
  rpc.mockResolvedValue({ data: { allowed: false, generation: 2, failures: 5, openUntil: "future", retryAfter: 300 }, error: null });
  const result = await modelHealthEvent("private-api-secret", "gemini-3.5-flash-lite", "failure", 1, 429);
  expect(result.retryAfter).toBe(300);
  const args = rpc.mock.calls[0][1];
  expect(args.p_scope).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(args)).not.toContain("private-api-secret");
  expect(args).toMatchObject({ p_event: "failure", p_generation: 1, p_status: 429 });
});
it("fails safely instead of calling a model when shared health cannot be read", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "unavailable" } });
  await expect(modelHealthEvent("key", "model", "claim")).rejects.toMatchObject({ status: 503, code: "MODEL_HEALTH_UNAVAILABLE" });
});
