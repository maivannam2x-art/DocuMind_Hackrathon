# Báo cáo kiểm chứng và bàn giao

Ngày 03/10/2026 Việt Nam. Source chuẩn: `d76e57f5e2fb3c32c54276bd28ac0415dc816a43`. Bằng chứng máy đọc được ở `verification-evidence.json`; không chứa key, password, access token, email QA hoặc tài liệu người dùng.

## Những lỗi tài liệu/cấu hình đã sửa

1. File SQL tổng hợp cũ thiếu `api_rate_limits`, `analysis_activity` và các cột lease/checkpoint mới; README vẫn ghi16bảng/49ngành/19prompt. Bộ SQL mới ghép đủ15migrations + seed IT bổ sung + FKindexes, tạo19bảng,73ngànhactive,43promptactive.
2. GRANT rõ ràng giúp project mới không phụ thuộc automatic grant public tables. Đáp án quiz/quota/log/model health giữ API-only; RLS đủ19bảng. Có guard từ chối chạy bootstrap trên DB đã có DocuMind.
3. Auth mới không cần email confirmation: API server tạo account `email_confirm:true`, browser đăng nhập bằng password ngay; trigger profile giữ nguyên. Không sửa password/confirmation của account cũ, không nhận role từ input. Có quota atomic/origin/schema validation.
4. README sửa các mô tả không đúng: OCR có thể gọi AI trước confirm; PDF production đọc từng trang bằng Gemini; guest có history/TTL; PNG Storage dùng chung export; Markdown là ZIP; PlantUML chưa renderer; chưa worker độc lập khi đóng tab.
5. Env mẫu bỏ ưu tiênmodel3.8 đã hardcode không phù hợp catalog; dùng ưu tiên3.5FlashLite và fallback để trống theo danh sách code/catalog, không chứa key thật.

## Kết quả chạy kiểm chứng

| Hạng mục | Kết quả | Phạm vi thực tế |
| --- | --- | --- |
| Unit tests | **144 pass /27files** | Toàn unit suite, có5case đăng ký mới/origin/quota/duplicate/validation. |
| Lint/build | Pass | Lint có3warning `<img>` đã có; không có error. Next build/type checking thành công. |
| CI GitHub | **Success**, run37047060707/job110970991913 | Node22; npmci/lint/unit/build/Chromium/E2E/artifact đều success. |
| E2E CI | **22 pass** | Desktop/mobile với API fixtures; không thay thế tích hợp thật với Gemini/Storage. |
| Vercel | **Deployment success** | Bản source commit trên production hiện tại. |
| Đăng ký thật | **201**, confirmationRequiredfalse | Account QA mới trên production, không đọc mailbox. |
| Login ngay | **200**, có session | Supabase password login sau tạo account; không chờ confirm. |
| Profile | **200**, tên đúng | Auth trigger + public.profiles + API owner. |
| Password sai | **400** từ Supabase Auth | Không cấp session. |
| Register email đã có | **409** | Không overwrite account cũ. |
| Bootstrap SQL | **Pass19/1/73/43/7/3/19** | Toàn SQL ứng dụng chạy không sửa trên PGlite PostgreSQL trống, có doubles cho auth/storage schemas/roles. |
| Trigger/RPC/quyền | Pass | Tạo profile, quota vượt hạn bị chặn,5fail mởcircuit, public không đọc đáp án/sửastate/gọiquota. |
| Chia file/commit | **156files /24commits /không trùng owner** | 12groups, mỗi group2parts; helper thử trong Git repos cục bộ, file bytes khớp nguồn; cả156Git blob SHA đã đối chiếu đúng snapshot GitHub. Literal `[id]` paths được xử lý đúng. |

URL CI: https://github.com/maivannam2x-art/DocuMind_Hackrathon/actions/runs/37047060707 . Production: https://docu-mind-hackrathon.vercel.app/ . Mã nguồn: https://github.com/maivannam2x-art/DocuMind_Hackrathon/commit/d76e57f5e2fb3c32c54276bd28ac0415dc816a43 .

## Phần chưa được thực hiện trên project mới

Chưa có URL repo mới/project ref Supabase mới trong yêu cầu hiện tại, nên không tự chọn project bất kỳ rồi áp SQL/deploy. SQL mới đã thử trên PostgreSQL cục bộ, **chưa tuyên bố đã cài vào Supabase trống của bạn**. Auth/Storage service của Supabase không được emulated hoàn chỉnh bằng doubles; các kiểm thực địa phải chạy sau khi điền project mới.

Trong lượt này đã kiểm production registration và CI regression; không chạy lại toàn corpus tài liệu/quiz100/5exports với project mới chưa xác định. Các kiểm PNG/export, cảnh báo, nguồn gốc, Gemini failover của bản trước có audit trong `docs/` repository nguồn. Kế hoạch 10h dành giờ6.5–9 cho kiểm thật trên môi trường đích.

E2E chạy local trong sandbox lượt này bị chặn khi Next start cần đọc networkInterfaces; không tính các lần đó là pass. CI Node22 đã chạy22case thành công. Tài liệu có lệnh bind127.0.0.1 cho máy có hạn chế interface; không thay test assertion để bỏ lỗi.

## Giới hạn cần trình bày đúng

- Không có worker tự chạy toàn tài liệu sau đóng browser; checkpoint và resume giữ tiến độ.
- OCR có sai số/quota; PDF Gemini đọc từng trang, mock OCR là sample.
- Diagram chỉ có mô tả không dựng chính xác hình gốc; PlantUML chưa renderer. Pipeline ảnh non-strict để UI fallback, export strict để không mất ảnh âm thầm.
- Quiz không fix100 nhưng vẫn chịu giới hạn nguồn/tài nguyên; thiếu câu unique phải có shortfall.
- Metrics dựa trên tối đa2000exchange rows, không đếm đầy đủ OCR/model attempts và không tính tiền.
- Word font khai báo có thể bị ứng dụng đọc substitute nếu máy thiếu font; PNG formula/diagram đã raster không phụ thuộc font máy người xem.
- Mock vẫn cần Supabase, chưa chạy offline toàn hệ thống; chưa vector retrieval.
- UI theo code hiện tại; không xác nhận đối chiếu Figma pixel trong lượt này.

## Release máy thi

Theo `03_DEPLOY_ON_NEW_MACHINE.md`: cài SQL→verify→env mới→npmci→lint/unit/build/typecheck/E2E→test thật→freeze main. Theo `04_TEAM_10_HOURS.md`: 3owner,12branch,24commit import, ít nhất13PR do A4runtime và CI tách hai PR. Ghi đúng source reuse, các commit sửa thực tế và release SHA cuối; không tạo lịch sử giả.
