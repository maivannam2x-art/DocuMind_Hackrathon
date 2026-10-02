# Database DocuMind — bộ cài mới

## Bản đơn giản: bảng và dữ liệu, không có hàm tự viết

Nếu chỉ cần tạo bảng và dữ liệu ban đầu, chạy **08_simple_tables_and_seed.sql** trên project Supabase mới/trống. File tạo trực tiếp cấu trúc cuối cùng: 19 bảng trong public, khóa chính/ngoại, chỉ mục, 1 chủ đề IT, 73 chuyên ngành, 43 prompt, 7 quy tắc. Không giữ các phiên bản seed inactive; không chứa tài khoản hay phiên mẫu của người dùng. Không tạo function hoặc trigger ứng dụng. Có RLS và phân quyền để tránh lộ dữ liệu qua Data API; `auth.uid()` và `gen_random_uuid()` là hàm có sẵn của nền tảng/Postgres.

Để **chạy đầy đủ code hiện tại**, chạy tiếp **09_simple_runtime_addon.sql**: hai RPC `consume_api_quota`/`gemini_circuit_event`, hàm tạo profile và cập nhật thời gian, trigger, 3 bucket private. Bỏ phần này thì API đăng ký/quota/đổi model bị lỗi 503, profile không tự tạo và file chưa có bucket để lưu. Bảng và seed không thể thay thế các thao tác nguyên tử mà code đang gọi.

Nếu muốn app thực sự không có hàm/trigger SQL, cần sửa backend: tự tạo profile, tự cập nhật updated_at, thay quota và circuit breaker bằng cơ chế chia sẻ có khóa nguyên tử. Chỉ đọc/ghi bảng kiểu read-then-update không bảo đảm đúng khi nhiều request chạy đồng thời trên Vercel. Hiện tại chưa thay đổi kiến trúc runtime đó.

**Chọn một cách cài:** (A) file 08 rồi, nếu cần chạy app, file 09; hoặc (B) file bootstrap 01 bên dưới. Không chạy cả hai, không chạy trên database đã có bảng. SQL 08 đã được kiểm tra trên PostgreSQL cục bộ: 19 bảng RLS, đúng 1/73/43/7 seed, không có function ứng dụng. SQL 09 đã kiểm tra trigger profile, RPC quota và circuit claim với schema Auth/Storage giả lập; chưa áp dụng vào project Supabase mới của bạn.

## Bản bootstrap đầy đủ từ lịch sử migration

Chạy **chỉ** `01_fresh_production_bootstrap.sql` một lần trong SQL Editor của Supabase project trống, role `postgres`. File có transaction và chặn khi đã có bảng DocuMind; không chạy trên project đang phục vụ người dùng. Sau đó chạy `03_verify_installation.sql`: mong đợi **19 / 1 / 73 / 43 / 7 / 3 / 19**. SQL bao gồm đủ 15 migration, catalog IT bổ sung, index khóa ngoại và quyền truy cập rõ ràng.

19 bảng ứng dụng ở **public**. `profiles.id` tham chiếu `auth.users.id`; Supabase Auth quản lý tài khoản/mật khẩu trong schema **auth**. Schema **storage** quản lý bucket/object; file thực nằm ở Storage. Hai schema do nền tảng quản lý này không chuyển sang public. Không chứa người dùng, tài liệu, phiên, kết quả hay khóa của project cũ.

Dữ liệu ban đầu: 1 topic IT active, 73 chuyên ngành phân cấp active, 43 prompt active, 7 validation rule active. Có các prompt/version lịch sử inactive và topic cũ inactive do migration; giao diện chỉ đọc active. Năm prompt fallback chung dành cho ngoài IT/không rõ ngành; OCR/overview có prompt dùng chung cho các tài liệu.

Bucket private: `analysis-inputs` 20 MiB, `analysis-assets` 10 MiB, `analysis-exports` 20 MiB (gồm ZIP Markdown kèm ảnh). Quota, nhật ký, model health và đáp án quiz chỉ truy cập qua server. PNG được lưu Storage, database giữ đường dẫn/metadata. Signed URL cần cấp mới khi hết hạn.

`node scripts/build-database-bootstrap.mjs` tái tạo bootstrap từ migrations + `02_it_catalog_enhancement.sql` + `04_foreign_key_indexes.sql`; không ghép các bản SQL 05–08 trùng migration lần nữa. SQL Editor không ghi lịch sử Supabase CLI; **không chạy lại `db push` các migration hiện hữu sau bootstrap**. Nếu chọn quản lý CLI thay vì SQL Editor, phải thêm hai seed/index bổ sung vào migration theo dõi rồi chạy toàn bộ trên database trống; không trộn hai phương pháp.

Đăng ký mới dùng `/api/auth/register` → server `auth.admin.createUser({email_confirm:true})` → Supabase trigger tạo profile → browser `signInWithPassword`. Không gửi email xác nhận, không cần SQL sửa bảng Auth hoặc cấu hình SMTP. Đây là chấp nhận email người dùng nhập, không xác minh quyền sở hữu email. Không tự thay đổi tài khoản cũ chưa kích hoạt. Service role key chỉ ở server.

Hướng dẫn triển khai, phân công 3 người và luồng code: [docs/hackathon-kit](../docs/hackathon-kit/00_START_HERE.md). Các SQL khác trong thư mục là migration bổ sung/audit riêng, không cần chạy lại sau bootstrap đầy đủ.
