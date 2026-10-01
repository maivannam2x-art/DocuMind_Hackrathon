# DocuMind database — chuyển sang Supabase production

Thư mục này ở **gốc repo**, dành cho một Supabase project **mới**. SQL chỉ chứa schema, RLS, bucket và dữ liệu cấu hình công khai của ứng dụng; không chứa tài khoản, mật khẩu, khóa API, tài liệu, kết quả phân tích hay file Storage của người dùng.

## Đã tạo những gì?

Số liệu kiểm tra trực tiếp trên project hiện tại ngày 01/10/2026 (có thể tăng khi người dùng tiếp tục sử dụng):

| Nhóm | Bảng | Số dòng hiện có | Vai trò |
| --- | --- | ---: | --- |
| Tài khoản | `profiles` | 1 | Hồ sơ gắn với `auth.users` (Supabase Auth quản lý đăng nhập/mật khẩu). |
| Cấu hình | `topics`, `topic_specializations` | 1, 49 | Một chủ đề gốc IT, 16 nhánh cấp 1 và 33 nhánh con; ngoài IT dùng prompt chung, không tạo một topic giả. |
| Cấu hình | `prompt_templates`, `validation_rules` | 24, 7 | 19 prompt đang bật (5 bản cũ đã tắt), 7 quy tắc đầu vào/cấu trúc/đầu ra/quiz. |
| Phiên phân tích | `analyses`, `analysis_inputs`, `analysis_chunks` | 22, 22, 365 | Trạng thái và chủ sở hữu; file/văn bản gốc, chuẩn hóa, chỉnh sửa; chunk có vị trí và trạng thái retry. |
| AI và kết quả | `llm_exchanges`, `analysis_results`, `generated_assets` | 387, 12, 934 | Request/response AI, JSON đã parse, metadata các asset sơ đồ/công thức. |
| Học và tương tác | `quizzes`, `quiz_questions`, `quiz_attempts`, `chat_messages` | 10, 69, 4, 8 | Quiz, đáp án/chấm điểm, lượt làm và chat theo phiên. |
| Xuất | `exports` | 4 | Metadata báo cáo JSON, Markdown, HTML, PDF, DOCX. |

Đủ **16 bảng ứng dụng** ở schema `public`, tất cả bật RLS. Ba bucket **private**: `analysis-inputs` (nguồn tải lên), `analysis-exports` (báo cáo), `analysis-assets` (ảnh/sơ đồ). `auth.users` và bảng hệ thống Storage thuộc Supabase, không phải bảng tự tạo của DocuMind. Không lấy số dòng cá nhân ở bảng trên làm dữ liệu mẫu.

Catalog IT có ngôn ngữ lập trình, kỹ nghệ phần mềm, web/backend, di động, DSA, database, mạng, bảo mật, AI/LLM, data engineering, cloud/DevOps, OS, kiến trúc máy tính, kiểm thử và hệ phân tán. Prompt hoạt động gồm nhận diện chủ đề, tạo section, quiz, chat, sửa JSON; trường hợp ngoài IT/không rõ dùng 5 prompt fallback riêng. Các prompt chuyên sâu cho giải thuật, backend/API, phân tán, LLM/RAG, Cloud/DevOps và OS ở `02_it_catalog_enhancement.sql`. Output schema vẫn là `sections[].blocks[]` có `type`/`contentType` để FE render đúng code, bảng, công thức, sơ đồ và JSON.

## Cách đưa sang production

1. Tạo **Supabase project trống, riêng**. Không chạy bootstrap trên project hiện tại hoặc project có dữ liệu. Sao lưu và kiểm tra quyền truy cập trước khi làm trên một project đã có người dùng.
2. Chọn **một** trong hai cách cài mới:
   - **Khuyến nghị khi quản lý migrations**: chạy chín file `supabase/migrations/*.sql` theo thứ tự tên file, rồi chạy `database/02_it_catalog_enhancement.sql` và `database/04_foreign_key_indexes.sql`. Nếu dùng Supabase CLI, để CLI quản lý lịch sử từ project trống; không chạy SQL Editor rồi lại replay migrations bằng CLI. Hai file SQL bổ sung cần được đưa vào quy trình migration có theo dõi của môi trường đó.
   - **Cài thủ công bằng SQL Editor**: chạy **chỉ** `database/01_fresh_production_bootstrap.sql` trên project trống, bằng vai trò có quyền tạo schema/policy/bucket. File là một transaction ghép chín migration, seed mở rộng và 13 index khóa ngoại; lỗi sẽ rollback. Cách này **không ghi** lịch sử vào `supabase_migrations`; đừng dùng CLI `db push` để replay cùng schema sau đó. Muốn dùng CLI về sau, lập baseline có kiểm tra thay vì tự đánh dấu migration tùy tiện.
3. Chạy `database/03_verify_installation.sql`. Kết quả mong đợi: `16 / 1 / 49 / 19 / 7 / 3 / 16` theo thứ tự cột. Chạy lại `02_it_catalog_enhancement.sql` ở project đã có schema sẽ không nhân đôi bản ghi (có `ON CONFLICT`).
4. Đặt `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` **của project production** trong môi trường Vercel; cấu hình Auth Site URL và redirect `/auth/callback`. Bật **Leaked Password Protection** trong Supabase Auth nếu gói/dự án hỗ trợ; advisor của project hiện tại báo tính năng này đang tắt. Khóa server, Gemini và `CRON_SECRET` không được đưa vào SQL/GitHub hoặc biến `NEXT_PUBLIC_`.
5. Kiểm tra đăng ký/đăng nhập, guest, phân tích/quiz/chat/xuất file, upload và signed URL trên production bằng tài liệu thử. Các bucket private không tự sao chép file từ project cũ.

Nếu cần **chuyển dữ liệu người dùng thật** (không chỉ cấu trúc và seed), hãy dùng quy trình backup/restore riêng và mã hóa bản backup, tính cả `auth.users` và Storage objects; không commit dump dữ liệu cá nhân hoặc khóa vào repo. UUID và foreign key của các bảng nghiệp vụ phụ thuộc Auth, nên không thể chỉ copy từng bảng `public` độc lập. Project hiện tại đã có chín migration ghi trong lịch sử Supabase, nhưng tên phiên bản của sáu migration đầu trên server khác tên file hiện tại; đừng suy đoán chúng chưa chạy rồi áp dụng lại. Hai file `02` và `04` đã áp dụng trực tiếp trên project hiện tại (không có bản ghi migration mới trên server), vì vậy hãy dùng file SQL để đồng bộ môi trường mới; sau đó chuẩn hóa lịch sử migration trước khi tiếp tục dùng CLI `db push`.
