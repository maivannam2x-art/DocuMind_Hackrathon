# DocuMind

Trợ lý học từ tài liệu IT: nhập nhiều file/văn bản → đọc và kiểm tra → xem/sửa đề mục → xác nhận → AI phân tích → tổng quan, tóm tắt, chi tiết, quiz, chat và báo cáo.

## Chạy lại trên máy thi

1. Node.js 22, Git. `npm ci`.
2. Supabase project trống: chạy **một lần** `database/01_fresh_production_bootstrap.sql`, rồi `database/03_verify_installation.sql`. Đủ 19 bảng public, 73 ngành IT, 43 prompt active, 7 rule, 3 bucket private. Không chạy lại migration sau bootstrap SQL Editor.
3. Copy `.env.example` thành `.env.local`, điền URL/key public Supabase và **server-only** service role của project mới. `LLM_PROVIDER=mock` không cần Gemini nhưng vẫn cần Supabase; `LLM_PROVIDER=gemini` cần `GEMINI_API_KEY`.
4. `npm run dev` để phát triển; `npm run build` rồi `npm run start` để demo bản build tại localhost:3000.
5. `npm test`, `npm run lint`, `npm run typecheck`; sau build, `npx playwright install chromium` và `npm run test:e2e`.

Bộ triển khai/phân công/giải thích: [docs/hackathon-kit/00_START_HERE.md](docs/hackathon-kit/00_START_HERE.md).

## Hành vi thực tế

Đăng ký mới qua API server `/api/auth/register`, tạo account với `email_confirm:true`, tự đăng nhập bằng mật khẩu; **không có bước xác nhận email**. Profile do trigger `on_auth_user_created` tạo. Không tự sửa tài khoản cũ, không lưu mật khẩu ở public.profiles. `auth/callback` giữ tương thích link cũ. Đăng nhập/đăng xuất dùng Supabase Auth; server kiểm JWT qua `auth.getUser`.

File gốc upload trực tiếp bucket private bằng URL được ký, nội dung dán cũng lưu TXT. `/ingest` đọc theo checkpoint; PDF ở chế độ Gemini gửi từng trang sang AI kể cả khi có text layer để giữ hình/bảng/công thức. Word đọc text/table bằng code, chỉ gọi AI cho ảnh/Office Math/drawing cần nhận dạng. TXT/CSV/mã nguồn parse nội bộ. **OCR có thể gọi AI trước bước xác nhận**; xác nhận kiểm soát giai đoạn phân tích/quiz tiếp theo.

`outlineText` xác định đề mục theo chuỗi và phân cấp; `chunkText` ưu tiên mục lớn, tách mục con khi dài, gộp mục ngắn. `/validate` ghi vị trí cảnh báo theo file/trang; `/review` lưu chỉnh sửa và chia lại. `/confirm` chuyển ready. `/run` xử lý nhóm chunk có giới hạn song song, lưu checkpoint; frontend tiếp tục gọi đến khi completed. F5 mở lại bằng ID/lịch sử. Chưa có worker tự chạy tiếp vô hạn sau khi đóng browser.

Kết quả JSON có sections/blocks và contentType; frontend dựng text/list/table/code/json riêng. LaTeX/Mermaid được code dựng **PNG** và upload `analysis-assets`; DB không lưu ảnh base64. PDF/DOCX nhúng PNG, HTML nhúng PNG để mở offline, Markdown là ZIP gồm report.md và ảnh; JSON giữ nội dung có kiểu và metadata/path. PlantUML chưa có renderer, cần chuyển Mermaid; lỗi hiện rõ, không giả báo cáo thành công.

Quiz mặc định 20, nhận số nguyên dương người dùng chọn, tạo theo batch và nguồn; thiếu nội dung được báo. Chat lấy nguồn liên quan. IT có catalog/prompt chuyên ngành; ngoài IT dùng fallback chung. Mock luôn được đánh dấu mô phỏng, OCR mock không chứng minh đọc ảnh thật.

Model được đối chiếu catalog Gemini thật, chuyển theo thứ tự; 5 lỗi liên tiếp khóa model 5 phút qua RPC dùng chung, một probe khi hết cooldown. Nhật ký AI/hệ thống luôn hiện; log nội dung mặc định redacted. Guest dùng cookie HttpOnly, dữ liệu DB có TTL mặc định 24 giờ; đăng nhập không tự nhập dữ liệu guest vào account. Cron cleanup bảo vệ bằng `CRON_SECRET`; chạy máy riêng cần tự gọi lịch dọn nếu sử dụng lâu dài.

Không commit `.env.local`, service role, Gemini key, token phiên hay dữ liệu người dùng.
