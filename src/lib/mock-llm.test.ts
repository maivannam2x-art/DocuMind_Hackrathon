import { describe, expect, it } from "vitest";
import { mockResponse, promptSource } from "@/lib/mock-llm";

describe("static mock provider", () => {
  it("reads content from every seeded template label", () => {
    expect(promptSource("Tạo quiz. Nội dung nguồn: TCP dùng bắt tay ba bước.")).toBe("TCP dùng bắt tay ba bước.");
    expect(promptSource("Phân tích nội dung sau: SQL JOIN. Trả JSON với sections")).toBe("SQL JOIN");
    expect(promptSource("Nguồn: Vị trí trong tài liệu: A › B\n\nThân bài.\n\nQUY TẮC CẤU TRÚC NGUỒN: ...")).toBe("Thân bài.");
  });

  it("returns multiple-choice and true/false quiz questions", () => {
    const value = mockResponse({ purpose: "quiz_generation", system: "", prompt: "Tạo 4 câu hỏi. Nội dung nguồn: API Gateway là điểm vào duy nhất của hệ thống. Load Balancer là thành phần phân phối lưu lượng. Redis Cache là bộ nhớ đệm cho PostgreSQL. Kubernetes khởi động lại container khi health check lỗi." }) as { questions: unknown[] };
    expect(value.questions).toHaveLength(4);
  });

  it("answers chat from matching result passages with citations", () => {
    const context = JSON.stringify({ sections: [{ title: "Gateway", blocks: [{ type: "paragraph", content: "API Gateway xác thực JWT trước khi chuyển request tới service." }] }, { title: "Sort", blocks: [{ type: "paragraph", content: "Merge sort có độ phức tạp O(n log n) trong mọi trường hợp." }] }] });
    const value = mockResponse({ purpose: "chat", system: "", prompt: `Tóm tắt và ngữ cảnh tài liệu: ${context}. Câu hỏi của người học: Gateway xác thực gì?. Trả JSON có answer` }) as { answer: string; citations: string[] };
    expect(value.answer).toContain("JWT");
    expect(value.citations).toEqual(["Gateway"]);
  });

  it("returns static OCR blocks and only LaTeX for Office Math", () => {
    const image = mockResponse({ purpose: "document_ocr", system: "", prompt: "Đọc network.png. Giữ đúng thứ tự" }) as { blocks: Array<{ kind: string }> };
    expect(image.blocks.length).toBeGreaterThan(2);
    const math = mockResponse({ purpose: "document_ocr", system: "", prompt: "Chuyển biểu thức Office Math sau sang LaTeX" }) as { blocks: Array<{ kind: string }> };
    expect(math.blocks.every(block => block.kind === "latex")).toBe(true);
  });
});
