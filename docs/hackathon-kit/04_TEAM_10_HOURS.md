# Ba người / 10 giờ / 12 branch / 24 commit module

## Mục tiêu và cách làm

Tái triển khai **mã nguồn hiện có** vào repository mới bằng các PR nhỏ, giữ đúng flow và kiểm thử ở Supabase mới. Không viết lại 156 file từ số 0 trong 10 giờ. Commit nhập module ghi rõ `import`; sửa lỗi sau kiểm thử ghi `fix`. Nếu chỉ cần demo nhanh, dùng phương án clone đầy đủ trong tài liệu triển khai; bảng dưới là phương án phân công nhập/tích hợp từng module bạn yêu cầu.

Mỗi file chỉ có **một chủ sở hữu**, được liệt kê trong `module-manifest.json`; không tự sửa file người khác. Tất cả 156 file không thuộc docs lịch sử của source snapshot được bao phủ. Không copy `node_modules`, `.env.local`, `.next`, token/cookie hoặc tài liệu riêng tư. Source commit cố định `d76e57f5e2fb3c32c54276bd28ac0415dc816a43`; không lấy main mới tùy thời điểm.

## Phân công

| Người | Chủ trì | Khối lượng | Quyền thay đổi chung |
| --- | --- | ---: | --- |
| 1 — A | Scaffold, database, auth, API phiên/log/quota, CI; điều phối merge | 66 file | package/lock/config, SQL, DB/Auth env, CI. |
| 2 — B | Gemini/router, OCR/parse/chunk, pipeline, overview, quiz/chat | 41 file | Prompt nội dung/AI logic; SQL seed thay đổi gửi người 1 áp dụng. |
| 3 — C | UI/F5/history, typed rendering, PNG, xuất file, browser QA/demo | 49 file | Hook, CSS, components, exports, fonts, E2E. |

Không chia đều số file vì `pipeline.ts`, `documents.ts`, `use-workspace.tsx`, `report.ts` phức tạp hơn file config. Người2 chịu AI/đọc nguồn nặng; người 3 chịu tích hợp giao diện và report.

## Chuẩn bị repository mới — người 1 làm một lần

Git Bash dùng được trên Windows; thay `NEW_REPO_URL` bằng URL thật:

```bash
git clone NEW_REPO_URL DocuMind-competition
cd DocuMind-competition
```

Repo mới hoàn toàn trống: `git switch --orphan main`, thêm README thật, `git add README.md`, `git commit -m "chore: initialize DocuMind competition repository"`, `git push -u origin main`. Repo đã có main/README: giữ lịch sử, `git switch main`, `git pull --ff-only`.

Giải nén bộ bàn giao vào `docs/hackathon-kit/` của repo mới (không lồng thành `docs/hackathon-kit/docs/hackathon-kit`). Commit bộ hướng dẫn trước:

```bash
git add docs/hackathon-kit
git commit -m "docs: add DocuMind reproduction plan and module manifest"
git push origin main
git remote add source https://github.com/maivannam2x-art/DocuMind_Hackrathon.git
git fetch source main
git cat-file -e d76e57f5e2fb3c32c54276bd28ac0415dc816a43
```

Nếu `source` đã có: kiểm URL bằng `git remote -v`; không thêm trùng. Fetch nguồn chỉ lấy Git objects; không merge toàn bộ history vào main theo phương án module. Hai người còn lại clone **repo mới** sau commit hướng dẫn, thêm remote source/fetch như trên. Dùng account riêng khi commit; cấu hình `git config user.name`/`user.email` của chính mình, không giả tác giả.

Tạo worktree nguồn đầy đủ để đọc/kiểm tra khi branch đang nhập chưa đủ module:

```bash
git worktree add --detach ../DocuMind-reference d76e57f5e2fb3c32c54276bd28ac0415dc816a43
```

`npm ci` và unit/build trong worktree này kiểm **snapshot nguồn**, không chứng minh PR từng phần đã tích hợp hoàn chỉnh. `.env.local` chỉ tạo riêng ở worktree cần chạy, không commit.

## Các branch và thứ tự phụ thuộc

| ID / branch | Người | Nội dung | PR phụ thuộc / nghiệm thu |
| --- | --- | --- | --- |
| A1 `feat/a1-foundation` | 1 | package/lock, env mẫu, Next/TS/ESLint/gitignore | Commit hướng dẫn đã có; npm ci đúng lock. |
| A2 `feat/a2-database` | 1 | SQLbootstrap/verify, seed/index, script build, migrations | A1; database mới pass19/1/73/43/7/3/19. |
| A3 `feat/a3-auth-security` | 1 | db/auth/http, validation core, register/profile/catalog/cron, middleware | A2; createUser không email, origin/quota, ownership/JWT. |
| A4 `feat/a4-session-observability` | 1 | APIcreate/history/source/log/metrics, quota/activity/location, README, CI/tests | Runtime sau A3; **part2 CI/tests merge khi tất cả runtime có đủ**. |
| B1 `feat/b1-gemini-routing` | 2 | LLM, mock, depth, model catalog/circuit/log privacy | A3/A4 quota+activity, A2 breaker; catalog/quota/5-failure tests. |
| B2 `feat/b2-document-structure` | 2 | OCRordered PDF/DOCX/table, normalize/outline/chunk, ingest/validate/review/confirm | A3+A4 runtime+B1; cần C4 runtime formula/result-content; Roman/alpha/number, images-position. |
| B3 `feat/b3-analysis-chat` | 2 | pipeline/overview/context, run/chat API | B1+B2+B4 runtime+C4 runtime; checkpoint, overview, repair, grounded chat. |
| B4 `feat/b4-quiz-batches` | 2 | quiz settings/candidates/shuffle/default20/batches/attempt APIs | B1+B2+B3 runtime; quiz100/shortfall, không lộ đáp án. |
| C1 `feat/c1-workspace-resume` | 3 | page/layout/CSS/authcallback, hook/flow/resume | A3+A4 runtime; đọc hợp đồng API, F5/ownership không bỏ confirm. |
| C2 `feat/c2-input-review` | 3 | input/review/process, searchselect/auth/log/original/sourcepreview | B2 runtime+C1runtime; review/sửa/cảnh báo file-trang, original/log luôn thấy. |
| C3 `feat/c3-learning-results` | 3 | result/detail/quiz/chat/history/metrics, fonts | C1+C2+C4 runtime+B3/B4 runtime; typed rendering/layout. |
| C4 `feat/c4-png-export-qa` | 3 | report/PNG/formula/assets/result/export API, browser fixtures | Runtime triển khai **sớm** cùng B2 để cung cấp dependency; part2 E2E vào cuối. |

B3/B4 có import lẫn nhau; không coi là hai sản phẩm độc lập. Chúng có thể làm song song vì sở hữu file khác nhau, nhưng kiểm build tích hợp phải có **cả hai**. Tương tự B2 cần renderer/source types từ C4. Không giả rằng branch nhập một nửa có thể tự build xanh.

## Một branch = hai commit; thường một PR

Mỗi file của mỗi nhóm chia vào part1/part2 rõ trong manifest. Helper dùng literal pathspec để đường dẫn Next.js `[id]` không bị hiểu thành wildcard, dừng khi đè lên file có sửa chưa commit. Chỉ nhập/stage, không commit/push hộ bạn.

Ví dụ A1; các người thay nhóm, branch, message theo file cá nhân:

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

Trên Windows dùng `py -3` thay `python` nếu cần. Helper không đổi env/key. Sau mỗi bước import, `git diff --cached --name-only` phải chỉ có file part đó.

Trên GitHub: **Compare & pull request** → base `main` → compare branch tương ứng → mô tả module nhập, source SHA, kiểm thử thực tế, dependency còn chờ → nhờ người kia review → merge. Không cần gh CLI. Nếu đã có gh authenticated: `gh pr create --base main --head feat/a1-foundation --title "Import foundation" --body-file pr-body.md`; file body ghi nội dung thật, không ghi pass nếu chưa chạy.

Chỉ sau merge mới bắt đầu branch tiếp theo từ main mới nhất. Khi đang song song và main đã thay đổi:

```bash
git fetch origin
git merge origin/main
# Nếu conflict: người sở hữu file xử lý, review git diff, chạy lại checks.
git push
```

Không rebase/force push sau người khác review để tránh mất lịch sử; không dùng `git reset --hard` để bỏ công việc của đồng đội. PR chưa đủ dependency để Draft, nêu rõ chờ module nào.

Riêng A4: PR thứ nhất chứa part1 runtime, merge sớm để B1/B2 dùng quota/activity. Giữ branch; trước khi nhập part2, merge origin/main vào branch rồi tạo PR thứ hai chứa tests/CI sau khi các runtime khác đủ. Tổng tối thiểu 13 PR cho 12 branch. C4 có thể nhập cả tests sớm nhưng chỉ chạy nghiệm thu khi các dependency đã có.

**Giai đoạn nhập sớm:** main còn thiếu module, chưa nối automatic deploy production; build tổng có thể chưa chạy được. Merge phần runtime có dependency chưa nhập phải ghi rõ “reconstruction checkpoint”, không coi là release. Có thể giữ các PR Draft rồi hợp nhất lần lượt khi toàn bộ phần runtime sẵn sàng. A4 part2 bật CI sau checkpoint đầy đủ. Nếu repository đã bắt buộc CI xanh ngay từ đầu, chọn baseline đầy đủ trước và dùng branch cho thay đổi/config/test thật thay vì nhập từng phần.

## Lịch 10 giờ

| Thời gian | Người1 | Người2 | Người3 | Checkpoint |
| --- | --- | --- | --- | --- |
| 00:00–00:30 | Init repo, quyền team, hướng dẫn, A1 | Fetch nguồn, đọc contract/pipeline | Fetch nguồn, đọc UI/export | Cả ba checkout đúng SHA; Node 22. |
| 00:30–01:30 | A2 SQL và project mới | B1 đọc/tích hợp router/mock | C4 **runtime** PNG/export + fonts cần thiết từ C3 | SQL đủ seed; key mới lưu riêng. |
| 01:30–03:00 | A3 Auth/security, A4 runtime quota/log/create | B1 runtime, B2 ordered extraction + chunk | C1 workspace/resume, C2 input/review | Runtime core+LLM+visual dependency đã có. |
| 03:00–05:00 | Review/merge module, test endpoint/db | B3 pipeline/chat, B4 quiz runtime | C3 results/history/fonts, hoàn thiện C4 runtime | Đủ 156 file sau nhập tests/config cuối; main buildable. |
| 05:00–06:30 | A3/A4 tests+CI, env/newproject, rà quyền | B1/B2/B3/B4 regression tests, nguồn dài | C4 E2E và UI mobile/desktop | npm ci/lint/unit/build/E2E toàn hệ thống. |
| 06:30–08:00 | Test auth/ownership/upload và fix | Gemini thật, PDF/DOCX/bảng/math/quiz100 và fix | 5export/font/PNG/F5/history/layout và fix | Mỗi lỗi có ID, owner, PR fix. |
| 08:00–09:00 | Review fix, clean install máy thi | Kiểm sốcalls/chunk/models/shortfall | Chuẩn bị tài liệu mẫu và demo | Chạy lại ca lỗi và regression liên quan. |
| 09:00–10:00 | Freeze main/release commit, build/local/domain | Thuyết minh AI/structure, dự phòng quota | Demo5–7 phút, lưu output offline | Không còn lỗi chặn demo; ghi SHA release thật. |

Mỗi người dành khoảng 30–45 phút cuối cho chéo review và trình bày. Tránh nâng dependency/đổi kiến trúc trong 10h nếu chưa có lỗi thực tế cần sửa.

## PR sửa lỗi sau import

Dùng branch mới: `fix/a-auth-registration`, `fix/b-long-outline`, `fix/b-quiz-resume`, `fix/c-export-images`, `fix/c-responsive-overflow`. Chỉ tạo khi có lỗi thật; không tạo empty/fake commits để đủ số lượng. Một commit sửa hành vi + một commit regression test khi test cần thiết. Người1 merge sau review của ít nhất một người và checks pass.

## Cổng release cuối

- Root có đủ file trong manifest, không trùng ownership, giữ package-lock/fonts/license/migrations. `python ... --list` kiểm path; so với snapshot để biết thay đổi có chủ đích.
- SQL verify đủ số liệu; đăng ký mới201→password login session ngay; hồ sơ đúng, cross-owner bị chặn.
- Chuỗi nhập→ingest→validate→review→confirm→run→result→quiz/chat/export chạy **thật** trên project mới. AI trước confirm chỉ để OCR; không chạy phân tích trước confirm.
- Text dài 50–100k ký tự có Roman/alpha/numbers, mục con/ngắn; F5/resume hai bước; quiz100 kiểm shortfall.
- PDF/DOCX có ảnh/bảng/math/sơ đồ; 5export tiếng Việt+PNG; negative case size/content/modelquota và overflowmobile.
- Lint/unit/typecheck/build/E2E pass ở main đầy đủ. E2E fixtures không thay thế kiểm tra Gemini/Storage thật.
- Giữ `.env.local` ngoài Git, kiểm không có key/token trong diff; `git status` sạch; ghi repo URL, release SHA, project ref và tên env (không ghi giá trị secret) trong biên bản.
- Bản build trên máy thi đã start và test; nếu dùng Vercel, deployment phải ứng với release SHA. Kết quả mock/AI phải được trình bày đúng.
