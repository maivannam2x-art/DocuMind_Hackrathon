export type AnalysisDepth = "quick" | "standard" | "deep";
export function analysisDepth(prompt?: string | null): AnalysisDepth {
  const match = /^Mức phân tích: ([^.]+)\./.exec(prompt ?? "");
  return match?.[1] === "chuyên sâu"
    ? "deep"
    : match?.[1] === "nhanh"
      ? "quick"
      : "standard";
}
export function depthInstructions(depth: AnalysisDepth) {
  const base =
    "Giữ đủ tiêu đề, ý chính, bảng, sơ đồ, công thức nguồn và quan hệ giữa chúng. Dùng block có contentType rõ ràng. Không bịa kiến thức hoặc số liệu; nếu giải thích ngoài nguồn, đánh dấu metadata.isSupplementary=true. Không thay nội dung bằng JSON string.";
  return (
    base +
    (depth === "deep"
      ? " Mức chuyên sâu: mỗi chủ đề có tóm tắt ngắn, giải thích cơ chế từng bước, điều kiện áp dụng, giới hạn, lỗi thường gặp và ví dụ khi nguồn cung cấp. Có bảng so sánh nếu nguồn có tiêu chí. Kiểm tra lại phát biểu với nguồn trước khi trả lời. Độ chi tiết không được làm mất ý chính hoặc lặp dài dòng."
      : depth === "quick"
        ? " Mức nhanh: giải thích ngắn gọn các ý chính, giữ dữ liệu cấu trúc cần thiết."
        : " Mức tiêu chuẩn: giải thích cân bằng, định nghĩa, cơ chế và ví dụ có trong nguồn.")
  );
}
export function thinkingConfig(model: string, depth: AnalysisDepth) {
  if (/^gemini-[3-9]\./.test(model) || /^gemini-3-/.test(model))
    return { thinkingLevel: depth === "deep" ? "high" : depth === "standard" && !model.includes("pro") ? "medium" : "low" };
  if (model.startsWith("gemini-2.5"))
    return {
      thinkingBudget:
        depth === "deep"
          ? 8192
          : depth === "standard"
            ? 2048
            : model.includes("pro")
              ? 128
              : 0,
    };
  return undefined;
}
