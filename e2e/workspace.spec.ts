import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111";
const source =
  "I. API\nAPI là giao diện lập trình ứng dụng, cho phép các hệ thống trao đổi dữ liệu.\n\nII. SQL\nSQL là ngôn ngữ truy vấn dữ liệu, giúp đọc và quản lý thông tin trong cơ sở dữ liệu.\n$$T(n)=n^2$$\n```mermaid\nflowchart TD\nA[Request] --> B[Response]\n```";
const outline = [
  { title: "I. API", preview: "API...", start: 0, end: 80, children: [] },
  {
    title: "II. SQL",
    preview: "SQL...",
    start: 80,
    end: source.length,
    children: [],
  },
];
const report = {
  valid: true,
  totalCharacters: source.length,
  totalWords: 60,
  inputCount: 1,
  chunkCount: 1,
  blockingErrors: [],
  warnings: [],
  notes: [],
  inputs: [
    {
      id: "input",
      name: "Văn bản",
      characters: source.length,
      words: 60,
      chunkCount: 1,
      structure: outline,
    },
  ],
};
const questions = [
  {
    id: "q1",
    question_index: 0,
    question_type: "multiple_choice",
    prompt: "API trong tài liệu có ý nghĩa gì?",
    options: ["Giao diện lập trình ứng dụng", "Ổ cứng"],
    difficulty: "easy",
  },
];
const result = {
  title: "IT test",
  summary: "API và SQL giúp xây dựng hệ thống trao đổi và quản lý dữ liệu.",
  sections: [
    {
      title: "I. API",
      summary: "API kết nối các hệ thống.",
      blocks: [
        { type: "paragraph", content: "API là giao diện lập trình ứng dụng." },
      ],
    },
    {
      title: "II. SQL",
      summary: "SQL hỗ trợ truy vấn dữ liệu.",
      blocks: [
        {
          type: "diagram",
          contentType: "mermaid",
          content: "flowchart TD\nA[Request] --> B[Response]",
        },
        { type: "formula", contentType: "latex", content: "T(n)=n^2" },
      ],
    },
  ],
};
async function fixture(page: Page, pauseCompletes = false) {
  let status = "draft";
  let quizSettings = {
    questionCount: 20,
    difficulty: "mixed",
    types: ["multiple_choice"],
  };
  let runCount = 0;
  const events: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      method = request.method();
    events.push(method + " " + path);
    let data: unknown = {};
    if (path === "/api/topics")
      data = [
        {
          id: "it-topic",
          code: "IT",
          name: "Công nghệ thông tin",
          specializations: [
            {
              id: "spring-specialization",
              name: "Spring Boot và Spring Security",
              description: "Spring Boot, JWT và phân quyền.",
            },
          ],
        },
      ];
    else if (path === "/api/analyses" && method === "POST") {
      quizSettings = request.postDataJSON().quizSettings;
      data = {
        analysis: {
          id,
          title: "IT test",
          status,
          quiz_enabled: true,
          quiz_settings: quizSettings,
        },
        uploads: [],
      };
    } else if (path === "/api/analyses")
      data = {
        items: [
          { id, title: "IT test", status: "completed", quiz_enabled: true },
        ],
      };
    else if (path.endsWith("/validate")) {
      status = "needs_review";
      data = { report };
    } else if (path.endsWith("/review")) {
      status = "needs_review";
      data = { report };
    } else if (path.endsWith("/confirm")) {
      status = "ready";
      data = { status };
    } else if (path.endsWith("/run")) {
      if (pauseCompletes) {
        status = "completed";
        await new Promise((resolve) => setTimeout(resolve, 1500));
        data = { status };
      } else if (runCount++ === 0) {
        status = "processing";
        data = { status, completedChunks: 0, totalChunks: 1, waitMs: 300 };
      } else {
        status = "completed";
        data = { status };
      }
    } else if (path.endsWith("/result"))
      data = {
        analysis: {
          id,
          title: "IT test",
          status: "completed",
          quiz_enabled: true,
          quiz_settings: quizSettings,
        },
        result: { id: "result", result_json: result },
      };
    else if (path.endsWith("/quiz/attempts"))
      data =
        method === "GET"
          ? {
              attempts: [
                {
                  id: "attempt",
                  score: 1,
                  total_questions: 1,
                  submitted_at: "2026-10-02T10:00:00Z",
                },
              ],
            }
          : {
              attempt: { score: 100, total_questions: 1 },
              correctAnswers: 1,
              feedback: [
                {
                  questionId: "q1",
                  correct: true,
                  answer: { index: 0 },
                  correctIndex: 0,
                  selectedIndex: 0,
                  explanation: "Theo tài liệu.",
                },
              ],
            };
    else if (path.endsWith("/assets")) data = { stored: true, signedUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=", mimeType: "image/png" };
    else if (path.endsWith("/quiz")) data = { quiz: { id: "quiz" }, questions };
    else if (path.endsWith("/chat"))
      data =
        method === "GET"
          ? { messages: [] }
          : {
              assistantMessage: {
                role: "assistant",
                content: "SQL là ngôn ngữ truy vấn dữ liệu.",
                citations: ["II. SQL"],
              },
            };
    else if (path.endsWith("/activity"))
      data = {
        analysis: {
          id,
          title: "IT test",
          status,
          quiz_enabled: true,
          confirmed_at: ["ready", "processing", "completed"].includes(status)
            ? "2026-10-02"
            : null,
        },
        items: [],
        chunks: [{ status: status === "completed" ? "complete" : "pending" }],
      };
    else if (path.endsWith("/metrics"))
      data = {
        calls: 2,
        failedCalls: 0,
        inputTokens: 300,
        outputTokens: 200,
        latencyMs: 1000,
      };
    else if (path.endsWith("/exports"))
      data = { downloadUrl: "http://127.0.0.1:3000/fixture/report.zip" };
    else
      data = {
        analysis: {
          id,
          title: "IT test",
          status,
          quiz_enabled: true,
          quiz_settings: quizSettings,
          validation_report: report,
          confirmed_at: ["ready", "processing", "completed"].includes(status)
            ? "2026-10-02"
            : null,
        },
        inputs: [
          { id: "input", original_name: "Văn bản", normalized_text: source },
        ],
        chunks: [{ title: "IT", content: source }],
        outline,
      };
    await route
      .fulfill({
        status: method === "POST" && path === "/api/analyses" ? 201 : 200,
        json: { data },
      })
      .catch((error) => {
        if (!pauseCompletes) throw error;
      });
  });
  const archive = new JSZip();
  archive.file("report.md", "# IT test\n![Sơ đồ](images/diagram.png)");
  archive.file("images/diagram.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=", "base64"));
  const zipBytes = await archive.generateAsync({ type: "nodebuffer" });
  await page.route("**/fixture/report.zip", route => route.fulfill({ body: zipBytes, contentType: "application/zip" }));

  return events;
}
async function complete(page: Page) {
  await page
    .getByPlaceholder("Ví dụ: Lập trình hướng đối tượng với Java")
    .fill("IT test");
  await page.getByLabel("Nội dung văn bản").fill(source);
  await page.getByRole("button", { name: /Kiểm tra tài liệu/ }).click();
  await expect(
    page.getByRole("heading", { name: "Kiểm tra tài liệu trước khi xử lý" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Xác nhận và xử lý/ }).click();
  await expect(
    page.getByRole("tab", { name: "Tổng quan", exact: true }),
  ).toBeVisible();
}
test("input → review → confirm → result, typed visuals, quiz, chat and export", async ({
  page,
}) => {
  const events = await fixture(page);
  await page.goto("/");
  await page.getByLabel("Số câu mong muốn").fill("250");
  await complete(page);
  expect(events.findIndex((x) => x.endsWith("/confirm"))).toBeLessThan(
    events.findIndex((x) => x.endsWith("/run")),
  );
  await page
    .getByRole("tab", { name: "Phân tích chi tiết", exact: true })
    .click();
  await page.getByRole("button", { name: /Mở tất cả/ }).click();
  await page.locator(".diagram-view summary").first().click();
  await expect(page.getByRole("img", { name: "Sơ đồ từ tài liệu" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Công thức toán" }).first()).toBeVisible();
  await page.getByRole("tab", { name: /Quiz/ }).click();
  await page
    .getByRole("radio", { name: "Giao diện lập trình ứng dụng", exact: false })
    .check();
  await page.getByRole("button", { name: /Nộp bài/ }).click();
  await expect(page.getByText(/1\/1 câu đúng/).first()).toBeVisible();
  await page.getByRole("button", { name: "Lịch sử làm quiz" }).click();
  await expect(page.locator(".quiz-attempt-history")).toContainText("1 câu");
  await page.getByRole("tab", { name: "Hỏi đáp AI" }).click();
  await page
    .getByRole("textbox", { name: "Câu hỏi cho AI" })
    .fill("SQL là gì?");
  await page.getByRole("button", { name: "Gửi câu hỏi" }).click();
  await expect(page.locator(".chat-message.assistant")).toContainText(
    "SQL là ngôn ngữ",
  );
  await page.getByRole("tab", { name: "Xuất báo cáo" }).click();
  await expect(page.locator(".report-preview")).toContainText("II. SQL");
  const download = page.waitForEvent("download");
  await page
    .locator(".report-format-card")
    .filter({ hasText: "Markdown" })
    .getByRole("button")
    .click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toMatch(/\.zip$/);
  const downloadedPath = await downloaded.path();
  expect(downloadedPath).not.toBeNull();
  const archive = await JSZip.loadAsync(await readFile(downloadedPath!));
  expect(await archive.file("report.md")!.async("string")).toContain("](images/diagram.png)");
  expect(archive.file("images/diagram.png")).not.toBeNull();
  await expect(page.locator("body")).not.toContainText("[object Object]");
});
test("rejects unsupported or empty file selections visibly", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "unsupported.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("bad"),
  });
  await expect(page.locator(".alert-error")).toContainText("chưa được hỗ trợ");
  await page.locator("input[type=file]").setInputFiles({
    name: "empty.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(0),
  });
  await expect(page.locator(".alert-error")).toContainText("không có dữ liệu");
});
test("result tabs support keyboard navigation and mobile has no overflow", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await complete(page);
  const first = page.getByRole("tab", { name: "Tổng quan", exact: true });
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("tab", { name: "Tóm tắt", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Tóm tắt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
});

// A response can be lost after the server has already completed the analysis.
test("pause reconciles a completed server session instead of reopening review", async ({
  page,
}) => {
  await fixture(page, true);
  await page.goto("/");
  await page.getByLabel("Nội dung văn bản").fill(source);
  await page.getByRole("button", { name: /Kiểm tra tài liệu/ }).click();
  await expect(
    page.getByRole("heading", { name: "Kiểm tra tài liệu trước khi xử lý" }),
  ).toBeVisible();
  const run = page.waitForRequest((r) =>
    new URL(r.url()).pathname.endsWith("/run"),
  );
  await page.getByRole("button", { name: /Xác nhận và xử lý/ }).click();
  await run;
  await page
    .getByRole("button", { name: "Tạm dừng sau lượt hiện tại" })
    .click();
  await expect(
    page.getByRole("tab", { name: "Tổng quan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kiểm tra tài liệu trước khi xử lý" }),
  ).toHaveCount(0);
});

test("restores an oversized failed draft without raw report fields or an ingest retry", async ({
  page,
}) => {
  const events = await fixture(page);
  const analysis = {
    id,
    title: "PDF cần tách",
    status: "failed",
    error_code: "PDF_TOO_MANY_PAGES",
    error_message: "PDF vượt giới hạn số trang.",
    validation_report: {},
    confirmed_at: null,
  };
  await page.route(`**/api/analyses/${id}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/activity"))
      await route.fulfill({
        json: { data: { analysis, items: [], chunks: [] } },
      });
    else if (path.endsWith(id))
      await route.fulfill({
        json: {
          data: {
            analysis,
            inputs: [
              {
                id: "input",
                status: "error",
                metadata: { errorCode: "PDF_TOO_MANY_PAGES" },
              },
            ],
            result: null,
          },
        },
      });
    else await route.fallback();
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/?analysis=${id}`);
  await expect(
    page.getByRole("button", { name: "Chọn tài liệu khác / tạo phiên mới" }),
  ).toBeVisible();
  await expect(
    page.getByText("PDF vượt giới hạn số trang.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Chọn tài liệu khác / tạo phiên mới" }),
  ).toBeVisible();
  expect(events.some((e) => e.endsWith("/ingest"))).toBe(false);
  expect(errors).toEqual([]);
});
test("reloads partial page extraction and resumes to review without confirming analysis", async ({
  page,
}) => {
  const events = await fixture(page);
  let read = false;
  const analysis = {
    id,
    title: "PDF đang đọc",
    status: "draft",
    confirmed_at: null,
    validation_report: {},
  };
  await page.route(`**/api/analyses/${id}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/activity"))
      await route.fulfill({
        json: {
          data: {
            analysis,
            items: [
              {
                id: "task",
                actor: "ai",
                label: "Đọc PDF · trang 3",
                status: "running",
                model: "Gemini fixture",
                created_at: new Date().toISOString(),
              },
            ],
            chunks: [],
          },
        },
      });
    else if (path.endsWith("/ingest")) {
      read = true;
      await route.fulfill({
        json: {
          data: { analysisId: id, nextStep: "validate", remainingFiles: 0 },
        },
      });
    } else if (path.endsWith(id))
      await route.fulfill({
        json: {
          data: {
            analysis,
            inputs: [
              {
                id: "input",
                original_name: "PDF",
                status: read ? "extracted" : "staged",
                metadata: {
                  extractionProgress: { nextUnit: 3, totalUnits: 8 },
                },
                normalized_text: read ? source : "I. API",
              },
            ],
          },
        },
      });
    else await route.fallback();
  });
  await page.goto(`/?analysis=${id}`);
  await expect(
    page.getByRole("button", { name: "Tiếp tục đọc tài liệu" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tiếp tục đọc tài liệu" }),
  ).toBeVisible();
  await expect(page.getByText("Đọc PDF · trang 3")).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục đọc tài liệu" }).click();
  await expect(
    page.getByRole("heading", { name: "Kiểm tra tài liệu trước khi xử lý" }),
  ).toBeVisible();
  expect(events.some((e) => e.endsWith("/confirm"))).toBe(false);
});
test("searches predefined choices and falls back to automatic specialization", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.getByLabel("Số câu mong muốn")).toHaveValue("20");
  const topic = page.getByRole("combobox", {
    name: "Chủ đề tài liệu",
    exact: true,
  });
  await topic.fill("cong nghe");
  await topic.press("Enter");
  await expect(topic).toHaveValue("Công nghệ thông tin");
  const specialization = page.getByRole("combobox", {
    name: "Chuyên ngành IT",
    exact: true,
  });
  await specialization.fill("Spring");
  await page
    .getByRole("option", {
      name: "Spring Boot và Spring Security",
      exact: false,
    })
    .click();
  await expect(specialization).toHaveValue("Spring Boot và Spring Security");
  await specialization.fill("Unknown subject");
  await page
    .getByRole("button", { name: "Tự nhận diện chuyên ngành", exact: true })
    .click();
  await expect(specialization).toHaveValue("Tự nhận diện chuyên ngành");
});

test("restores extraction completed after F5 and validates before showing review", async ({
  page,
}) => {
  const events = await fixture(page);
  let validated = false;
  const analysis = {
    id,
    title: "Đã đọc xong nhưng chưa kiểm tra",
    status: "draft",
    confirmed_at: null,
    validation_report: {},
  };
  await page.route(`**/api/analyses/${id}**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/validate")) {
      validated = true;
      await route.fallback();
    } else if (path.endsWith("/ingest")) {
      events.push("POST " + path);
      await route.fulfill({
        json: { data: { nextStep: "validate", remainingFiles: 0 } },
      });
    } else if (!validated && path.endsWith(id)) {
      await route.fulfill({
        json: {
          data: {
            analysis,
            inputs: [
              {
                id: "input",
                status: "extracted",
                original_name: "test.pdf",
                normalized_text: source,
              },
            ],
            result: null,
          },
        },
      });
    } else if (!validated && path.endsWith("/activity")) {
      await route.fulfill({
        json: { data: { analysis, items: [], chunks: [] } },
      });
    } else await route.fallback();
  });
  await page.goto(`/?analysis=${id}`);
  await expect(
    page.getByText(
      "Đã đọc xong nội dung. Tiếp tục để kiểm tra và dựng cấu trúc tài liệu.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kiểm tra tài liệu trước khi xử lý" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Tiếp tục đọc tài liệu" }).click();
  await expect(
    page.getByRole("heading", { name: "Kiểm tra tài liệu trước khi xử lý" }),
  ).toBeVisible();
  expect(events.some((e) => e.endsWith("/validate"))).toBe(true);
  expect(events.some((e) => e.endsWith("/confirm"))).toBe(false);
});

test("review identifies the affected file and PDF page; logs remain visible after completion", async ({ page }) => {
  await fixture(page);
  await page.route("**/validate", route => route.fulfill({ json: { data: { report: { ...report, warnings: [{ message: "Trang 3: công thức chỉ có mô tả; đối chiếu bản gốc.", inputId: "input", location: "IT.pdf · Trang 3" }] } } } }));
  await page.goto("/");
  await page.getByLabel("Nội dung văn bản").fill(source);
  await page.getByRole("button", { name: /Kiểm tra tài liệu/ }).click();
  await expect(page.locator(".validation-warning")).toContainText("IT.pdf · Trang 3");
  await page.getByRole("button", { name: "Xem vị trí trong tài liệu ↓" }).click();
  await expect(page.locator("#input-input")).toHaveAttribute("open", "");
  await expect(page.getByRole("region", { name: "Nhật ký xử lý" })).toBeVisible();
  await expect(page.locator(".activity-panel summary")).toHaveCount(0);
  await page.getByRole("button", { name: /Xác nhận và xử lý/ }).click();
  await expect(page.getByRole("tab", { name: "Tổng quan", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Nhật ký xử lý" })).toBeVisible();
});
test("long Markdown, code and tables stay inside result cards and the mobile viewport", async ({ page }) => {
  await fixture(page);
  const long = "LONGTOKEN".repeat(140);
  await page.route("**/result", route => route.fulfill({ json: { data: {
    analysis: { id, title: "IT test", status: "completed", quiz_enabled: true },
    result: { id: "result", result_json: { ...result, sections: [{ title: "Nội dung dài", blocks: [
      { type: "paragraph", content: `**Tiêu đề**\n\n${long}\n\n- \`${long}\`` },
      { type: "code", contentType: "code", content: `const longText = "${long}";` },
      { type: "table", contentType: "table", content: { headers: ["Key", "Value"], rows: [[long, long]] } },
    ] }] } },
  } } }));
  await page.goto("/"); await complete(page);
  await page.getByRole("tab", { name: "Phân tích chi tiết", exact: true }).click();
  await page.getByRole("button", { name: /Mở tất cả/ }).click();
  await expect(page.locator(".rich-text").first()).toContainText(long);
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  const overflow = await page.evaluate(() => Array.from(document.querySelectorAll(".detail-sections, .detail-section, .detail-body, .content-block, .code-view, .table-scroll, .rich-text")).map(element => ({ className: element.className, width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right, scroll: element.scrollWidth })).filter(element => element.right > innerWidth + 1));
  expect(size.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(size.width + 1);
  for (const card of await page.locator(".content-block").all()) {
    const bounds = await card.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width + 1);
  }
});
test("reopening history shows the original file and asks for a fresh private URL", async ({ page }) => {
  await fixture(page);
  await page.route(`**/api/analyses/${id}/inputs/input/source`, route => route.fulfill({ json: { data: { url: "http://127.0.0.1:3000/fixture/original.txt", expiresInSeconds: 600 } } }));
  await page.route("**/fixture/original.txt", route => route.fulfill({ body: source, contentType: "text/plain" }));
  await page.goto("/"); await complete(page);
  await page.getByRole("button", { name: /^▦?\s*Lịch sử/ }).click();
  await page.locator(".history-row").first().click();
  await expect(page.getByRole("region", { name: "Tài liệu đầu vào" })).toContainText("Văn bản");
  const request = page.waitForRequest(request => new URL(request.url()).pathname.endsWith("/inputs/input/source"));
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Mở bản gốc ↗" }).click();
  await request;
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/fixture\/original.txt/);
  await popup.close();
});
