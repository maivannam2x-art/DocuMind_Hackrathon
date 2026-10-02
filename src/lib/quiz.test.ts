import { describe, expect, it } from "vitest";
import { createSourceGroundedFallback, normalizeQuizCandidates } from "@/lib/quiz";

describe("quiz generation response normalization", () => {
  it("normalizes both an object response and Gemini's root-array response", () => {
    const question = { prompt: "Which protocol uses a three-way handshake?", options: ["TCP", "DNS"], answerIndex: 0, explanation: "TCP uses a handshake." };
    expect(normalizeQuizCandidates({ questions: [question] }, "chunk-1")).toHaveLength(1);
    expect(normalizeQuizCandidates([question], "chunk-1")[0]).toMatchObject({ answerIndex: 0, questionType: "multiple_choice" });
  });

  it("drops incomplete LLM questions and can build a source-grounded fallback", () => {
    expect(normalizeQuizCandidates([{ prompt: "A prompt without options" }], "chunk-1")).toEqual([]);
    const fallback = createSourceGroundedFallback("TCP establishes a reliable connection using a three-way handshake before transmitting application data.", "chunk-1");
    expect(fallback[0]).toMatchObject({ questionType: "true_false", chunkId: "chunk-1" });
    expect(fallback[0].options).toEqual(["Đúng", "Sai"]);
  });
});
