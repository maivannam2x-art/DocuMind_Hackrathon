import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultBlockView } from "./result-block";

describe("result block visual fallback", () => {
  it("renders valid LaTeX and labels invalid formulas without leaking error markup", () => {
    const valid = renderToStaticMarkup(
      <ResultBlockView
        block={{
          type: "formula",
          contentType: "latex",
          content: "T=\\frac{1}{n}\\sum_{i=1}^{n}x_i",
        }}
      />,
    );
    const invalid = renderToStaticMarkup(
      <ResultBlockView
        block={{
          type: "formula",
          contentType: "latex",
          content: "\\unknownCommand{x}",
        }}
      />,
    );
    expect(valid).toContain("katex-html");
    expect(invalid).toContain("Không thể dựng công thức này");
    expect(invalid).toContain("\\unknownCommand{x}");
    expect(invalid).not.toContain("katex-error");
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
    expect(html).toContain("Sơ đồ · mở để kiểm tra và dựng ảnh");
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
