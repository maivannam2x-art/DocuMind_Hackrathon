import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultBlockView } from "./result-block";

describe("result block visual fallback", () => {
  it("uses stored PNG URLs for formulas and preserves editable source", () => {
    const html = renderToStaticMarkup(<ResultBlockView block={{ type: "formula", contentType: "latex", content: "T=\\frac{1}{n}", metadata: { assetUrl: "https://example.com/formula.png" } }} />);
    expect(html).toContain('src="https://example.com/formula.png"');
    expect(html).toContain('alt="Công thức toán"');
    expect(html).toContain("Xem mã LaTeX");
    expect(html).not.toContain("katex-html");
  });

  it("does not render Mermaid until the diagram is opened", () => {
    const html = renderToStaticMarkup(
      <ResultBlockView
        block={{
          type: "diagram",
          contentType: "mermaid",
          content: "flowchart LR\nA-->B",
        }}
      />,
    );
    expect(html).toContain("Sơ đồ · mở để xem ảnh");
    expect(html).not.toContain("<svg");
  });
});

it("renders semantic lists as readable lists even when old LLM data tags their transport as JSON", () => {
  const html = renderToStaticMarkup(
    <ResultBlockView
      block={{
        type: "key_points",
        contentType: "json",
        content: [{ title: "API", detail: "Giao diện lập trình ứng dụng" }],
      }}
    />,
  );
  expect(html).toContain("<ul");
  expect(html).toContain("Giao diện lập trình ứng dụng");
  expect(html).not.toContain("json-view");
  expect(html).not.toContain("[object Object]");
});
it("keeps explicit technical JSON as code data", () => {
  const html = renderToStaticMarkup(
    <ResultBlockView
      block={{ type: "json", contentType: "json", content: { status: 200 } }}
    />,
  );
  expect(html).toContain("json-view");
  expect(html).toContain("JSON");
});
