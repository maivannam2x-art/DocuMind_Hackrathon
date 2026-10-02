# Người 1 — Database / Backend / Auth / Tích hợp

Bạn là trưởng tích hợp. Giữ cấu hình package/lock/SQL/env/CI. Điều phối quyền repo và merge; không đưa secret vào file commit.

Source: `d76e57f5e2fb3c32c54276bd28ac0415dc816a43`. Làm setup repo/fetch ở `04_TEAM_10_HOURS.md` trước; thay URL repo mới thật. Danh sách dưới là toàn bộ file bạn sở hữu, không sửa nhóm khác. Mỗi nhóm có hai part/commit thật. Kiểm dependencies ở bảng tổng trước khi merge.
## A1: Nền tảng: package-lock, env mẫu, Next/TS/ESLint.

Branch `feat/a1-foundation`. Nghiệm thu: Chạy npm ci theo lockfile; không nâng package. Giữ .env.local ngoài Git.

### Commit 1

Message: `chore: import locked dependencies and environment scaffold`. Các file chính xác (4):

- `.env.example`
- `.gitignore`
- `package-lock.json`
- `package.json`

### Commit 2

Message: `chore: import Next.js TypeScript and build configuration`. Các file chính xác (5):

- `eslint.config.mjs`
- `next-env.d.ts`
- `next.config.ts`
- `tsconfig.json`
- `vercel.json`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/a1-foundation
python docs/hackathon-kit/import_module.py A1 --part 1 --list
python docs/hackathon-kit/import_module.py A1 --part 1
git diff --cached --stat
git diff --cached
git commit -m "chore: import locked dependencies and environment scaffold"
python docs/hackathon-kit/import_module.py A1 --part 2
git diff --cached --stat
git commit -m "chore: import Next.js TypeScript and build configuration"
git push -u origin feat/a1-foundation
```

Tạo PR base `main`, compare `feat/a1-foundation`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## A2: Database: 19 bảng public + seed + RLS/trigger/RPC + 3bucket.

Branch `feat/a2-database`. Nghiệm thu: Chạy bootstrap một lần trên project mới, verify 19/1/73/43/7/3/19. Không replay migrations. Script build tạo SQL cùng nội dung.

### Commit 1

Message: `feat(db): import complete fresh schema seeds and verification`. Các file chính xác (12):

- `database/01_fresh_production_bootstrap.sql`
- `database/02_it_catalog_enhancement.sql`
- `database/03_verify_installation.sql`
- `database/04_foreign_key_indexes.sql`
- `database/05_production_controls.sql`
- `database/05_visual_assets_audit.sql`
- `database/06_finalization_lease.sql`
- `database/07_resumable_activity.sql`
- `database/08_expanded_it_catalog.sql`
- `database/09_verify_model_circuit.sql`
- `database/README.md`
- `scripts/build-database-bootstrap.mjs`

### Commit 2

Message: `chore(db): import versioned Supabase migration sources`. Các file chính xác (15):

- `supabase/migrations/202609280001_documind_core.sql`
- `supabase/migrations/202609280002_security_tightening.sql`
- `supabase/migrations/202609280003_quiz_answer_privacy.sql`
- `supabase/migrations/202609280004_it_focus.sql`
- `supabase/migrations/202609280005_chat_context.sql`
- `supabase/migrations/202609280006_general_fallback_prompts.sql`
- `supabase/migrations/20260929034249_results_exports_and_typed_blocks.sql`
- `supabase/migrations/20260929041557_allow_binary_report_exports.sql`
- `supabase/migrations/20260929051348_documind_visual_assets.sql`
- `supabase/migrations/20261002133648_production_controls.sql`
- `supabase/migrations/20261002140406_finalization_lease.sql`
- `supabase/migrations/20261002145204_resumable_activity.sql`
- `supabase/migrations/20261002150047_expanded_it_catalog.sql`
- `supabase/migrations/20261002170651_allow_portable_markdown_exports.sql`
- `supabase/migrations/20261002173217_gemini_model_circuit_breaker.sql`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/a2-database
python docs/hackathon-kit/import_module.py A2 --part 1 --list
python docs/hackathon-kit/import_module.py A2 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(db): import complete fresh schema seeds and verification"
python docs/hackathon-kit/import_module.py A2 --part 2
git diff --cached --stat
git commit -m "chore(db): import versioned Supabase migration sources"
git push -u origin feat/a2-database
```

Tạo PR base `main`, compare `feat/a2-database`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## A3: Auth/security: createUser email_confirm, JWT, guest hash, hồ sơ và middleware.

Branch `feat/a3-auth-security`. Nghiệm thu: Đăng ký201 không email, đúng mật khẩu vào được. Bad origin/quota bị chặn; không nhận role từ metadata. Kiểm trigger profiles và ownership.

### Commit 1

Message: `feat(auth): import account registration ownership and validation APIs`. Các file chính xác (14):

- `src/app/api/auth/register/route.ts`
- `src/app/api/cron/cleanup/route.ts`
- `src/app/api/health/route.ts`
- `src/app/api/profile/route.ts`
- `src/app/api/prompts/route.ts`
- `src/app/api/topics/route.ts`
- `src/lib/auth-validation.ts`
- `src/lib/auth.ts`
- `src/lib/db.ts`
- `src/lib/http.ts`
- `src/lib/ingest-state.ts`
- `src/lib/limits.ts`
- `src/lib/validation.ts`
- `src/middleware.ts`

### Commit 2

Message: `test(auth): import registration and access-control regression coverage`. Các file chính xác (3):

- `src/lib/auth-validation.test.ts`
- `src/lib/http.test.ts`
- `src/lib/validation.test.ts`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/a3-auth-security
python docs/hackathon-kit/import_module.py A3 --part 1 --list
python docs/hackathon-kit/import_module.py A3 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(auth): import account registration ownership and validation APIs"
python docs/hackathon-kit/import_module.py A3 --part 2
git diff --cached --stat
git commit -m "test(auth): import registration and access-control regression coverage"
git push -u origin feat/a3-auth-security
```

Tạo PR base `main`, compare `feat/a3-auth-security`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## A4: CRUD phiên, bản gốc, nhật ký vị trí, quota và CI.

Branch `feat/a4-session-observability`. Nghiệm thu: Merge part1 runtime sớm; part2 qua PR thứ hai khi đủ runtime. Kiểm upload private, URL bản gốc600s, warning đúng trang, log luôn hiện, cross-owner404 và CI xanh.

### Commit 1

Message: `feat(api): import sessions original-files quotas and activity logs`. Các file chính xác (9):

- `README.md`
- `src/app/api/analyses/[id]/activity/route.ts`
- `src/app/api/analyses/[id]/inputs/[inputId]/source/route.ts`
- `src/app/api/analyses/[id]/metrics/route.ts`
- `src/app/api/analyses/[id]/route.ts`
- `src/app/api/analyses/route.ts`
- `src/lib/activity.ts`
- `src/lib/rate-limit.ts`
- `src/lib/validation-location.ts`

### Commit 2

Message: `test(ci): import API regressions and full integration workflow`. Các file chính xác (4):

- `.github/workflows/verify.yml`
- `src/lib/rate-limit.test.ts`
- `src/lib/validation-location.test.ts`
- `vitest.config.ts`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/a4-session-observability
python docs/hackathon-kit/import_module.py A4 --part 1 --list
python docs/hackathon-kit/import_module.py A4 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(api): import sessions original-files quotas and activity logs"
python docs/hackathon-kit/import_module.py A4 --part 2
git diff --cached --stat
git commit -m "test(ci): import API regressions and full integration workflow"
git push -u origin feat/a4-session-observability
```

Tạo PR base `main`, compare `feat/a4-session-observability`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

**A4 cần hai PR:** sau commit1, push và merge PR runtime trước; giữ branch. Khi mọi runtime khác đã merge, chạy `git fetch origin` → `git merge origin/main` trên A4, rồi mới thực hiện import/commit2 và PR tests/CI. Không bật workflow ở main thiếu module rồi gọi đó là release.

## Tự kiểm và bàn giao

Đọc db/auth/http/registration và SQL trigger/quota; chạy database verification. Tự test register/login/logout/profile, ownership và upload. Người 2 review Auth, người 3 review Storage/CI.

Chạy trong snapshot đầy đủ hoặc main sau khi đầy đủ runtime/tests/config:

```bash
npm ci
npm run lint
npm test
npm run build
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

Các branch nhập sớm chưa đủ dependency không phải release; ghi đúng giới hạn test. Khi main tích hợp đủ, yêu cầu các bước này pass và thêm kiểm luồng thật trên project mới theo hướng dẫn triển khai. Case browser fixtures không chứng minh OCR/Gemini/Storage thật.

## Khi có lỗi thật

Ghi: input fixture, trang/API, hành vi mong đợi/thực tế, lỗi/status, release SHA, ảnh/log đã bỏ secret. Tạo branch `fix/a-<issue>` từ main mới nhất; sửa file thuộc bạn, thêm regression phù hợp, push/PR/review/checks rồi merge. Nếu lỗi thuộc nhóm khác, giao đúng owner; không sửa cùng `use-workspace.tsx`/`pipeline.ts`/SQL giữa nhiều người.

Trước giờ 10: trạng thái Git sạch, báo SHA release, các test đã chạy/còn hạn chế, nơi đặt env (không giá trị key), dữ liệu mẫu và demo phần mình. Không commit giả/commit rỗng hoặc backdate lịch sử.
