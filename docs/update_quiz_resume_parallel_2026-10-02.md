# DocuMind — quiz tùy chọn, phục hồi phiên và xử lý song song

## Yêu cầu và kết quả sửa

- Quiz mặc định 20 câu; người dùng nhập số nguyên dương mong muốn. Bỏ trần 100 ở form và schema. Backend vẫn chia đợt tối đa 20 ứng viên/lượt gọi để tránh phản hồi quá dài; đây là kích thước batch, không phải giới hạn tổng câu hỏi. Tổng quota phân bổ theo độ dài nguồn. Câu trùng/không hợp lệ bị loại; nếu không đủ kiến thức thì lưu requestedQuestionCount, questionCount và shortfall. Không bảo đảm có đủ bất kỳ số lượng yêu cầu nào. Số nhập phải biểu diễn chính xác dưới dạng số nguyên JavaScript.
- URL giữ ID phiên theo `?analysis=...`. Sau F5, chờ auth khởi tạo rồi lấy trạng thái thật từ backend: completed → kết quả; đã xác nhận → phân tích; chưa xác nhận và có tệp staged/error có thể retry → đọc đầu vào; lỗi giới hạn → màn hình hướng dẫn thay/tách tệp. Không tự chạy lại mọi trang khi mở lịch sử.
- Trang xử lý hiển thị checkpoint và nút tiếp tục tương ứng đọc đầu vào/phân tích. F5 không tạo phiên mới, không gửi confirm cho phiên OCR đang dở. Lượt đã gửi vẫn có thể hoàn tất trên server; các lượt tiếp theo cần browser mở và người dùng tiếp tục. Đây chưa phải worker nền tự chạy toàn bộ tài liệu sau khi đóng browser.
- Bản ghi người dùng báo `3c2ac998-8cc1-4bbc-81b4-36e7ba15cc83`: 6.653.013 byte, lỗi `PDF_TOO_MANY_PAGES`, draft, validation_report thiếu inputs. Đã sửa truy cập tùy chọn vào report, phân biệt lỗi đầu vào với lỗi phân tích và migration chuyển draft lỗi giới hạn sang failed; không xóa nội dung người dùng.
- Lease đọc tệp 5 phút chống hai tab cùng gửi OCR của một checkpoint. Lease chunk và quiz/tổng hợp bảo vệ các lượt độc lập. Thành công lưu checkpoint; retry chỉ xử lý phần chưa hoàn tất.
- Ô chủ đề, chuyên ngành, độ khó và loại quiz là combobox tìm kiếm không dấu, có điều hướng bàn phím. Khi không tìm thấy chuyên ngành, nút Tự nhận diện chuyên ngành xóa lựa chọn chuyên ngành cụ thể. Ngôn ngữ hiện chỉ tiếng Việt nên vẫn là ô thông tin vô hiệu hóa.
- Thêm 24 chuyên ngành và prompt IT, tổng 73 chuyên ngành active. Sửa loadPrompt để truy vấn đúng specialized → topic → global; không lấy ngẫu nhiên 20 template rồi bỏ sót prompt phù hợp khi danh mục lớn.

## Mức phân tích và suy nghĩ Gemini

Trước bản sửa, Nhanh/Tiêu chuẩn/Chuyên sâu chủ yếu là nhãn trong custom_prompt. Bản này dùng cùng pipeline đọc → review → confirm → chunk → tổng hợp, nhưng khác hướng dẫn và cấu hình suy nghĩ:

| Mức | Hướng dẫn | Gemini 3 Flash | Gemini 2.5 |
| --- | --- | --- | --- |
| Nhanh | Ý chính ngắn gọn, giữ dữ liệu nguồn cần thiết | low | budget 0; Pro dùng tối thiểu 128 |
| Tiêu chuẩn | Định nghĩa, cơ chế, ví dụ từ nguồn | medium; Pro dùng low | budget 2048 |
| Chuyên sâu | Cơ chế từng bước, điều kiện, giới hạn, lỗi thường gặp, kiểm tra chứng cứ | high | budget 8192 |

Model không hỗ trợ suy nghĩ (ví dụ 2.0) chỉ dùng prompt. Không cắt nhỏ maxOutputTokens để giả lập mức nhanh vì có thể cắt mất JSON. Chuyên sâu không được suy diễn số liệu hoặc tạo ví dụ giả như dữ liệu nguồn; bổ sung phải đánh dấu metadata.isSupplementary. Mức high có thể chậm hơn và tốn token hơn; không đồng nghĩa mọi câu trả lời đều tốt hơn. Chất lượng cần kiểm chứng bằng các câu hỏi/bảng/công thức có đáp án nguồn.

Tham khảo chính thức: https://ai.google.dev/gemini-api/docs/generate-content/thinking.

## Song song, fallback và thông tin cho người dùng

- Mặc định tối đa 3 tác vụ độc lập đồng thời trong mỗi request, cấu hình `LLM_CONCURRENCY` 1–4. Dùng async I/O cho các API, không tạo thread CPU để tăng tốc giả. Trang PDF/ảnh/Math Word xử lý theo batch và ghép đúng thứ tự nguồn; các chunk và quota quiz độc lập xử lý song song. Phần tổng hợp chờ checkpoint hoàn tất.
- `GEMINI_MODEL` là ưu tiên đầu; `GEMINI_FALLBACK_MODELS` là allowlist có thứ tự. Mặc định có các model Flash/Flash-Lite/Pro được yêu cầu. Trước khi gọi, lấy models.list, lọc hỗ trợ generateContent và loại model image/audio/tts/live/embedding. Model ngừng hoạt động hoặc tên không có trong API được bỏ qua; catalog không trả được thì thử allowlist cấu hình, 404 chuyển tiếp.
- Khi 429, lỗi mạng/timeout hoặc 5xx, chuyển model trong tổng deadline của request. 401/403 và lỗi yêu cầu không được thử cả danh sách vô ích. Khi hết lựa chọn, trả 429 có Retry-After hoặc 503 có thông báo an toàn; checkpoint giữ nguyên để tiếp tục. Đổi model không bảo đảm vượt quota cấp project. Không tuyên bố tất cả tên model đều còn hoạt động hoặc được key hiện tại cấp quota.
- `analysis_activity` ghi nhãn thao tác, actor AI/system, model thực tế, trạng thái và thời điểm. Mọi generateLlm của OCR/topic/section/repair/quiz/overview/chat tạo activity trước gọi và cập nhật sau gọi. UI poll owner-protected `/activity` khi đang xem phiên, cả trước khi bấm confirm. Không hiển thị nội dung suy nghĩ riêng của model, không ghi key/prompt/tài liệu vào activity.
- AI: đọc trang/ảnh/bảng khó, chuyển Math/SmartArt, phân tích phần, sửa response, tạo quiz, tổng hợp, chat. Hệ thống: download/kiểm tra byte, parse CSV/văn bản/Word, ghép thứ tự, lưu checkpoint, render và xuất file. Nhãn có thể còn running sau function chết; UI ghi nhận gián đoạn sau 5 phút, lease cho phép tiếp tục.

Tham khảo: https://ai.google.dev/api/models.

## Bảng — hiện xử lý và hướng mở rộng

| Nguồn | Cách hiện tại | Hạn chế/hướng tiếp |
| --- | --- | --- |
| CSV | Parse nội bộ: dấu phân cách, quoted cells, escaped quote/newline; giữ số dưới dạng string để không mất 001, 0.00; sai số cột báo 422 | Chưa có UI để người dùng khai báo CSV không có header; mặc định hàng đầu là header |
| Word DOCX | Parse bảng native, giữ từng hàng/ô và vị trí trong tài liệu; header tổng quát Cột 1… giữ cả hàng đầu nguồn | Chưa tái dựng rowspan/colspan phức tạp; đối chiếu bản gốc khi bảng merged cells |
| Markdown | Parser nội bộ ra block table có headers/rows, xử lý dấu pipe escape | Mỗi hàng dài quá ngân sách chunk cần tách cột/ô; không cắt giữa ô |
| PDF hoặc ảnh scan | Production đọc từng trang bằng Gemini Vision để giữ cả bảng, ảnh, công thức và thứ tự | PDF text layer hiện cũng dùng Vision; chưa có bộ nhận diện tọa độ bảng đủ tin cậy để bỏ qua Vision theo từng vùng |
| Kết quả | Typed table block, FE dựng bảng, Word/HTML/PDF dùng renderer bảng; bảng nguồn bị LLM bỏ sót được giữ thêm | Không suy diễn giá trị từ OCR không chắc; người dùng kiểm tra Review |

Bảng lớn chia tại ranh giới hàng, lặp headers ở mỗi chunk; không overlap hàng để tránh tạo bản sao. Test 1.600 hàng kiểm tra đủ mỗi ID đúng một lần. Hướng mở rộng cho PDF: extract text layer có tọa độ → xác định vùng bảng/ảnh → dùng parser cấu trúc khi có thể → Vision cho vùng scan/phức tạp → giữ sourcePage/bbox, đơn vị, header và row/col span → hiển thị đối chiếu để xác nhận. Không nên nối các ô thành một đoạn văn hoặc để LLM tự đoán cột/hàng.

## Database và kiểm chứng

- Đã áp dụng `database/07_resumable_activity.sql` (ingest lease, activity và sửa draft lỗi giới hạn) và `08_expanded_it_catalog.sql` (24 ngành/prompt). Có migration tương ứng trong supabase/migrations.
- Activity là bảng backend-only, RLS bật, anon/authenticated bị revoke; GET qua backend kiểm tra chủ sở hữu. Advisor INFO không có policy là chủ đích: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy. Cảnh báo Leaked Password Protection có từ trước vẫn còn: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- Unit kiểm tra quiz trên 100, model discovery/fallback/quota/auth, cấu hình thinking, CSV/Word/table 1.600 hàng, phục hồi draft/report thiếu và PDF song song giữ thứ tự.
- E2E thêm F5 khi OCR dở, draft lỗi giới hạn không crash/không gọi lại ingest, combobox tìm không dấu và tự nhận diện. Test fixture kiểm tra UI; test live Gemini/Supabase được ghi nhận bổ sung sau deploy.

## Kiểm chứng trên production sau deploy

- Commit tính năng `fdccad9`: GitHub Actions run `37025708903` đạt 116 unit tests, 14 E2E desktop/mobile, lint và build. Kiểm tra trực tiếp phát hiện và sửa thêm frontend đọc sai envelope của API topics; fixture đã sửa thành response giống server, có kiểm tra tìm Spring Boot từ dữ liệu thật.
- Văn bản IT 20.909 ký tự đã chuẩn hóa (4 mục I–IV), kèm bảng BFS/DFS, Mermaid và LaTeX: validate 4 chunk, phân tích Chuyên sâu thành công, quiz yêu cầu 5 trả 5. API create/validate/confirm/run/activity/result/quiz đều 2xx. Model thực tế `gemini-3.5-flash-lite`.
- Database ghi nhận 3 lượt phân tích bắt đầu lúc 15:22:53 UTC, chênh dưới 45 ms; các lượt kết thúc lúc 15:23:02 và 15:23:51. Đây là bằng chứng chạy đồng thời, không suy luận chỉ từ số worker. Quiz phần 1–3 cũng có khoảng thời gian chạy chồng nhau.
- Browser thật upload PDF 4 trang, F5 lúc activity hiển thị AI đọc trang 1–3. Mỗi trang chỉ có một lượt OCR thành công trong database. Phát hiện trường hợp OCR đã xong nhưng browser chưa gửi validate: đã sửa cho quay về bước tiếp tục kiểm tra, không hiển thị Review 0 mục. Sau tiếp tục, Review có 200 từ và 1 chunk hợp lệ. F5 lần nữa trong lượt phân tích Gemini: phiên khôi phục và chuyển sang kết quả đã lưu, không crash. Không có cơ chế worker tự chạy vô hạn sau khi đóng tab; lượt server đang chạy có thể hoàn tất, các lượt tiếp theo tiếp tục từ checkpoint khi mở lại.
- PDF 201 trang, chỉ 2.962 byte: ingest trả 413 `PDF_TOO_MANY_PAGES`, analysis lưu `failed`; gọi ingest lại trả 422 `INPUT_REPLACEMENT_REQUIRED`. Khai báo tệp 21 MB bị từ chối ngay tại create với 400 `INVALID_REQUEST`, không tạo draft. HTTP 413 là lỗi giới hạn có chủ đích; không phải lỗi server 500.
- Danh mục production: 73 ngành IT; browser đã tìm thấy Spring Boot và Spring Security, có mô tả và lựa chọn tự nhận diện khi không khớp.
- API xuất tạo và tải 5 định dạng thành công: PDF 77.662 byte, DOCX 49.556 byte, Markdown 10.034 byte, HTML 27.010 byte, JSON 20.474 byte. PDF 6 trang: đã xem trang 1 và 6, chữ Việt, bảng và công thức rõ; DOCX có 5 bảng, 4 ảnh công thức. **Xuất trực tiếp bằng API trước khi FE render SVG vẫn có thể giữ Mermaid dưới dạng mã nguồn.** Luồng xuất trên UI có bước render/lưu ảnh Mermaid trước khi gọi export. Chưa bổ sung renderer Mermaid độc lập ở backend trong đợt này; không coi kiểm tra tải 2xx là chứng minh mọi sơ đồ đã thành ảnh.
- Không có phép so sánh chấm điểm độc lập giữa Chuyên sâu và Tiêu chuẩn trong đợt này. Đã thay đổi prompt và thinking configuration, kiểm tra response có cấu trúc; chưa thể khẳng định Chuyên sâu luôn chất lượng hơn với mọi tài liệu.

Ảnh kiểm chứng F5 và nhật ký: `docs/screenshots/update-2026-10-02-f5.jpg`.

- Commit sửa checkpoint `a91f438`: CI run `37027790188` đạt 117 unit tests và 16 E2E desktop/mobile; lint/build thành công. Bản chốt tiếp theo chỉnh nhãn tiến độ đọc đầu vào và màn hình chờ khôi phục trước khi auth khởi tạo, kèm báo cáo/ảnh kiểm chứng.
