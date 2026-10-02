import { describe, expect, it } from "vitest";
import { buildStaticQuiz, keyTerms, seededShuffle, shuffleOptions } from "@/lib/static-quiz";

const source = `API Gateway là điểm vào duy nhất của hệ thống và xác thực JWT cho mọi request.
Load Balancer là thành phần phân phối lưu lượng đều giữa nhiều máy chủ.
Redis Cache là bộ nhớ đệm giúp giảm số lần truy vấn tới PostgreSQL.
Service Mesh quản lý giao tiếp giữa các microservice bằng sidecar proxy.
Kubernetes tự động khởi động lại container khi health check thất bại.
Message Queue giúp tách rời producer và consumer khi xử lý bất đồng bộ.`;

describe("static quiz builder", () => {
  it("is deterministic and mixes question types grounded in the source", () => {
    const first = buildStaticQuiz(source, 6, "chunk-a");
    expect(buildStaticQuiz(source, 6, "chunk-a")).toEqual(first);
    expect(first).toHaveLength(6);
    expect(new Set(first.map(question => question.questionType))).toEqual(new Set(["multiple_choice", "true_false"]));
    for (const question of first) {
      expect(question.answerIndex).toBeGreaterThanOrEqual(0);
      expect(question.answerIndex).toBeLessThan(question.options.length);
      expect(new Set(question.options).size).toBe(question.options.length);
    }
  });

  it("does not always place the correct answer first", () => {
    const answers = ["a", "b", "c", "d", "e", "f", "g", "h"].flatMap(salt => buildStaticQuiz(source, 6, salt)).filter(question => question.questionType === "multiple_choice").map(question => question.answerIndex);
    expect(new Set(answers).size).toBeGreaterThan(1);
  });

  it("keeps the correct option attached to its text after shuffling", () => {
    const question = { options: ["right", "w1", "w2", "w3"], answerIndex: 0, questionType: "multiple_choice" };
    for (let seed = 1; seed < 20; seed++) {
      const shuffled = shuffleOptions(question, seed);
      expect(shuffled.options[shuffled.answerIndex]).toBe("right");
    }
    expect(seededShuffle([1, 2, 3, 4], 7).sort()).toEqual([1, 2, 3, 4]);
  });

  it("finds technical terms and returns nothing for empty sources", () => {
    expect(keyTerms(source)).toEqual(expect.arrayContaining(["API Gateway", "JWT"]));
    expect(buildStaticQuiz("ngắn", 3)).toEqual([]);
  });
});
