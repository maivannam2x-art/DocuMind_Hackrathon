import { afterEach, it, expect, vi } from "vitest";
import { availableModels, resetModelCache, textModel } from "./gemini-routing";
import { generateLlm } from "./llm";
import { thinkingConfig, depthInstructions } from "./analysis-depth";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetModelCache();
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
