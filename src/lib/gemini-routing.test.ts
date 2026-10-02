const health = vi.hoisted(() => vi.fn());
vi.mock("./model-health", () => ({ modelHealthEvent: health }));
health.mockResolvedValue({ allowed: true, generation: 0, failures: 0, openUntil: null, retryAfter: 0 });
import { afterEach, it, expect, vi } from "vitest";
import { availableModels, resetModelCache, textModel, catalogCandidates } from "./gemini-routing";
import { generateLlm } from "./llm";
import { thinkingConfig, depthInstructions } from "./analysis-depth";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetModelCache();
  health.mockReset();
  health.mockResolvedValue({ allowed: true, generation: 0, failures: 0, openUntil: null, retryAfter: 0 });
});
it("excludes models absent from catalog and non-text-output models", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              {
                name: "models/gemini-3.5-flash",
                supportedGenerationMethods: ["generateContent"],
              },
            ],
          }),
        ),
      ),
  );
  expect(await availableModels("test")).toEqual(["gemini-3.5-flash"]);
  expect(
    textModel({
      name: "models/gemini-3-image",
      supportedGenerationMethods: ["generateContent"],
    }),
  ).toBe(false);
});
it("falls back after quota errors and preserves the actual successful model", async () => {
  vi.stubEnv("LLM_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash");
  const mock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: ["gemini-3.8-flash", "gemini-3.5-flash"].map((id) => ({
            name: `models/${id}`,
            supportedGenerationMethods: ["generateContent"],
          })),
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "quota" } }), {
        status: 429,
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] } }],
        }),
      ),
    );
  vi.stubGlobal("fetch", mock);
  expect(
    (
      await generateLlm({
        purpose: "chat",
        system: "test",
        prompt: "test",
        depth: "deep",
      })
    ).model,
  ).toBe("gemini-3.5-flash");
  expect(mock).toHaveBeenCalledTimes(3);
  expect(
    JSON.parse(mock.mock.calls[2][1].body).generationConfig.thinkingConfig,
  ).toEqual({ thinkingLevel: "high" });
});
it("does not retry authentication failures across models", async () => {
  vi.stubEnv("LLM_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test");
  const mock = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(new Response("{}", { status: 403 }));
  vi.stubGlobal("fetch", mock);
  await expect(
    generateLlm({ purpose: "chat", system: "test", prompt: "test" }),
  ).rejects.toMatchObject({ code: "LLM_REQUEST_REJECTED" });
  expect(mock).toHaveBeenCalledTimes(2);
});
it("sets compatible thinking controls and genuinely different instructions", () => {
  expect(thinkingConfig("gemini-3.8-flash", "deep")).toEqual({
    thinkingLevel: "high",
  });
  expect(thinkingConfig("gemini-2.5-flash", "deep")).toEqual({
    thinkingBudget: 8192,
  });
  expect(thinkingConfig("gemini-2.0-flash", "deep")).toBeUndefined();
  expect(depthInstructions("deep")).toContain("điều kiện áp dụng");
});

it("skips a model in the shared cooldown and calls the next candidate directly", async () => {
  vi.stubEnv("LLM_PROVIDER", "gemini"); vi.stubEnv("GEMINI_API_KEY", "test");
  health.mockImplementation(async (_key, model, event) => ({ allowed: model !== "gemini-3.5-flash-lite", generation: 1, failures: event === "claim" ? 5 : 0, openUntil: "future", retryAfter: 300 }));
  const mock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] } }] })));
  vi.stubGlobal("fetch", mock);
  expect((await generateLlm({ purpose: "chat", system: "test", prompt: "test" })).model).toBe("gemini-3.5-flash");
  expect(mock.mock.calls[1][0]).toContain("gemini-3.5-flash:generateContent");
  expect(mock.mock.calls.some(call => String(call[0]).includes("gemini-3.5-flash-lite:generateContent"))).toBe(false);
});
it("records quota failure once, then switches rather than retrying the same model", async () => {
  vi.stubEnv("LLM_PROVIDER", "gemini"); vi.stubEnv("GEMINI_API_KEY", "test");
  const mock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(new Response("{}", { status: 429 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] } }] })));
  vi.stubGlobal("fetch", mock);
  await generateLlm({ purpose: "chat", system: "test", prompt: "test" });
  expect(health.mock.calls.filter(call => call[2] === "failure")).toEqual([["test", "gemini-3.5-flash-lite", "failure", 0, 429]]);
});

it("keeps the requested priority and resolves preview aliases only when present in the catalog", () => {
  expect(catalogCandidates(new Set(["gemini-3.7-flash", "gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"]))).toEqual([
    "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.0-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-3.7-flash",
  ]);
});
