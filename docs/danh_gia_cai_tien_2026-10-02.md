# Đánh giá chi tiết và kế hoạch cải tiến DocuMind — 02/10/2026

## 1. Đánh giá tổng quan

| Hạng mục | Mức | Nhận xét |
| --- | --- | --- |
| Luồng nghiệp vụ | Tốt | Đủ các bước nhập → kiểm tra → xác nhận → xử lý theo chunk → kết quả. Có checkpoint nên chạy tiếp được, tránh vượt thời gian chạy của Vercel. |
| Trích xuất đầu vào | Tốt | PDF/DOCX được đọc theo thứ tự, giữ Mermaid/LaTeX/bảng, kiểm tra chữ ký tệp, chặn XXE trong DOCX. |
| Dữ liệu và bảo mật | Khá | Có RLS, bucket private, signed URL; đáp án quiz chỉ chấm trên server. Còn các điểm cần siết lại, xem mục 4.3. |
| Kiểm thử | Khá | 72 unit test cho lib. Chưa có test cho component luồng chính và chưa có e2e. |
| Kiến trúc frontend | Yếu | `page.tsx` một khối lớn khoảng 690 dòng, khoảng 40 `useState`. CSS 54 KB viết dồn trên dòng dài, có rule trùng lặp. |
| UI/UX | Khá | Bố cục rõ ràng, có responsive. Nhưng chữ nhiều chỗ 7–10px, một số trạng thái hiển thị "giả" (thanh tiến độ, nhãn "Đã lưu"). |

## 2. Thay đổi trong đợt này

Các trường dữ liệu được giữ nguyên: payload `POST /api/analyses`, `PATCH /review`, cấu trúc `result_json` (sections/blocks/contentType), quiz và chat. Chuỗi `custom_prompt` vẫn theo định dạng cũ.

### 2.1. Quiz và OCR tĩnh (chờ thay bằng LLM thật)

- `src/lib/mock-llm.ts`: tách mock khỏi `llm.ts`, phân nhánh theo từng `purpose`, trả đúng JSON contract của Gemini.
  - `document_ocr`: trả 3 bộ mẫu tĩnh (text + Mermaid/LaTeX/bảng/code), chọn theo tên tệp. Office Math chỉ trả LaTeX; drawing chỉ trả Mermaid/bảng. Nội dung có nhãn "mô phỏng" và kèm `ocrWarnings` ở bước Review.
  - PDF scan (không có lớp chữ) ở chế độ mock dùng OCR tĩnh thay vì báo lỗi 503.
  - `quiz_generation`: sinh câu hỏi từ nguồn bằng `static-quiz.ts`.
  - `chat`: chấm điểm từ khóa trên các câu trong `result_json`, trả 1–3 câu kèm tên mục làm nguồn trích dẫn.
  - `section_generation`: tách code/bảng/công thức thành block có kiểu riêng, tóm tắt bằng 2 câu đầu, thêm mục "Thuật ngữ cần nhớ".
- `src/lib/static-quiz.ts`: bộ sinh tất định gồm 3 loại câu (định nghĩa, điền chỗ trống, đúng/sai). Khoảng một nửa câu đúng/sai được tráo thuật ngữ nên đáp án không phải lúc nào cũng "Đúng". Phương án nhiễu lấy cùng loại thuật ngữ trong tài liệu.
- **Lỗi đã sửa:** fallback quiz cũ luôn có đáp án A ("Có, phát biểu phù hợp"). Giờ fallback dùng chung bộ sinh trên. Mọi quiz, kể cả do Gemini tạo, được xáo vị trí đáp án khi lưu (`shuffleCandidateOptions`).

**Khi gắn LLM thật:** thay từng nhánh trong `mockResponse()` hoặc chuyển `LLM_PROVIDER=gemini`. Hai luồng cùng contract nên UI và pipeline không cần sửa.

### 2.2. Luồng đọc đầu vào

- `normalizeText`:
  - **Lỗi đã sửa:** trước đây hàm gộp mọi khoảng trắng nên làm mất thụt lề của Python/YAML/code. Giờ thụt lề đầu dòng được giữ, tab đổi thành 4 dấu cách.
  - Chuẩn hoá Unicode NFC, vì PDF tiếng Việt thường ra dạng NFD làm hỏng tìm kiếm và font.
  - Bỏ BOM, zero-width, soft hyphen; đổi NBSP thành dấu cách.
- PDF: nối từ bị ngắt bằng gạch nối cuối dòng ("infor-\nmation" → "information").
- Bản xem trước ở bước Review: các dòng gạch đầu dòng hoặc đánh số liên tiếp được hiển thị thành danh sách.

### 2.3. Luồng đọc đầu ra

- **Lỗi đã sửa:** `key_points`/`list` dạng object `{title, detail}` bị xuất ra `[object Object]` trong Markdown/HTML/Word. Đã thêm `listItemText()` và dùng ở mọi đường xuất cũng như trong giao diện.
- Khối văn bản hiển thị theo đoạn, gạch đầu dòng, `**đậm**`, `` `code` ``. Phần render dùng React node, không dùng `innerHTML`.

### 2.4. Logic frontend

- **Lỗi đã sửa:** mở phiên nháp từ Lịch sử rồi "Lưu chỉnh sửa" thì quiz/mức phân tích/yêu cầu AI bị ghi đè bằng giá trị mặc định. Giờ form được nạp lại từ phiên.
- **Lỗi đã sửa:** phiên đã xác nhận (`ready`) nhưng chưa chạy, ví dụ do đóng trình duyệt giữa chừng, bị kẹt vì UI gọi lại `/review` và nhận 409. Giờ UI chạy tiếp thẳng ở `/run` và có nút "Bắt đầu xử lý".
- **Lỗi đã sửa (server):** route chat gọi `history.reverse()` hai lần trên cùng mảng nên `{{history}}` bị đảo thứ tự.
- Kéo thả tệp giờ có kiểm tra đuôi tệp (trước đây kéo thả bỏ qua thuộc tính `accept`) và bỏ tệp trùng.
- Toast tự tắt sau 6 giây. Gửi chat không còn khóa toàn bộ UI (trạng thái chờ tách riêng khỏi `busy`).

### 2.5. Giao diện (sửa cơ bản, giữ bố cục hiện tại)

- Quiz: thanh tiến độ, điều hướng nhanh theo câu, đánh dấu câu chưa trả lời khi nộp, thẻ điểm dạng vòng, lọc câu sai, "Làm lại câu sai".
- Chat: tự cuộn, hiệu ứng "AI đang trả lời", Enter để gửi (Shift+Enter xuống dòng), nguồn trích dẫn dạng chip, nút sao chép.
- Chi tiết: tìm kiếm không phân biệt dấu, mục lục nhảy nhanh, mở/thu gọn tất cả.
- Xử lý: thanh tiến độ thật theo `completedChunks/totalChunks` cùng danh sách các bước.
- Lịch sử: tìm theo tên, lọc theo trạng thái.
- Cỡ chữ tối thiểu 13–14px cho vùng đọc, hỗ trợ `prefers-reduced-motion`. CSS mới nằm riêng trong `src/app/workspace.css`.
- Component mới: `quiz-panel.tsx`, `chat-panel.tsx`, `detail-view.tsx`.

## 3. Kiểm chứng

- `vitest`: 72/72 đạt (thêm 13 test cho quiz tĩnh, mock, chuẩn hoá văn bản và xuất danh sách).
- `tsc --noEmit` sạch. `eslint` còn 2 cảnh báo `<img>` có từ trước. `next build` thành công.
- Giao diện được chụp bằng Chrome headless ở 1360px và 390px qua toàn luồng, với API giả lập bằng fixture.
- **Chưa kiểm chứng:** luồng thật với Supabase (máy kiểm thử không có cấu hình DB), Gemini thật, và việc so khớp với Figma (chưa nhận được link).

## 4. Những điểm cần cải thiện tiếp

### 4.1. Ưu tiên cao

1. **Tách `page.tsx`** thành các màn `InputScreen`, `ReviewScreen`, `ProcessingScreen`, `ResultWorkspace`, `HistoryScreen`. Gom state vào `useReducer` hoặc state machine (`screen` + `analysis` + `progress`); hiện các chuyển trạng thái đang rải trong khoảng 15 hàm async.
2. **Chuẩn hoá CSS theo Figma:** định dạng lại `globals.css` (54 KB, dòng dài, `.content-block` khai báo hai lần), tách design token (màu, spacing, type scale), bỏ các cỡ chữ 7–10px. Nên dùng CSS Modules hoặc Tailwind để tránh xung đột.
3. **Ngữ cảnh chat:** hiện ngữ cảnh là `JSON.stringify(result).slice(0, 8000)`, vừa cắt giữa chuỗi JSON vừa chỉ thấy các mục đầu. Cần truy xuất mục liên quan theo câu hỏi (từ khóa/BM25 hoặc embedding pgvector) trước khi gửi LLM.
4. **Giới hạn tần suất (rate limit)** cho `/chat`, `/run`, `/quiz`, `/ingest`, nhất là với khách: tránh lạm dụng chi phí LLM.
5. **Khoá Gemini nằm trên URL** (`?key=`): chuyển sang header `x-goog-api-key` để không lộ trong log hoặc proxy.

### 4.2. Ưu tiên trung bình

6. Vòng lặp `/run` phía client không có giới hạn số lần, không backoff, không huỷ được. Nên thêm số lần tối đa, backoff tăng dần và nút "Tạm dừng".
7. Quiz cố định 3 câu mỗi chunk, tối đa 20. Nên cho chọn số câu, độ khó và loại câu; thêm lịch sử các lần làm bài (bảng `quiz_attempts` đã có) và ôn lại câu sai.
8. `llm_exchanges` lưu toàn bộ prompt có nội dung tài liệu. Cần chính sách thời hạn lưu hoặc ẩn bớt nội dung, và cleanup theo TTL như dữ liệu khách.
9. Nhãn "Đã lưu thay đổi" ở thanh trên luôn hiện, không phản ánh trạng thái thật. Nên bỏ hoặc gắn với trạng thái lưu bước Review.
10. Giới hạn 20 MB / 10 tệp và danh sách đuôi tệp đang lặp ở client và server. Nên đưa vào một module dùng chung hoặc lấy từ `/api/health`.
11. Xem trước báo cáo chỉ hiện 8 mục và 3 block mỗi mục. Nên có chế độ in hoặc xem trước trang đầy đủ.

### 4.3. Bảo mật và vận hành

12. Thêm header CSP. Mermaid đang render SVG qua `dangerouslySetInnerHTML` (đã dùng `securityLevel: strict`), CSP là lớp bảo vệ thứ hai.
13. Theo dõi chi phí và độ trễ LLM theo phiên (dữ liệu đã có trong `llm_exchanges`); có thể làm dashboard nội bộ.
14. Bổ sung e2e Playwright với API giả lập (harness đã dùng trong đợt này có thể đưa vào repo) để chạy trong CI.

### 4.4. UX và khả năng tiếp cận

15. Thanh tab kết quả nên dùng `role="tablist"`/`tab` và điều hướng bằng phím mũi tên. Icon đang là ký tự unicode (✦ ▤ ↗), nên thay bằng bộ icon SVG theo Figma.
16. Màu chữ phụ `#9a9cb0` trên nền trắng chưa đạt tương phản AA (khoảng 2.7:1, cần ≥ 4.5:1).
17. Chưa có dark mode, chưa có i18n (chuỗi tiếng Việt viết thẳng trong JSX).
18. Bước Review: thêm so sánh song song ảnh gốc và văn bản trích xuất, đánh dấu vùng OCR có độ tin cậy thấp.

## 5. Gợi ý thứ tự triển khai

1. Gắn OCR và quiz thật vào các nhánh tương ứng trong `mock-llm.ts` hoặc bật Gemini. Chạy lại `vitest`, vì các test contract đã có sẵn.
2. Áp Figma: chốt token, sau đó tách `page.tsx` theo màn hình (mục 4.1.1–2).
3. Truy xuất ngữ cảnh cho chat và rate limit (4.1.3–4).
4. Thêm e2e vào CI.
