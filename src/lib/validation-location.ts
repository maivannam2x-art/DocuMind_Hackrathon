export type ValidationIssue = {
  code?: string; severity?: string; message: string; inputId?: string;
  inputName?: string; page?: number; unit?: number; location?: string;
};
/** Do not invent PDF pages for Word/text when extraction only knows a block. */
export function locateIssue(issue: ValidationIssue, name?: string): ValidationIssue {
  const page = issue.page ?? (Number(issue.message.match(/trang\s+(\d+)/i)?.[1]) || undefined);
  const unit = issue.unit ?? (Number(issue.message.match(/đơn vị\s+(\d+)/i)?.[1]) || undefined);
  const inputName = name ?? issue.inputName;
  const location = issue.location ?? [inputName ?? "Toàn bộ đầu vào", page ? `Trang ${page}` : unit ? `Khối nguồn ${unit} (không xác định số trang)` : "Toàn tài liệu"].join(" · ");
  return { ...issue, inputName, page, unit, location };
}
export function inputIssueStatus(inputId: string, issues: ValidationIssue[]) {
  const applicable = issues.filter(issue => !issue.inputId || issue.inputId === inputId);
  return applicable.some(issue => issue.severity === "error") ? "error"
    : applicable.some(issue => issue.severity === "warning") ? "needs_review" : "valid";
}
