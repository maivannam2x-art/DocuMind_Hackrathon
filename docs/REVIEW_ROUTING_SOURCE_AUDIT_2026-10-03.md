# DocuMind — kiểm tra đầu vào, model fallback, nhật ký và bản gốc

## Các thay đổi

| Vị trí | Vấn đề | Sửa |
|---|---|---|
| Bước kiểm tra | Cảnh báo chưa rõ tệp/trang; lỗi một tệp đánh dấu cả phiên | Issue có inputId/inputName/page/unit/location; trạng thái từng input theo issue riêng. Cảnh báo có nút mở đúng tài liệu. |
| Đọc PDF song song | Lỗi một trang chưa giữ vị trí thực tế | Theo chỉ số kết quả thất bại trong batch để lưu số trang thật. Không suy đoán số trang Word từ số khối. |
| Gemini | Mỗi tác vụ mới lại gọi model lỗi | RPC atomic và bảng health dùng chung: 5 lỗi liên tiếp → cooldown 300 giây → một probe → phục hồi hoặc cooldown lại. Completion cũ không mở khóa. |
| Model priority | Thứ tự mặc định khác yêu cầu | 3.5 Flash Lite, 3.5 Flash, 3.8 Flash, 2.0 Flash, 2.0 Flash Lite, 2.5 Flash, 2.5 Flash Lite, 2.5 Pro, 3 Flash, 3.1 Pro, 3.1 Flash Lite, 3.6 Flash, 3.7 Flash. Catalog live loại model không tồn tại/không hỗ trợ generateContent. Preview alias chỉ dùng khi catalog có. Cấu hình operator GEMINI_MODEL/FALLBACK vẫn được tôn trọng. |
| Markdown/chi tiết/nguồn | Chuỗi dài, inline code, bảng hoặc pre gây tràn | Flex/grid con co được, prose/inline code tự xuống dòng; code block/bảng cuộn trong khung. |
| Nhật ký | Details tự mở/đóng theo running gây nhảy UI | Section luôn hiển thị, kể cả khi chưa có tác vụ; cập nhật AI/hệ thống, thất bại và model bị bỏ qua. |
| Lịch sử và nguồn | File gốc đã lưu nhưng chưa có khu vực rõ ràng | Danh sách nguồn trên review/processing/result, mở lại qua API owner-check và URL mới mỗi lần. File upload giữ nguyên byte trong bucket private. Văn bản dán mới lưu bản TXT nguyên gốc. |

## Quyền và database

Migration `supabase/migrations/20261002173217_gemini_model_circuit_breaker.sql` đã áp dụng vào project đang chạy; bootstrap cài mới và database README cập nhật. `gemini_model_health`: RLS bật, không có quyền anon/authenticated; RPC security invoker chỉ service role. Khóa API không được lưu, chỉ hash SHA-256. Storage nguồn vẫn private `analysis-inputs`, URL 10 phút, không chuyển bucket public. API cấp URL kiểm tra chủ sở hữu phân tích và input cùng analysis.

`database/09_verify_model_circuit.sql` kiểm thử transaction và rollback toàn bộ dữ liệu giả. Đã chạy thật: ngưỡng lỗi, cooldown, late completion, một probe, phục hồi. Hai RPC claim đồng thời trên một model QA chỉ cho một worker gọi; đã dọn dòng QA. Advisor không phát hiện quyền truy cập công khai mới; INFO không có policy là chủ đích cho bảng backend-only. Cảnh báo Leaked Password Protection đang tắt có sẵn trước thay đổi: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Kiểm thử

- Unit kiểm tra địa chỉ cảnh báo và cô lập trạng thái tệp, health RPC không truyền khóa, skip model đang khóa, fallback đúng thứ tự, lỗi trang PDF trong batch song song.
- E2E desktop/mobile: bước kiểm tra hiện số trang và mở đúng tài liệu; nhật ký luôn hiện đến kết quả; văn bản Markdown/inline code/pre/bảng rất dài không tràn viewport; mở lịch sử và lấy URL mới để mở bản gốc. Các test luồng quiz/chat/ảnh/xuất ZIP/F5 cũ giữ nguyên.
- CI của commit `b9cd25ca72da2e5d2c70daaa0f7b972374ba3839`: lint, 139 unit tests, build và **22 E2E desktop/mobile PASS**, run `37043417494` / job `110958829545`. Test chuỗi Markdown/code/bảng dài ban đầu bắt được lỗi intrinsic grid width; đã sửa minmax(0,1fr) và min-width:0 ở đúng khung Chi tiết, test giữ nguyên assertion và đã qua.
- Vercel commit này báo success, production alias đang phục vụ bản mới.
- Live API với 3 file upload trực tiếp: file thiếu nội dung → error, file ngắn → needs_review, file dài đầy đủ → valid. Ba bản gốc tải xuống HTTP 200 và khớp nguyên byte. API nguồn không có phiên → 401; phiên khách khác → 404. Văn bản dán mới cũng tải được bản TXT nguyên gốc.
- Browser thật: tạo tài liệu IT, hiện cảnh báo tên file/cấp toàn tài liệu, nhật ký luôn hiện kể cả chưa có tác vụ; F5 phục hồi lại review đúng phiên. Xác nhận → xử lý Gemini thật → completed, 2 đề mục. Một số model trả quota 429 hoặc không khả dụng 404; fallback thành công bằng gemini-3.1-flash-lite cho nhận diện chủ đề, phân tích section và tổng quan.

## Giới hạn được thể hiện rõ

Word không có phân trang layout tin cậy từ XML, nên báo khối nguồn thay vì bịa số trang. Cảnh báo cấp toàn tài liệu/phiên được ghi đúng cấp đó. Phiên cũ không lưu bản gốc không được tái tạo giả từ văn bản đã sửa: UI báo chưa có bản gốc. Cooldown không hủy request đã gửi trước lúc model bị khóa; completion của chúng không mở khóa. Retry vẫn theo budget của mỗi request, và LLM thật có thể đang hết quota; hệ thống giữ checkpoint để tiếp tục.

## Xác nhận cooldown trên Gemini production thật

Sau pipeline, hai lượt hỏi đáp tiếp theo khiến 8 model đang lỗi đạt đúng 5 lượt gọi thất bại. Database mở cooldown 300 giây. Lượt hỏi đáp thứ ba ghi 8 event hệ thống “Bỏ qua model tạm ngưng”, không gọi lại các model đó; gemini-3.1-flash-lite trả lời thành công. Kết quả của analysis vẫn completed. Tổng mỗi model lỗi là 5 event AI và 1 event skip hệ thống; model thành công có 6 event AI. Screenshot: `docs/screenshots/review-routing-production-2026-10-03.jpg`.

Nguồn bằng chứng API, quyền, trạng thái tệp, CI và test circuit nằm trong `docs/qa/review-routing-source-verification-2026-10-03.json`. Bản production đã deploy: https://docu-mind-hackrathon.vercel.app/. Không có API 500 trong các request kiểm chứng; 401/404 ở bài kiểm tra quyền là kết quả mong đợi. Đây là xác minh theo các test case nêu trên, không phải cam kết rằng mọi tài liệu hoặc mọi trạng thái quota bên ngoài đều luôn thành công.
