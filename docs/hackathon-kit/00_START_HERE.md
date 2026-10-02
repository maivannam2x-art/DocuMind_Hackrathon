# DocuMind — bộ bàn giao thi hackathon

Ngày đóng gói: 03/10/2026 (Việt Nam). Mã nguồn chuẩn: `d76e57f5e2fb3c32c54276bd28ac0415dc816a43` của `maivannam2x-art/DocuMind_Hackrathon`. Bộ này để tái triển khai đúng hành vi hiện tại lên repository/Supabase mới và chạy máy thi.

## Đọc và làm theo thứ tự

| File | Dùng để làm gì |
| --- | --- |
| `01_SUPABASE_BOOTSTRAP.sql` | Một lần tạo đủ 19 bảng ứng dụng public, enum, FK/index, RLS/policy, trigger/RPC, seed và ba bucket private. |
| `02_VERIFY_DATABASE.sql` | Kiểm tra cài mới, số seed, quyền và các cột checkpoint. |
| `03_DEPLOY_ON_NEW_MACHINE.md` | Tạo `.env.local`, chạy local, chuyển Vercel, xử lý lỗi cấu hình. |
| `04_TEAM_10_HOURS.md` | Lịch 10 giờ, 12 branch, 24 commit nhập module, thứ tự PR/merge và tiêu chí nghiệm thu. |
| `MEMBER_1_DATABASE_BACKEND.md` | Người 1: nền tảng, SQL, Auth, API phiên, quota/log, CI; trưởng tích hợp. |
| `MEMBER_2_AI_DOCUMENTS.md` | Người 2: Gemini, OCR, đề mục/chunk, pipeline, quiz/chat. |
| `MEMBER_3_UI_EXPORT_QA.md` | Người 3: UI, F5/lịch sử, ảnh PNG, 5 định dạng xuất, QA/browser và demo. |
| `05_CODE_FLOW_AND_JURY.md` | Từng API, hàm, trạng thái, DB trigger/RPC, cấu trúc kết quả, sơ đồ và câu trả lời cho giám khảo. |
| `06_VERIFICATION_REPORT.md` | Kết quả kiểm chứng, phần đã test và giới hạn còn lại. |
| `module-manifest.json`, `import_module.py` | Danh sách đúng 156 file nguồn thiết yếu; một chủ sở hữu/file; nhập module vào repo mới theo commit cố định. |
| `.env.example` | Chỉ placeholder cấu hình, không có key thật. |

**SQL không chuyển dữ liệu người dùng cũ**. Không copy tài khoản, mật khẩu, API key, file/tài liệu hoặc log riêng tư. Cấu hình nền tảng Auth/Site URL/hosting không thể được chuyển đầy đủ bằng SQL, đã ghi riêng trong hướng dẫn triển khai. `auth` và `storage` là schema hệ thống Supabase; các bảng nghiệp vụ ở chung `public`.

Đăng ký mới không xác nhận email: `/api/auth/register` tạo account phía server rồi browser đăng nhập. SQL không sửa trực tiếp Auth schema và không cần SMTP cho flow này. Email được chấp nhận như thông tin người dùng nhập; ứng dụng không xác minh người đó sở hữu email.

Thông tin chưa được cung cấp: URL repository mới và project ref Supabase mới. Các file dùng `NEW_REPO_URL`, `YOUR_PROJECT_REF` để bạn điền; chưa áp dụng SQL hoặc deploy vào một project mới chưa được xác định.

Kế hoạch 10 giờ dùng lại mã nguồn hiện có, ghi rõ commit nhập/tích hợp module. Đây không phải cam kết viết lại toàn bộ từ số 0 trong 10 giờ. Khi trình bày, mô tả đúng phần tái sử dụng và phần team thực hiện; đối chiếu quy định cuộc thi về nguồn có sẵn. Không tạo commit giả hoặc sửa lịch sử tác giả.
