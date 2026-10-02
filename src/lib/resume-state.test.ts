import { describe, it, expect } from "vitest";
import { resumeState, outlineFromReport } from "./resume-state";
describe("resume extraction and analysis independently", () => {
  it("never treats an errored oversized draft as a confirmed analysis", () => {
    expect(
      resumeState({ status: "draft" }, [
        { status: "error", metadata: { errorCode: "PDF_TOO_MANY_PAGES" } },
      ]),
    ).toBe("blocked");
    expect(outlineFromReport({})).toEqual([]);
  });
  it("resumes page OCR from its persisted checkpoint", () =>
    expect(
      resumeState({ status: "draft" }, [
        { status: "staged", metadata: { extractionProgress: { nextUnit: 3 } } },
      ]),
    ).toBe("ingest"));
  it("routes only confirmed sessions to analysis and completed sessions to results", () => {
    expect(resumeState({ status: "processing", confirmed_at: "now" }, [])).toBe(
      "analysis",
    );
    expect(resumeState({ status: "completed" }, [])).toBe("result");
  });
  it("finishes validation when extraction completed after the browser closed", () => {
    expect(resumeState({ status: "draft" }, [{ status: "extracted" }])).toBe(
      "ingest",
    );
    expect(
      resumeState({ status: "needs_review" }, [{ status: "extracted" }]),
    ).toBe("review");
  });
});
