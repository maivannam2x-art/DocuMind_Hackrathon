import { afterEach, expect, it, vi } from "vitest";
import { renderMermaid } from "./mermaid-browser";
const mock = vi.hoisted(() => ({ initialize: vi.fn(), parse: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mock }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });
it.each([false, true])("connects the measuring host and removes it even when rendering fails: %s", async fails => {
  let connected = false;
  const host = { style: {}, setAttribute: vi.fn(), remove: vi.fn(() => { connected = false; }) };
  vi.stubGlobal("document", { createElement: () => host, body: { appendChild: () => { connected = true; } } });
  mock.parse.mockResolvedValue(true);
  mock.render.mockImplementation(async () => { expect(connected).toBe(true); if (fails) throw new Error("drawing error"); return { svg: "<svg/>" }; });
  const rendering = renderMermaid("flowchart LR\nA --> B", "qa:diagram");
  if (fails) await expect(rendering).rejects.toThrow("drawing error"); else await expect(rendering).resolves.toBe("<svg/>");
  expect(host.remove).toHaveBeenCalledOnce(); expect(connected).toBe(false);
  expect(mock.render).toHaveBeenCalledWith("qadiagram", expect.any(String), host);
});
