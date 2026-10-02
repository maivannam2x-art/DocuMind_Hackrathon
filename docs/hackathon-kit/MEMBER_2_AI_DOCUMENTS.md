# Người 2 — AI / Document Pipeline / Quiz / Chat

Bạn chịu trách nhiệm nội dung và luồng AI, không tự thay UI/schema. Thống nhất typed blocks với người 3, gửi SQL seed thay đổi cho người 1.

Source: `d76e57f5e2fb3c32c54276bd28ac0415dc816a43`. Làm setup repo/fetch ở `04_TEAM_10_HOURS.md` trước; thay URL repo mới thật. Danh sách dưới là toàn bộ file bạn sở hữu, không sửa nhóm khác. Mỗi nhóm có hai part/commit thật. Kiểm dependencies ở bảng tổng trước khi merge.
## B1: Adapter AI: loadPrompt, generateLlm, depth, model catalog, health, privacy.

Branch `feat/b1-gemini-routing`. Nghiệm thu: Kiểm catalog hỗ trợ generateContent; 5 lỗi mở cooldown300s, single probe, skip model khóa. Không log key; mock hiện nhãn mô phỏng.

### Commit 1

Message: `feat(ai): import Gemini catalog failover circuit and mock adapter`. Các file chính xác (7):

- `src/lib/analysis-depth.ts`
- `src/lib/gemini-routing.ts`
- `src/lib/llm.ts`
- `src/lib/log-privacy.ts`
- `src/lib/mock-llm.ts`
- `src/lib/model-health.ts`
- `src/lib/testing-gemini.ts`

### Commit 2

Message: `test(ai): import routing quota and model-health regressions`. Các file chính xác (4):

- `src/lib/gemini-routing.test.ts`
- `src/lib/llm.test.ts`
- `src/lib/mock-llm.test.ts`
- `src/lib/model-health.test.ts`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/b1-gemini-routing
python docs/hackathon-kit/import_module.py B1 --part 1 --list
python docs/hackathon-kit/import_module.py B1 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(ai): import Gemini catalog failover circuit and mock adapter"
python docs/hackathon-kit/import_module.py B1 --part 2
git diff --cached --stat
git commit -m "test(ai): import routing quota and model-health regressions"
git push -u origin feat/b1-gemini-routing
```

Tạo PR base `main`, compare `feat/b1-gemini-routing`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## B2: Đọc nguồn và cấu trúc: extractFileStep, prepareDocx/Pdf, outlineText/chunkText.

Branch `feat/b2-document-structure`. Nghiệm thu: Tài liệu50–100k ký tự có Roman/alpha/decimal/mục con; số đầu prose không thành heading. Gộp mục ngắn, tách mục lớn quá dài theo mục con. PDF từng trang, DOCX media đúng vị trí, CSV parse nội bộ.

### Commit 1

Message: `feat(documents): import ordered extraction hierarchy and review APIs`. Các file chính xác (8):

- `src/app/api/analyses/[id]/confirm/route.ts`
- `src/app/api/analyses/[id]/ingest/route.ts`
- `src/app/api/analyses/[id]/review/route.ts`
- `src/app/api/analyses/[id]/validate/route.ts`
- `src/lib/documents.ts`
- `src/lib/ordered-extraction.ts`
- `src/lib/source-content.ts`
- `src/lib/tables.ts`

### Commit 2

Message: `test(documents): import long-outline table and media regressions`. Các file chính xác (4):

- `src/lib/documents.test.ts`
- `src/lib/ordered-extraction.test.ts`
- `src/lib/tables.test.ts`
- `src/lib/text-flow.test.ts`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/b2-document-structure
python docs/hackathon-kit/import_module.py B2 --part 1 --list
python docs/hackathon-kit/import_module.py B2 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(documents): import ordered extraction hierarchy and review APIs"
python docs/hackathon-kit/import_module.py B2 --part 2
git diff --cached --stat
git commit -m "test(documents): import long-outline table and media regressions"
git push -u origin feat/b2-document-structure
```

Tạo PR base `main`, compare `feat/b2-document-structure`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## B3: Pipeline: runAnalysis, invokeAndLog, assertResult/repair, mergeChunkSections, overview, chat.

Branch `feat/b3-analysis-chat`. Nghiệm thu: Không run trước confirm; nhóm chunk default3/max4; complete không gọi lại. F5/hai tab có lease; JSON lỗi một repair. Overview có highlights/summary từng mục; chat bám nguồn.

### Commit 1

Message: `feat(pipeline): import resumable analysis overview and source-grounded chat`. Các file chính xác (6):

- `src/app/api/analyses/[id]/chat/route.ts`
- `src/app/api/analyses/[id]/run/route.ts`
- `src/lib/chat-context.ts`
- `src/lib/overview.ts`
- `src/lib/pipeline.ts`
- `src/lib/supabase-browser.ts`

### Commit 2

Message: `test(pipeline): import summaries contexts and checkpoint regressions`. Các file chính xác (4):

- `src/lib/overview.test.ts`
- `src/lib/pipeline.test.ts`
- `src/lib/production-controls.test.ts`
- `src/lib/registration.test.ts`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/b3-analysis-chat
python docs/hackathon-kit/import_module.py B3 --part 1 --list
python docs/hackathon-kit/import_module.py B3 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(pipeline): import resumable analysis overview and source-grounded chat"
python docs/hackathon-kit/import_module.py B3 --part 2
git diff --cached --stat
git commit -m "test(pipeline): import summaries contexts and checkpoint regressions"
git push -u origin feat/b3-analysis-chat
```

Tạo PR base `main`, compare `feat/b3-analysis-chat`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## B4: Quiz: default20, questionCount, quotas, batches20, dedupe/shuffle và attempts.

Branch `feat/b4-quiz-batches`. Nghiệm thu: Test20/100/250 câu cấu hình, số thực nhận/shortfall. GET không lộ answer; batch checkpoint/lease; không thay câu hard bằng câu dễ giả.

### Commit 1

Message: `feat(quiz): import configurable batched questions and server scoring`. Các file chính xác (5):

- `src/app/api/analyses/[id]/quiz/attempts/route.ts`
- `src/app/api/analyses/[id]/quiz/route.ts`
- `src/lib/quiz-settings.ts`
- `src/lib/quiz.ts`
- `src/lib/static-quiz.ts`

### Commit 2

Message: `test(quiz): import large-count difficulty and resume regressions`. Các file chính xác (3):

- `src/lib/quiz-batches.test.ts`
- `src/lib/quiz.test.ts`
- `src/lib/static-quiz.test.ts`

### Lệnh thực hiện

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/b4-quiz-batches
python docs/hackathon-kit/import_module.py B4 --part 1 --list
python docs/hackathon-kit/import_module.py B4 --part 1
git diff --cached --stat
git diff --cached
git commit -m "feat(quiz): import configurable batched questions and server scoring"
python docs/hackathon-kit/import_module.py B4 --part 2
git diff --cached --stat
git commit -m "test(quiz): import large-count difficulty and resume regressions"
git push -u origin feat/b4-quiz-batches
```

Tạo PR base `main`, compare `feat/b4-quiz-batches`. Mô tả nguồn import, danh sách thay đổi, kiểm tra đã chạy, dependency còn thiếu. Không ghi “build pass” khi mới kiểm snapshot nguồn. Review người khác trước merge. Sau merge, main/pull mới rồi tạo branch tiếp theo. PR có thể Draft nếu module liên quan chưa sẵn sàng.

## Tự kiểm và bàn giao

Đọc documents/ordered-extraction/pipeline/llm/model-health; ghi số call và kiểm câu quiz với nguồn. Người 1 review RPC/checkpoint, người 3 review typed result/summary.

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

Ghi: input fixture, trang/API, hành vi mong đợi/thực tế, lỗi/status, release SHA, ảnh/log đã bỏ secret. Tạo branch `fix/b-<issue>` từ main mới nhất; sửa file thuộc bạn, thêm regression phù hợp, push/PR/review/checks rồi merge. Nếu lỗi thuộc nhóm khác, giao đúng owner; không sửa cùng `use-workspace.tsx`/`pipeline.ts`/SQL giữa nhiều người.

Trước giờ 10: trạng thái Git sạch, báo SHA release, các test đã chạy/còn hạn chế, nơi đặt env (không giá trị key), dữ liệu mẫu và demo phần mình. Không commit giả/commit rỗng hoặc backdate lịch sử.
