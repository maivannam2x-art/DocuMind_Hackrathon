import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderVisual } from "@/lib/visual-renderer";
const mock = vi.hoisted(() => ({ previous: null as null | Record<string, unknown>, stored: null as null | Blob, upload: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAdminDb: () => ({
  from: () => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, maybeSingle: async () => ({ data: mock.previous, error: null }), insert: mock.insert, update: (value: unknown) => { mock.update(value); return { eq: async () => ({ error: null }) }; } };
    return chain;
  },
  storage: { from: () => ({ download: async () => ({ data: mock.stored }), upload: mock.upload }) },
}) }));
import { ensureVisualAsset, prepareReportImages } from "@/lib/visual-assets";
const block = { type: "formula", contentType: "latex" as const, content: "x=1" };
describe("Supabase image persistence", () => {
  beforeEach(() => { mock.previous = null; mock.stored = null; mock.upload.mockReset().mockResolvedValue({ error: null }); mock.insert.mockReset().mockResolvedValue({ error: null }); mock.update.mockReset(); });
  it("uploads PNG binary and stores only source, path and dimensions in database", async () => {
    await ensureVisualAsset("analysis", "result", block);
    const [path, binary, options] = mock.upload.mock.calls[0];
    expect(path).toMatch(/\.png$/);
    expect(Buffer.isBuffer(binary)).toBe(true);
    expect(options.contentType).toBe("image/png");
    const row = mock.insert.mock.calls[0][0];
    expect(row.storage_bucket).toBe("analysis-assets");
    expect(row.metadata.width).toBeGreaterThan(0);
    expect(JSON.stringify(row)).not.toMatch(/base64|data:image|inlinePng|bytes/);
  });
  it("reuses stored PNG without another upload or replacing the metadata", async () => {
    const image = await renderVisual("latex", "x=1");
    mock.previous = { id: "asset", storage_bucket: "analysis-assets", storage_path: "analysis/result/image.png", metadata: { renderer: "mathjax-resvg" } };
    mock.stored = new Blob([new Uint8Array(image.bytes)]);
    const asset = await ensureVisualAsset("analysis", "result", block);
    expect(asset.image.bytes.equals(image.bytes)).toBe(true);
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("blocks export on storage failure with retryable 503 rather than success with missing images", async () => {
    mock.upload.mockResolvedValue({ error: { message: "storage down" } });
    await expect(prepareReportImages("analysis", "result", { sections: [{ title: "S", blocks: [block] }] })).rejects.toMatchObject({ status: 503, code: "ASSET_STORAGE_UNAVAILABLE" });
    expect(mock.insert).not.toHaveBeenCalled();
  });
  it("blocks invalid LaTeX with 422 and de-duplicates repeated formulas", async () => {
    await expect(prepareReportImages("analysis", "result", { sections: [{ title: "S", blocks: [{ ...block, content: "\\frac{" }] }] })).rejects.toMatchObject({ status: 422 });
    const result = await prepareReportImages("analysis", "result", { sections: [{ title: "S", blocks: [block, block] }] });
    expect(result.images.size).toBe(1);
    expect(mock.upload).toHaveBeenCalledTimes(1);
  });
});
