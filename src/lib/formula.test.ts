import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderFormulaPng } from "@/lib/formula";

describe("formula rasterization", () => {
  it("produces a visible, bounded PNG for LaTeX in the report", async () => {
    const formula = await renderFormulaPng("RTT=t_2-t_1");
    expect(formula.bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(formula.width).toBeGreaterThan(80);
    const stats = await sharp(formula.bytes).stats();
    expect(stats.channels[3].max).toBeGreaterThan(0);
    expect(stats.channels[3].mean).toBeGreaterThan(0);
  });

  it("rejects invalid LaTeX instead of exporting an error glyph as a formula", async () => {
    await expect(renderFormulaPng("\\unknownCommand{x}")).rejects.toThrow("LaTeX");
  });
});
