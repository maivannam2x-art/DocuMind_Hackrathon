import { describe, expect, it, vi } from "vitest";
import { ApiError, errorResponse } from "@/lib/http";

describe("API error responses", () => {
  it("hides unexpected internal error details from the caller", async () => {
    const response = errorResponse(new Error("postgres password=hidden stack trace"));
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.error.message).toContain("Mã hỗ trợ:");
    expect(JSON.stringify(payload)).not.toContain("postgres password");
  });

  it("replaces raw upstream errors with a retryable message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(new ApiError(502, "LLM_PROVIDER_ERROR", "raw provider internals", { secret: "do-not-return" }));
    const payload = await response.json();
    expect(response.status).toBe(502);
    expect(payload.error.message).toContain("tạm thời không phản hồi");
    expect(JSON.stringify(payload)).not.toContain("do-not-return");
    log.mockRestore();
  });
});
