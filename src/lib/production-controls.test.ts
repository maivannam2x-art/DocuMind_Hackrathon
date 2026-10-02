import { afterEach, describe, expect, it, vi } from "vitest";
import { quizSettings, quizSettingsSchema, quizQuotas } from "./quiz-settings";
import { retrieveChatContext, searchTerms } from "./chat-context";
import { privateLogPayload } from "./log-privacy";
import { INPUT_LIMITS, supportedFile } from "./limits";
import { mimeTypeForFilename } from "./documents";
import { RequestFailure, resumableLoop } from "./resumable-loop";
import { workspaceFlow, recoveryScreen } from "./workspace-flow";
import { generateLlm } from "./llm";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("quiz settings and source allocation", () => {
  it("accepts 100 questions and rejects invalid user counts", () => {
    expect(quizSettings({ questionCount: 100 }).questionCount).toBe(100);
    for (const n of [0, 101, 1.5])
      expect(quizSettingsSchema.safeParse({ questionCount: n }).success).toBe(
        false,
      );
  });
  it("distributes exactly requested questions proportionally", () => {
    expect(quizQuotas([9000, 1000, 1], 100).reduce((a, b) => a + b, 0)).toBe(
      100,
    );
    expect(quizQuotas([9000, 1000, 1], 100)[0]).toBe(90);
    expect(quizQuotas([9000, 1000, 1], 20)[2]).toBe(0);
  });
  it("handles empty sources and equal size sources", () => {
    expect(quizQuotas([], 20)).toEqual([]);
    expect(quizQuotas([100, 100, 100], 20)).toEqual([7, 7, 6]);
  });
  it("uses compatible defaults for older sessions", () =>
    expect(quizSettings(null)).toMatchObject({
      questionCount: 20,
      difficulty: "mixed",
      types: ["multiple_choice"],
    }));
});
describe("chat retrieval over full source", () => {
  it("retrieves a chapter beyond the old 8000 character cutoff", () => {
    const result = {
      sections: [
        {
          title: "Introduction",
          blocks: [
            { type: "paragraph", content: "Common details. ".repeat(1500) },
          ],
        },
        {
          title: "Raft consensus",
          blocks: [
            {
              type: "paragraph",
              content: "Raft elects a leader using majority votes.",
            },
          ],
        },
      ],
    };
    expect(
      retrieveChatContext(result, [], "How does Raft elect a leader?")
        .passages[0].title,
    ).toBe("Raft consensus");
  });
  it("normalizes accented Vietnamese keywords", () =>
    expect(searchTerms("ĐỒ THỊ và cơ sở dữ liệu")).toEqual([
      "do",
      "thi",
      "so",
      "du",
      "lieu",
    ]));
  it("includes source citations and stays within JSON budget", () => {
    const value = retrieveChatContext(
      { summary: "s".repeat(900) },
      [
        {
          id: "source-42",
          title: "Deadlock",
          content: "deadlock wait graph. ".repeat(300),
        },
      ],
      "deadlock",
      3000,
    );
    expect(value.passages[0].sourceId).toBe("source-42");
    expect(JSON.stringify(value).length).toBeLessThanOrEqual(3000);
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });
  it("does not select duplicate passages", () => {
    const context = retrieveChatContext(
      { sections: [] },
      [
        { id: "1", title: "API", content: "HTTP requests." },
        { id: "2", title: "API", content: "HTTP requests." },
      ],
      "HTTP",
    );
    expect(context.passages).toHaveLength(1);
  });
});
describe("privacy and supported inputs", () => {
  it("redacts document bodies by default without losing integrity metadata", () => {
    vi.stubEnv("LLM_LOG_CONTENT", "false");
    const value = privateLogPayload({ text: "private secret content" });
    expect(JSON.stringify(value)).not.toContain("secret");
    expect(value).toMatchObject({
      redacted: true,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it("allows explicit diagnostic logging only when enabled", () => {
    vi.stubEnv("LLM_LOG_CONTENT", "true");
    expect(privateLogPayload({ text: "sample" })).toEqual({ text: "sample" });
  });
  it("shares a supported MIME for every advertised extension", () => {
    for (const extension of INPUT_LIMITS.extensions)
      expect(mimeTypeForFilename("test." + extension)).toBeTruthy();
    expect(supportedFile("test.exe")).toBe(false);
  });
});
describe("resumable processing loop", () => {
  it("stops when complete", async () => {
    vi.useFakeTimers();
    let count = 0;
    const p = resumableLoop(
      async () => ++count,
      (n) => n === 2,
      () => {},
      new AbortController().signal,
    );
    await vi.runAllTimersAsync();
    expect(await p).toBe(2);
    expect(count).toBe(2);
  });
  it("retries transient rate limits using Retry-After", async () => {
    vi.useFakeTimers();
    let count = 0;
    const p = resumableLoop(
      async () => {
        if (++count === 1) throw new RequestFailure("busy", 429, 3);
        return 42;
      },
      () => true,
      () => {},
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(2999);
    expect(count).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe(42);
  });
  it("does not retry invalid requests", async () => {
    const step = vi.fn().mockRejectedValue(new RequestFailure("invalid", 422));
    await expect(
      resumableLoop(
        step,
        () => false,
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(step).toHaveBeenCalledTimes(1);
  });
  it("can pause before making the next request", async () => {
    const controller = new AbortController();
    controller.abort();
    const step = vi.fn();
    await expect(
      resumableLoop(
        step,
        () => false,
        () => {},
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(step).not.toHaveBeenCalled();
  });
  it("bounds the number of processing requests", async () => {
    vi.useFakeTimers();
    const p = resumableLoop(
      async () => false,
      () => false,
      () => {},
      new AbortController().signal,
      2,
    );
    const check = expect(p).rejects.toThrow("giới hạn");
    await vi.runAllTimersAsync();
    await check;
  });
});
describe("Gemini transport", () => {
  it("uses a header instead of a URL API key", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-private-key");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] } }],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await generateLlm({ purpose: "chat", system: "test", prompt: "test" });
    const [url, options] = fetch.mock.calls[0];
    expect(url).not.toContain("key=");
    expect(options.headers["x-goog-api-key"]).toBe("test-private-key");
  });
  it("returns a typed provider error for non-JSON responses", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>provider unavailable</html>", { status: 503 }),
        ),
    );
    await expect(
      generateLlm({ purpose: "chat", system: "test", prompt: "test" }),
    ).rejects.toMatchObject({ code: "LLM_PROVIDER_ERROR", status: 502 });
  });
});
it("retains analysis and progress when switching screens", () => {
  const state = {
    screen: "processing" as const,
    analysis: { id: "1" },
    progress: { completed: 2, total: 4 },
  };
  expect(workspaceFlow(state, { type: "screen", value: "history" })).toEqual({
    ...state,
    screen: "history",
  });
});

it("recovers completed processing even when its final response was lost", () => {
  expect(recoveryScreen("completed", true)).toBe("result");
  expect(recoveryScreen("processing", true)).toBe("processing");
  expect(recoveryScreen("ready", true)).toBe("processing");
  expect(recoveryScreen("failed", true)).toBe("processing");
  expect(recoveryScreen("needs_review", false)).toBe("review");
});
