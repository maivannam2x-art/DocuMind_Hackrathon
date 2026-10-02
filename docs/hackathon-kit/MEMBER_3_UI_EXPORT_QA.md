# Người 3 — UI / Report / PNG / Browser QA

Bạn chịu trách nhiệm trải nghiệm và tệp báo cáo. Ưu tiên rendererruntime C4 sớm để người 2 tích hợp OCR/pipeline. Không đợi hoàn thiện UI mới dựng ảnh.

Source: `d76e57f5e2fb3c32c54276bd28ac0415dc816a43`. Làm setup repo/fetch ở `04_TEAM_10_HOURS.md` trước; thay URL repo mới thật. Danh sách dưới là toàn bộ file bạn sở hữu, không sửa nhóm khác. Mỗi nhóm có hai part/commit thật. Kiểm dependencies ở bảng tổng trước khi merge.
## C1: Khung UI/hook: page/layout/CSS/useWorkspace và resume.

Branch `feat/c1-workspace-resume`. Nghiệm thu: Input→review→processing→result. F5 bằng analysis ID phục hồi, retry không confirm lại; guest dùng cookie; không giả có worker khi đóng tab.

### Commit 1

Message: `feat(ui): import workspace state navigation and processing recovery`. Các file chính xác (10):

- `src/app/auth/callback/page.tsx`
- `src/app/design-tokens.css`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/workspace.css`
- `src/hooks/use-workspace.tsx`
- `src/lib/resumable-loop.ts`
- `src/lib/resume-state.ts`
- `src/lib/workspace-flow.ts`

### Commit 2

Message: `test(ui): import workspace resume-state regressions`. Các file chính xác (1):

- `src/lib/resume-state.test.ts`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/c1-workspace-resume
python docs/hackathon-kit/import_module.py C1 --part 1 --list
python docs/hackathon-kit/import_module.py C1 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(ui): import workspace state navigation and processing recovery"
python docs/hackathon-kit/import_module.py C1 --part 2
git diff --cached --stat
git commit -m "test(ui): import workspace resume-state regressions"
git push -u origin feat/c1-workspace-resume
```

Tạo PR base `main`, compare `feat/c1-workspace-resume`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## C2: Form/review/process: auth, combosearch, outlineaccordion, nguồn/chúthích/log.

Branch `feat/c2-input-review`. Nghiệm thu: Đăng ký không email; tìm ngành và fallback auto; cây con đúng ranh giới mục lớn. Warnings chỉ file/trang; nguồn editable; mở gốc xin URL mới; log không banner.

### Commit 1

Message: `feat(ui): import authentication search controls and source review`. Các file chính xác (5):

- `src/components/activity-panel.tsx`
- `src/components/app-icon.tsx`
- `src/components/auth-dialog.tsx`
- `src/components/extracted-document.tsx`
- `src/components/search-select.tsx`

### Commit 2

Message: `feat(ui): import input review and processing screens`. Các file chính xác (5):

- `src/components/source-files-panel.tsx`
- `src/components/source-preview.tsx`
- `src/components/workspace/input-screen.tsx`
- `src/components/workspace/processing-screen.tsx`
- `src/components/workspace/review-screen.tsx`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/c2-input-review
python docs/hackathon-kit/import_module.py C2 --part 1 --list
python docs/hackathon-kit/import_module.py C2 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(ui): import authentication search controls and source review"
python docs/hackathon-kit/import_module.py C2 --part 2
git diff --cached --stat
git commit -m "feat(ui): import input review and processing screens"
git push -u origin feat/c2-input-review
```

Tạo PR base `main`, compare `feat/c2-input-review`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## C3: Kết quả: typed blocks, detail, chat, quiz, history/tabs/metrics và font.

Branch `feat/c3-learning-results`. Nghiệm thu: Không raw JSON trừ blockjson; table/pre cuộn riêng. Math/diagram PNG, summary có tiêu đề; desktop1360/mobile390 không overflow. Giữ TTF/license.

### Commit 1

Message: `feat(ui): import structured results quizzes chat and history views`. Các file chính xác (10):

- `public/fonts/DejaVu-LICENSE.txt`
- `public/fonts/DocuMindSans.ttf`
- `src/components/chat-panel.tsx`
- `src/components/detail-view.tsx`
- `src/components/quiz-panel.tsx`
- `src/components/result-block.tsx`
- `src/components/workspace/history-screen.tsx`
- `src/components/workspace/result-tabs.tsx`
- `src/components/workspace/result-workspace.tsx`
- `src/components/workspace/usage-metrics.tsx`

### Commit 2

Message: `test(ui): import typed result rendering and report font assets`. Các file chính xác (1):

- `src/components/result-block.test.tsx`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/c3-learning-results
python docs/hackathon-kit/import_module.py C3 --part 1 --list
python docs/hackathon-kit/import_module.py C3 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(ui): import structured results quizzes chat and history views"
python docs/hackathon-kit/import_module.py C3 --part 2
git diff --cached --stat
git commit -m "test(ui): import typed result rendering and report font assets"
git push -u origin feat/c3-learning-results
```

Tạo PR base `main`, compare `feat/c3-learning-results`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## C4: PNG/export: LaTex/Mermaid→PNG→Storage, PDF/DOCX/HTML/MDZIP/JSON; E2E.

Branch `feat/c4-png-export-qa`. Nghiệm thu: Cung cấp renderer runtime sớm cho B2/B3. Cùng PNG ở5formats, Unicode đúng, signed URL mới, HTML/Markdown ZIP offline. PlantUML lỗi422 rõ. 22E2E và kiểm Supabase/Gemini thật.

### Commit 1

Message: `feat(exports): import canonical PNG rendering storage and report APIs`. Các file chính xác (10):

- `src/app/api/analyses/[id]/assets/route.ts`
- `src/app/api/analyses/[id]/exports/route.ts`
- `src/app/api/analyses/[id]/result/route.ts`
- `src/lib/formula.ts`
- `src/lib/mermaid-browser.ts`
- `src/lib/report.ts`
- `src/lib/result-content.ts`
- `src/lib/svg-raster.ts`
- `src/lib/visual-assets.ts`
- `src/lib/visual-renderer.ts`

### Commit 2

Message: `test(exports): import image portability and desktop-mobile E2E coverage`. Các file chính xác (7):

- `e2e/workspace.spec.ts`
- `playwright.config.ts`
- `src/lib/formula.test.ts`
- `src/lib/mermaid-browser.test.ts`
- `src/lib/report.test.ts`
- `src/lib/visual-assets.test.ts`
- `src/lib/visual-renderer.test.ts`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/c4-png-export-qa
python docs/hackathon-kit/import_module.py C4 --part 1 --list
python docs/hackathon-kit/import_module.py C4 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(exports): import canonical PNG rendering storage and report APIs"
python docs/hackathon-kit/import_module.py C4 --part 2
git diff --cached --stat
git commit -m "test(exports): import image portability and desktop-mobile E2E coverage"
git push -u origin feat/c4-png-export-qa
```

Tạo PR base `main`, compare `feat/c4-png-export-qa`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## Tự kiểm và bàn giao

Đọc useWorkspace/review/result-block/visual-assets/report; kiểm desktop/mobile và5formats trên máy thi. Người 1 review Storage/key, người 2 review nguồn/visual types.

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

Ghi: input fixture, trang/API, hành vi mong đợi/thực tế, lỗi/status, release SHA, ảnh/log đã bỏ secret. Tạo branch `fix/c-<issue>` từ main mới nhất; sửa file thuộc bạn, thêm regression phù hợp, push/PR/review/checks rồi merge. Nếu lỗi thuộc nhóm khác, giao đúng owner; không sửa cùng `use-workspace.tsx`/`pipeline.ts`/SQL giữa nhiều người.

Trước giờ 10: trạng thái Git sạch, báo SHA release, các test đã chạy/còn hạn chế, nơi đặt env (không giá trị key), dữ liệu mẫu và demo phần mình. Không commit giả/commit rỗng hoặc backdate lịch sử.
