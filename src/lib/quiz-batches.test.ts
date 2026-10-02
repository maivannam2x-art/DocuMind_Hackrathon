import { beforeEach, describe, expect, it, vi } from "vitest";
import { continueQuizCandidates, type ChunkRow } from "./pipeline";
import { quizSettings } from "./quiz-settings";
const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  call: 0,
  locked: false,
  providerFails: false,
}));
vi.mock("./llm", () => ({
  loadPrompt: async () => ({
    id: "template",
    system_prompt: "system",
    user_prompt_template: "{{content}}\n{{question_count}}",
  }),
  generateLlm: vi.fn(async () => {
    if (state.providerFails) throw new Error("provider timeout");
    const start = state.call++ * 20;
    return {
      value: {
        questions: Array.from({ length: 20 }, (_, i) => ({
          prompt: `Question about source fact ${start + i}?`,
          options: ["correct", "wrong"],
          answerIndex: 0,
          explanation: "Source evidence",
          questionType: "multiple_choice",
          difficulty: "medium",
        })),
      },
      provider: "mock",
      model: "batch-test",
      latencyMs: 1,
    };
  }),
}));
vi.mock("./db", () => ({
  envInt: () => 12000,
  getAdminDb: () => ({
    from: (table: string) => {
      let values: Record<string, unknown> = {};
      const chain = {
        update: (v: Record<string, unknown>) => {
          values = v;
          return chain;
        },
        eq: () => chain,
        or: () => chain,
        select: () => chain,
        maybeSingle: async () => {
          if (state.locked) return { data: null };
          Object.assign(state.row, values);
          return { data: { id: "chunk-1" } };
        },
        insert: async () => ({ error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ error: null }).then((v) => {
            if (table === "analysis_chunks") Object.assign(state.row, values);
            return resolve(v);
          }),
      };
      return chain;
    },
  }),
}));
beforeEach(() => {
  state.call = 0;
  state.locked = false;
  state.providerFails = false;
  state.row = {
    id: "chunk-1",
    title: "Chapter",
    content: "Source fact. ".repeat(1000),
    status: "complete",
    quiz_finished: false,
    quiz_batches: 0,
    generated_content: {
      sections: [
        {
          title: "Chapter",
          blocks: [{ type: "paragraph", content: "Source fact." }],
        },
      ],
    },
  };
});
describe("checkpointed quiz generation", () => {
  it("makes five separate provider calls to satisfy 100 questions and then stops", async () => {
    for (let i = 0; i < 5; i++)
      await continueQuizCandidates(
        "analysis",
        null,
        null,
        [{ ...state.row } as ChunkRow],
        quizSettings({ questionCount: 100 }),
      );
    expect(state.call).toBe(5);
    expect(
      (state.row.generated_content as { quizCandidates: unknown[] })
        .quizCandidates,
    ).toHaveLength(100);
    expect(state.row.quiz_finished).toBe(true);
    expect(
      await continueQuizCandidates(
        "analysis",
        null,
        null,
        [{ ...state.row } as ChunkRow],
        quizSettings({ questionCount: 100 }),
      ),
    ).toBeNull();
    expect(state.call).toBe(5);
  });
  it("waits on an active lease without calling AI", async () => {
    state.locked = true;
    const value = await continueQuizCandidates(
      "analysis",
      null,
      null,
      [{ ...state.row } as ChunkRow],
      quizSettings({ questionCount: 20 }),
    );
    expect(value?.waitMs).toBe(1500);
    expect(state.call).toBe(0);
  });
  it("releases the lease after provider failure and keeps completed section content", async () => {
    state.providerFails = true;
    await expect(
      continueQuizCandidates(
        "analysis",
        null,
        null,
        [{ ...state.row } as ChunkRow],
        quizSettings({ questionCount: 20 }),
      ),
    ).rejects.toThrow("provider timeout");
    expect(state.row.quiz_lease_until).toBeNull();
    expect(state.row.status).toBe("complete");
    expect(state.row.quiz_batches).toBe(0);
  });
  it("filters questions that do not match requested type and finishes within retry budget", async () => {
    for (let i = 0; i < 3; i++)
      await continueQuizCandidates(
        "analysis",
        null,
        null,
        [{ ...state.row } as ChunkRow],
        quizSettings({ questionCount: 20, types: ["true_false"] }),
      );
    expect(
      (state.row.generated_content as { quizCandidates: unknown[] })
        .quizCandidates,
    ).toHaveLength(0);
    expect(state.row.quiz_finished).toBe(true);
    expect(state.call).toBe(3);
  });
});
