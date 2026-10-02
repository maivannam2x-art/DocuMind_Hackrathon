/** Mermaid needs a connected SVG to measure text with getBBox. Always clean
 * up the off-screen host, including error diagrams produced during rendering. */
export async function renderMermaid(source: string, id: string): Promise<string> {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral", htmlLabels: false, flowchart: { htmlLabels: false }, suppressErrorRendering: true });
  if (!await mermaid.parse(source, { suppressErrors: true })) throw new Error("Invalid Mermaid source");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-100000px", top: "0", opacity: "0", pointerEvents: "none", width: "1200px" });
  document.body.appendChild(host);
  try { return (await mermaid.render(id.replace(/[^a-zA-Z0-9_-]/g, ""), source, host)).svg; }
  finally { host.remove(); }
}
