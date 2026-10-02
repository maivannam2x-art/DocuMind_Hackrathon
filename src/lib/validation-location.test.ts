import { expect, it } from "vitest";
import { locateIssue, inputIssueStatus } from "./validation-location";
it("identifies PDF pages and preserves explicit page metadata", () => {
  expect(locateIssue({ message: "Trang 12: chưa có mã dựng lại", inputId: "a" }, "IT.pdf")).toMatchObject({ page: 12, location: "IT.pdf · Trang 12" });
  expect(locateIssue({ message: "Chưa đọc xong", page: 4 }, "IT.pdf").location).toBe("IT.pdf · Trang 4");
});
it("does not misrepresent Word block numbers as page numbers", () => {
  expect(locateIssue({ message: "Đơn vị 7: cần đối chiếu" }, "IT.docx")).toMatchObject({ unit: 7, page: undefined, location: "IT.docx · Khối nguồn 7 (không xác định số trang)" });
});
it("isolates red and yellow flags to their affected files", () => {
  const issues = [{ inputId: "a", message: "Error", severity: "error" }, { inputId: "b", message: "Warn", severity: "warning" }];
  expect(inputIssueStatus("a", issues)).toBe("error");
  expect(inputIssueStatus("b", issues)).toBe("needs_review");
  expect(inputIssueStatus("c", issues)).toBe("valid");
  expect(inputIssueStatus("c", [...issues, { message: "Global error", severity: "error" }])).toBe("error");
});
