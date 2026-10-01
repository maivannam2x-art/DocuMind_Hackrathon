# Kiểm thử cấu trúc tài liệu dài — 01/10/2026

## Lỗi đã tái hiện

- Review dựng được cây cha/con, nhưng chunking cũ chỉ xem các node gốc. Chương dài hơn 12.000 ký tự bị cắt theo dấu cách hoặc dấu chấm ngay giữa các mục con, làm mất ngữ cảnh đề mục khi gửi sang AI.
- `X.` (chương thứ 10) bị phân loại nhầm thành mục chữ cái khi tài liệu có cả La Mã và A/B; bản thử 12 chương chỉ hiện 11 chương gốc.
- Hai chương khác nhau cùng trả section tên “Tổng quan” bị gộp thành một kết quả. Người dùng có thể sửa văn bản trong review rồi nhấn xác nhận mà chưa lưu; bản AI xử lý có thể là nội dung cũ.
- Danh sách ngắn `1. TCP / 2. UDP / 3. HTTP` từng bị nhận làm chương dù không có nội dung dưới từng mục.

## Cách xử lý

`outlineText` giữ cấu trúc La Mã → chữ cái → số và nhận `1.2 Tiêu đề` bên cạnh `1.2. Tiêu đề`. Mục số chỉ thành gốc khi cặp kế tiếp có nội dung ở giữa; mục số thập phân cần cha tương ứng và bắt đầu ở `.1` hoặc có cặp cùng cấp. `chunkText` chuyển cây thành các đoạn theo phần giới thiệu và từng node con, gom các đoạn ngắn cho một request và chỉ chia theo ký tự nếu một đoạn đơn lẻ vẫn quá dài. Khoảng ký tự trong từng chunk chỉ về văn bản gốc; overlap khi cắt đoạn lớn là chủ ý.

Nếu một chương gốc đã có ít nhất `MIN_MAJOR_SECTION_CHARS` (mặc định 2.500 ký tự), chunk được chốt trước chương kế tiếp; chương ngắn vẫn có thể gom chung. Mẫu production đầu tiên đã cho thấy lý do cần quy tắc này: một chunk 11.313 ký tự trộn chương I với mục A của chương II, mặc dù chương I đã đủ dài để xử lý độc lập.

Khi gửi AI, prompt có thêm đường dẫn đề mục của chunk. Khi hợp nhất kết quả, các section trùng tên chỉ gộp nếu thuộc cùng ngữ cảnh chunk. Nút “Xác nhận và xử lý” giờ lưu chỉnh sửa và kiểm tra lại trước khi xác nhận, nên bản AI dùng nội dung và cấu trúc mới nhất.

## Bài thử đã chạy

| Mẫu | Kỳ vọng | Kết quả |
| --- | --- | --- |
| 12 chương I–XII, mỗi chương có A/B và 1/2, hơn 300.000 ký tự | 12 root, đúng con, chunk ≤12.000 ký tự, không hụt cuối văn bản | Đạt |
| Mẫu IT khoảng 5.000 ký tự có La Mã, A/B, 1/2, `1.1.`/`1.2`, số đo `1.5 milliseconds` | Đúng cây ba cấp; số đo là nội dung; chunk ưu tiên ranh giới con | Đạt |
| Danh sách 1/2/3 ngắn không có thân mục | Không tạo ba chương giả | Đạt |
| Hai chunk cùng chương và một chunk khác chương đều có section “Tổng quan” | Gộp hai chunk cùng chương; chương còn lại tách riêng | Đạt |
| Tài liệu hơn 400.000 ký tự gồm 180 heading Markdown | Chunk ≤12.000 ký tự, thứ tự/đoạn cuối còn đủ | Đạt (test có sẵn) |
| Hai chương La Mã đủ dài, mỗi chương A/B | Mỗi chương thành một chunk riêng; không đưa II vào request của I | Đạt |

## Kiểm thử production

Trên bản `3e7856d`, đã dán tài liệu IT 15.028 ký tự, Review cho thấy hai root `I. Kiến trúc hệ thống` (A/B, dưới B có 1/2) và `II. Cơ sở dữ liệu` (A/B). Số đo `1.5 milliseconds` không thành heading. Chỉnh sửa văn bản rồi nhấn thẳng xác nhận: database có `edited_marker_saved=true`, trạng thái completed, 2/2 chunk hoàn thành. Kết quả hiển thị 3 section; phát hiện chunk đầu trộn ranh giới chương như nêu ở trên, nên bổ sung ngưỡng 2.500 ký tự và thêm test. Bản ngưỡng mới cần kiểm chứng trên một phiên production tiếp theo sau deploy.

Overview của phiên thử đã suy diễn cụm “01 đến 10” từ nhãn phiên kiểm thử `... 01-10`. Prompt tổng hợp đã được sửa để coi tên phiên là nhãn, không phải dữ kiện nguồn.

Trên bản `e3e7493` đã deploy thành công, chạy tiếp phiên production `9ce6a4ae-7672-420b-8e6e-33908fb96839` bằng cùng tài liệu IT 15.028 ký tự qua Input → Review → Processing → Result. Review hiển thị hai chương gốc, mỗi chương có A/B. Database ghi hai chunk tách riêng: `I. Kiến trúc hệ thống` (8.142 ký tự) và `II. Cơ sở dữ liệu` (6.885 ký tự), không trộn ranh giới chương. Gemini (`gemini-3.5-flash-lite`) hoàn thành, không có error; `analysis_results` có bốn section `I/A`, `I/B`, `II/A`, `II/B`. Giao diện tổng quan hiển thị bốn ý có tiêu đề API gateway, Backend service, Chỉ mục B-tree, Giao dịch; tóm tắt không dùng nhãn phiên làm dữ kiện. Trang phân tích chi tiết hiện bốn mục có thể mở, trong đó mục Backend service hiển thị concept và danh sách 1/2 từ tài liệu.

Toàn bộ 51 unit/integration test đạt, typecheck và Next.js build đạt. Tài liệu hơn 300.000 và 400.000 ký tự được kiểm thử ở bộ tự động; lần production trực tiếp dùng mẫu tổng hợp 15.028 ký tự. Các kết quả này không chứng minh Gemini luôn chọn tiêu đề hoặc tóm tắt đúng ngữ nghĩa với mọi tài liệu. Với nguồn mơ hồ, người dùng vẫn cần xem và sửa nội dung ở bước review.
