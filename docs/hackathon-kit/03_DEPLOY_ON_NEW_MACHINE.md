# Triển khai giống bản hiện tại trên môi trường mới

## 1. Những gì cần chuẩn bị

- Node.js **22 LTS**, npm, Git; Python 3 chỉ cần nếu chia module bằng helper. Máy Windows/macOS/Linux đều có thể chạy app; cần Internet tới Supabase và Gemini.
- URL repository mới và quyền push của 3 người. Repository chứa `package-lock.json`; dùng `npm ci` để tái lập phiên bản đã khóa. Không chỉ copy `package.json` rồi để dependency tự đổi.
- Supabase project **Postgres chuẩn, trống**, URL `https://YOUR_PROJECT_REF.supabase.co`, publishable/anon key và service role key. Service role chỉ đặt môi trường server. Không lấy key/project ref cũ.
- Gemini API key khi demo AI thật. Quyền/quota model phụ thuộc project Gemini; hệ thống kiểm catalog trước khi gọi. Mock không cần Gemini key nhưng vẫn cần Supabase.

## 2. Cài database mới

1. Mở đúng project mới → SQL Editor → role `postgres`. Paste toàn bộ `01_SUPABASE_BOOTSTRAP.sql` → Run **một lần**.
2. Nếu lỗi, transaction rollback; đọc lỗi và sửa môi trường trước khi chạy lại. Nếu đã có `public.analyses`/`profiles`, file sẽ dừng; không xóa bảng để ép chạy trên production.
3. Run `02_VERIFY_DATABASE.sql`. Mong đợi: **19 bảng / 1 topic IT active / 73 ngành active / 43 prompt active / 7 rule active / 3 bucket private / 19 bảng RLS**. Các cột lease/checkpoint đủ 6; quyền đáp án và sửa trạng thái trực tiếp đều false.
4. Storage: ba bucket `analysis-inputs` (20 MiB), `analysis-assets` (10 MiB), `analysis-exports` (20 MiB, cho ZIP). Không bật public. Không cần tự upload seed ảnh; ảnh sinh khi phân tích/xuất.
5. Data API: schema public phải được expose; SQL đã có explicit GRANT, không dựa vào auto-grant của project. Không bật quyền browser sửa analysis hoặc đọc đáp án quiz.
6. Không chạy `supabase db push` replay migration sau khi cài bằng SQL Editor. Bootstrap này không ghi `supabase_migrations`; migration về sau cần baseline có kiểm tra. Chỉ chọn một phương pháp cài.

Bảng ứng dụng ở public; `auth.users`, `storage.buckets`/`objects` thuộc nền tảng. UUID seed tạo mới vẫn liên kết đúng bằng code/slug; không cần UUID của project cũ. Những topic/version cũ inactive là lịch sử cấu hình, không hiển thị trên UI.

## 3. Auth: không cần xác nhận email

- Bật Email/password provider trong Supabase Auth. App đăng ký qua API server, không gọi `auth.signUp` trực tiếp từ browser nữa.
- Server `/api/auth/register` kiểm dữ liệu, origin, quota → `auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name}})` → trigger tạo profile.
- Browser gọi `signInWithPassword` và được cấp session ngay; không email, không chờ callback. Không cần tắt một setting qua SQL hoặc sửa bảng Auth.
- Nếu muốn các client khác gọi Supabase `signUp` trực tiếp cũng không xác nhận, vào Auth → Email/provider settings, tắt **Confirm email** và Save. Đây là lựa chọn cấu hình project ngoài SQL; không cần cho flow đăng ký của DocuMind.
- Site URL: `http://localhost:3000` khi chạy máy riêng, domain thật khi deploy. Giữ redirect `http://localhost:3000/auth/callback` và `<DOMAIN>/auth/callback` nếu cần link Auth cũ; callback không tham gia đăng ký mới.
- Tài khoản cũ chưa confirm không được endpoint tự mở khóa. Project mới bắt đầu trống nên không gặp vấn đề này. Không cấp role/admin từ metadata do người dùng gửi.

## 4. Lấy code nhanh (không chia nhập module)

Git Bash hoặc terminal macOS/Linux; thay URL repo mới thật:

```bash
git clone https://github.com/maivannam2x-art/DocuMind_Hackrathon.git DocuMind-demo
cd DocuMind-demo
git checkout d76e57f5e2fb3c32c54276bd28ac0415dc816a43
git switch -c main-new
git remote rename origin source
git remote add origin NEW_REPO_URL
```

Repo mới trống: `git push origin HEAD:main`. Repo mới đã có README/commit: không force push; clone repo mới và làm phương án nhập module ở `04_TEAM_10_HOURS.md` (hoặc nhập nguồn trong một PR nếu chỉ cần chạy nhanh). Giữ lịch sử nguồn theo phương án clone; không nhận là tự viết lại toàn bộ.

## 5. Điền môi trường và chạy local

Tại root repo: macOS/Linux/Git Bash `cp .env.example .env.local`; PowerShell `Copy-Item .env.example .env.local`.

| Biến | Giá trị/ý nghĩa |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL project mới, cùng project với tất cả Supabase keys. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Key publishable mới. Nếu dùng legacy anon, điền `NEXT_PUBLIC_SUPABASE_ANON_KEY` thay thế. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role server, cần cho CRUD/quota/Storage/đăng ký. Không dùng publishable key ở đây. |
| `LLM_PROVIDER` | `mock` kiểm luồng deterministic; `gemini` đọc ảnh/PDF thật và sinh AI thật. |
| `GEMINI_API_KEY` | Key Gemini server; để trống khi mock. |
| `GEMINI_MODEL` | Model ưu tiên, mẫu `gemini-3.5-flash-lite`; catalog sẽ lọc model không có quyền hỗ trợ. |
| `GEMINI_FALLBACK_MODELS` | Để trống dùng thứ tự code hiện tại; điền danh sách phân cách dấu phẩy nếu chủ động override. |
| `LLM_CONCURRENCY` | 3 mặc định, clamp 1–4; nhiều song song vẫn có thể gặp quota. |
| `CRON_SECRET` | Chuỗi ngẫu nhiên server dùng bảo vệ API dọn TTL; không dùng Gemini/service role làm secret này. |
| Các `MAX_*`, TTL/log | Giữ `.env.example` trước; không nâng upload/PDF mà quên quota tài nguyên và giới hạn bucket. |

```bash
node --version
npm ci
npm run lint
npm test
npm run typecheck
npm run build
npm run start
```

Mở `http://localhost:3000`. Giữ terminal chạy. Nếu cần chỉ bind local: `npm run start -- --hostname 127.0.0.1`. Dev dùng `npm run dev`; khi đổi biến `NEXT_PUBLIC_*`, build lại để frontend nhận key mới. Không có full offline mode hiện tại: mock chỉ thay LLM, không thay database/Storage.

Trước hôm thi, tải npm dependency và binary Chromium, thử build trên **đúng máy/OS**. `@resvg/resvg-js`/sharp có native package theo OS; không copy node_modules giữa Windows/Linux. Copy code và chạy npm ci trên máy đích.

## 6. Vercel nếu cần domain public

Import **repository mới đúng account/team**, chọn Next.js, Node 22, root repo, Install `npm ci`, Build `npm run build`; thêm các env trên vào đúng Production/Preview. Deploy và kiểm deployment của đúng commit. Đổi env frontend phải redeploy. Không dùng secret của project cũ.

GitHub Actions trong `.github/workflows/verify.yml`: Node 22 → npm ci → lint → unit → build → Chromium → 22 case E2E desktop/mobile. Test browser dùng API fixtures; vì vậy còn cần thử thật Supabase/Gemini trên môi trường mới.

`vercel.json` có cron `/api/cron/cleanup` hằng ngày. Server chạy local không có Vercel scheduler: tự đặt lịch gọi GET kèm `Authorization: Bearer <CRON_SECRET>` nếu dùng lâu dài. Demo 10h không phải lập cron để phân tích chạy được. Cron dọn guest hết hạn, log cũ, quota hết hạn; không phải worker chạy AI.

## 7. Nghiệm thu trên project mới

1. Đăng ký email mới → lập tức ở trạng thái đăng nhập; profile có tên; logout → login đúng password; sai password không vào được.
2. Guest dán văn bản IT dài, I/II/III có mục con → Review đúng; sửa một mục → lưu → cây/chunk cập nhật; confirm → xử lý → completed.
3. PDF và DOCX thật có chữ+bảng+công thức+sơ đồ → Gemini nhận dạng đúng thứ tự; ảnh minh họa có thông báo bỏ qua; không mất chữ phía sau ảnh.
4. F5 giữa ingest và giữa run → lịch sử mở lại đúng trang/tiến độ; chunk đã complete không gọi lại. Hai tab kiểm tra lease.
5. Quiz default20 và tùy chọn100 trên tài liệu đủ dài, kiểm số thực nhận/shortfall; chấm server, không có đáp án trong GET quiz.
6. Chat hỏi câu có trong nguồn và câu ngoài nguồn; xem citations/không bịa; nhật ký tách AI và nội bộ.
7. Mở bản gốc từ lịch sử; Storage giữ file riêng tư; URL hết hạn được cấp mới.
8. PDF/DOCX/HTML/Markdown ZIP/JSON tải được; tiếng Việt đúng font; ảnh PNG có ở tất cả định dạng; thử mở báo cáo không dùng network (JSON signedURL là ngoại lệ có TTL).
9. Vượt20MB, PDFquá 200 trang, file giả extension, JSON model sai, model429, mạng ngắt → lỗi có hướng khắc phục, vị trí file/trang; UI không crash.

## 8. Chẩn đoán nhanh

| Triệu chứng | Kiểm tra |
| --- | --- |
| Đăng ký503/không lưu profile | Service role đúng project; RPC quota có; trigger/permission auth tạo profile. Không log password. |
| Danh sách ngành trống | SQL đã commit, seed73active, API schema public+grant; URL/key cùng project. |
| Upload lỗi trước ingest | Bucket/input MIME/size; signed upload URL, không chuyển file20MB qua JSON/Vercel Function. |
| Gemini429/404 | Key quyền/quota, catalog, cooldown; không thêm model tưởng tượng để ép thử vô hạn. |
| Phiênprocessing sau đóng tab | Mở lại phiên rồi Tiếp tục; chờ lease hết nếu request cũ đang giữ. Không có worker độc lập. |
| PDF/DOCX thiếu ảnh/font | Có `public/fonts/DocuMindSans.ttf` và license; native rasterizer cài đúng OS; assetPNG Storage/path tồn tại. PlantUML cần chuyển Mermaid. |
| Build local không start vì networkInterfaces | Bind `--hostname 127.0.0.1`; môi trường sandbox có thể cấm liệt kê interface. |
| Typecheck báo `.next/types` thiếu | Chạy build trước để tạo Next types; kiểm Node/npm theo lockfile. |
