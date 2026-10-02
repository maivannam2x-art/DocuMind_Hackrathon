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
- Kết quả CI/deployment và live verification sẽ cập nhật sau khi bản sửa triển khai.

## Giới hạn được thể hiện rõ

Word không có phân trang layout tin cậy từ XML, nên báo khối nguồn thay vì bịa số trang. Cảnh báo cấp toàn tài liệu/phiên được ghi đúng cấp đó. Phiên cũ không lưu bản gốc không được tái tạo giả từ văn bản đã sửa: UI báo chưa có bản gốc. Cooldown không hủy request đã gửi trước lúc model bị khóa; completion của chúng không mở khóa. Retry vẫn theo budget của mỗi request, và LLM thật có thể đang hết quota; hệ thống giữ checkpoint để tiếp tục.
