# DocuMind — kiểm tra luồng và đánh giá production (29/09/2026)

## Phạm vi và bằng chứng

- Đối chiếu bố cục tổng thể với ảnh chụp nhiều màn Product(V2) người dùng đã cung cấp trong `upload/download.png`: điều hướng trái, luồng hàng trên từ trái sang phải, các màn kết quả và quiz bên dưới. Dùng ảnh này làm chuẩn cho cấu trúc và phong cách. Mỗi màn trong ảnh ghép chỉ chiếm khoảng vài trăm pixel, nên các phép đo chính xác cỡ chữ/khoảng cách và trạng thái hover chưa có bằng chứng. Figma MCP trả giới hạn lượt gọi gói Starter; tab Figma trong cloud browser hiện `Site Unavailable`.
- Kiểm tra bản live `https://docu-mind-hackrathon.vercel.app/` bằng trình duyệt: khách dán tài liệu TCP 306 ký tự gồm Mermaid, LaTeX và JSON → Review (1 đầu vào, 34 từ, 1 phần) → xác nhận → AI hoàn thành 3 mục, nhận diện IT, tạo 3 quiz → hiển thị sơ đồ, công thức và JSON → làm quiz 3/3, 100% → chatbot trả lời có dẫn mục nguồn → trang xuất báo cáo cho thấy 5 định dạng và bản xem trước. Đây là một lần chạy thật, không chứng minh mọi trường hợp dài/tệp/đăng nhập đều hoạt động trên production.
- Sau deploy, một phiên live thứ hai với ghi chú đọc sách ngoài IT đã đi từ Input → Review → Result, dùng `general_fallback`, tạo 3 mục và quiz. Màn đăng ký hiện đầy đủ tên, email, mật khẩu và xác nhận mật khẩu; chưa tạo tài khoản thật.
- Nút tạo PDF đã được nhấn trên live, nhưng trình duyệt cloud chặn bước chuyển tới URL tải bằng chính sách giao thức. Không thể xác nhận byte PDF tải từ live; không thực hiện cách khác để vượt chính sách này.
- Kiểm tra mã nguồn, unit/integration cho PDF, DOCX, Markdown, ảnh PNG với Gemini giả lập, văn bản dài, chunking, schema, quiz, xuất PDF/DOCX/HTML/Markdown. Không có credentials Supabase và Gemini trong workspace nên chưa chạy bộ E2E có tải tệp, OCR và xuất tệp trên chính bản sửa mới.

## Từng trang và chức năng

| Màn/chức năng | Kết quả quan sát | Vấn đề / hành động |
|---|---|---|
| Đầu vào | Live cho nhập text, 10 tệp tối đa 20 MB/tệp, chọn chủ đề IT/tự nhận diện/chung, độ sâu, quiz, prompt | Bộ lọc tệp, lỗi kích cỡ có thông báo; chưa thử tải đồng thời 10 tệp trên live. Tệp ảnh cần Gemini thật để OCR. |
| Kiểm tra | Live hiện nội dung trích xuất có thể sửa, số từ/chunk, nút lưu và xác nhận | Đã xác nhận bước này trước khi AI chạy. Nội dung trích xuất từ ảnh phải được người dùng duyệt vì OCR có thể sai. |
| Xử lý | Live chạy từ xác nhận đến hoàn thành, AI nhận diện IT | Backend xử lý từng chunk ngay trong một HTTP request (`maxDuration=300`). Tài liệu rất dài hoặc nhiều file có thể vượt thời hạn Vercel; cần worker/job bền vững và polling trạng thái trước khi hứa SLA production. |
| Tổng quan | Live có tóm tắt, số mục, số từ, shortcut sang chi tiết/quiz/chat/xuất | Đã bỏ nhãn nội bộ `general_fallback` trên giao diện, đổi thành “Chủ đề chung”; chưa có kiểm chứng độ phủ ở 500.000 ký tự. |
| Tóm tắt | Có tab riêng, render sections/blocks | Cần E2E với nhiều section, bảng, code và nội dung dài. |
| Chi tiết | Live dựng Mermaid thành SVG, KaTeX hiển thị RTT và JSON có badge rõ | Lỗi lưu SVG cho tài khoản đăng nhập vì fetch thiếu bearer token; đã sửa. PlantUML hiện chỉ hiển thị mã, không dựng thành ảnh. |
| Kết luận | Tab có các ý theo mục và điều hướng quay lại/quiz | Chưa xác minh dữ liệu kết luận tổng hợp ở tài liệu dài. |
| Quiz | Live tạo 3 câu, kiểm tra đáp án, phản hồi nguồn, 100%; có nút làm lại | Có fallback dựa trên nguồn nếu model quiz lỗi; cần kiểm tra chất lượng câu hỏi nhiều chunk và các case trả đáp án sai cấu trúc. |
| Chatbot | Live trả lời câu hỏi về ACK kèm tên mục nguồn | Chưa thử hội thoại dài, prompt injection trong tài liệu và giới hạn ngữ cảnh trên live. |
| Xuất báo cáo | UI có PDF, DOCX, Markdown, HTML, JSON và xem trước dạng block, bao gồm JSON | Thư viện tạo PDF/DOCX hợp lệ trong test. Đợt sửa này render/lưu Mermaid trước khi xuất PDF/Word/HTML kể cả khi chưa mở Chi tiết; HTML dựng công thức bằng MathML. Công thức PDF/Word còn là mã LaTeX, chưa có ảnh/đối tượng phương trình. Download live chưa xác minh do browser policy. |
| Lịch sử | Mã nguồn có danh sách, trạng thái và mở phiên tiếp | Chưa thử nhiều tài khoản/khách, refresh và hết hạn guest trên live. |
| Đăng ký/đăng nhập/hồ sơ | Màn đăng ký live có đầy đủ 4 trường. Mã nguồn có sign-up, sign-in, callback, profile, logout và gửi bearer cho API | Chưa đăng ký tài khoản thật nên chưa xác minh email confirmation, phục hồi phiên và lưu sơ đồ của tài khoản trên live. Cấu hình redirect của Supabase phải được kiểm tra trong dashboard. |

## Luồng dữ liệu và loại block

1. API nhận text hoặc metadata tệp → signed upload vào Storage → ingest/trích xuất PDF/DOCX/văn bản/ảnh → normalize → validation và chunk có overlap → người dùng sửa → confirm.
2. Detection IT dùng prompt chuyên môn theo specialization, không rõ/ngoài IT dùng prompt chung. Gemini tạo sections/blocks, schema kiểm tra và repair, kết quả/quiz/chat/exchanges lưu trong Supabase.
3. `contentType` phân biệt `json`, `table`, `latex`, `mermaid`, `plantuml`, `image`, `code`, `text`; FE render theo kiểu. Mermaid dựng SVG bằng Mermaid strict rồi POST lưu Storage; công thức render KaTeX trong UI; ảnh nguồn được OCR qua Gemini Vision (PDF quét và hình DOCX tối đa 3 hình cũng được xử lý). JSON thực sự có badge JSON, object khác có trình bày trường dữ liệu để tránh in nguyên một object nhầm kiểu.
4. Trước khi tạo PDF/Word/HTML, client dựng và lưu Mermaid để ảnh sơ đồ có sẵn dù chưa mở Chi tiết. Công thức HTML dùng MathML; PDF/Word vẫn là mã LaTeX, chưa có ảnh hoặc đối tượng phương trình. Nếu client không thể dựng sơ đồ, hệ thống báo lỗi rõ ràng thay vì âm thầm tải bản báo cáo thiếu ảnh. Cần render server-side để không phụ thuộc trình duyệt.

## Lỗi tìm được và thay đổi đợt này

| Ưu tiên | Phát hiện | Sửa và kiểm chứng |
|---|---|---|
| P0 | `pdf-parse` 1.x trả `bad XRef entry` với Buffer, kể cả PDF hợp lệ do ReportLab/PDFKit tạo | Chuyển dữ liệu parser sang plain `Uint8Array`; test PDF thực và DOCX thực đã qua. |
| P1 | SVG sau render POST không có bearer nên người đăng nhập không lưu được ảnh | Thêm token, giữ cookie guest cho phiên khách; typecheck/lint qua. Chưa E2E tài khoản live. |
| P1 | Mock section chỉ giữ 4 dòng đầu/chunk, mất dữ liệu sau đó và không tạo block công thức/sơ đồ | Giữ nội dung nguồn của chunk, đưa fenced Mermaid/PlantUML/LaTeX và `$$...$$` thành typed blocks; thêm test văn bản IT dài. Mock được gắn nhãn bản mô phỏng, không trình bày như phân tích Gemini. |
| P1 | Xuất báo cáo trước khi mở Chi tiết thiếu ảnh Mermaid dù preview sẽ render | Render và lưu ảnh trước bước export; HTML chuyển công thức LaTeX sang MathML. Chưa E2E tải tệp trên live sau deploy. |
| P2 | Trang kết quả vẫn tô “Phân tích mới”; tiêu đề cứ ghi “Tổng quan tài liệu” khi mở Quiz/Chat/Xuất; badge lộ `general_fallback` và tên block tiếng Anh | Sửa điều hướng, tiêu đề theo tab và nhãn hiển thị tiếng Việt theo ảnh Product(V2). |
| P1 | Đồng bộ source workspace ban đầu cũ hơn GitHub main | Lấy lại các tệp auth/UI mới nhất từ main trước khi thay đổi. |

## Kiểm thử và khoảng trống còn lại

- Unit/integration: **32/32 test qua**; PDF/DOCX thực được trích xuất; PNG giả lập Gemini mang công thức/sơ đồ; mock long chunk, schema, JSON, quiz, PDF/DOCX/HTML/Markdown export có bài kiểm tra. TypeScript và ESLint không lỗi (còn 2 cảnh báo `<img>`); local `next build` qua. GitHub Vercel status của commit `2024de0c86fd8070d99cd53c90ea87b19676450e` là `success`, trang chính live mở được sau deploy.
- Mẫu live đã xác nhận Input → Review → Gemini → Overview → Detail (SVG, KaTeX, JSON) → Quiz → Chat → Export preview. Chưa xác nhận file tải được, chưa upload ảnh/PDF/DOCX trên live, chưa đo tải 500.000 ký tự, chưa kiểm tra nhiều người dùng hay mobile visual.
- Chưa đạt điều kiện gọi là **production hoàn thiện** cho mọi tài liệu: xử lý dài cần job bền vững, công thức PDF/Word phải tương ứng preview, và Figma Product(V2) cần truy cập trực tiếp để đối chiếu từng kích thước/interaction. Các mục này vẫn mở; không nên công bố rằng toàn bộ case đã qua.
