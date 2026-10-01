# Kiểm thử cấu trúc tài liệu dài — 01/10/2026

## Lỗi đã tái hiện

- Review dựng được cây cha/con, nhưng chunking cũ chỉ xem các node gốc. Chương dài hơn 12.000 ký tự bị cắt theo dấu cách hoặc dấu chấm ngay giữa các mục con, làm mất ngữ cảnh đề mục khi gửi sang AI.
- `X.` (chương thứ 10) bị phân loại nhầm thành mục chữ cái khi tài liệu có cả La Mã và A/B; bản thử 12 chương chỉ hiện 11 chương gốc.
- Hai chương khác nhau cùng trả section tên “Tổng quan” bị gộp thành một kết quả. Người dùng có thể sửa văn bản trong review rồi nhấn xác nhận mà chưa lưu; bản AI xử lý có thể là nội dung cũ.
- Danh sách ngắn `1. TCP / 2. UDP / 3. HTTP` từng bị nhận làm chương dù không có nội dung dưới từng mục.

## Cách xử lý

`outlineText` giữ cấu trúc La Mã → chữ cái → số và nhận `1.2 Tiêu đề` bên cạnh `1.2. Tiêu đề`. Mục số chỉ thành gốc khi cặp kế tiếp có nội dung ở giữa; mục số thập phân cần cha tương ứng và bắt đầu ở `.1` hoặc có cặp cùng cấp. `chunkText` chuyển cây thành các đoạn theo phần giới thiệu và từng node con, gom các đoạn ngắn cho một request và chỉ chia theo ký tự nếu một đoạn đơn lẻ vẫn quá dài. Khoảng ký tự trong từng chunk chỉ về văn bản gốc; overlap khi cắt đoạn lớn là chủ ý.

Khi gửi AI, prompt có thêm đường dẫn đề mục của chunk. Khi hợp nhất kết quả, các section trùng tên chỉ gộp nếu thuộc cùng ngữ cảnh chunk. Nút “Xác nhận và xử lý” giờ lưu chỉnh sửa và kiểm tra lại trước khi xác nhận, nên bản AI dùng nội dung và cấu trúc mới nhất.

## Bài thử đã chạy

| Mẫu | Kỳ vọng | Kết quả |
| --- | --- | --- |
| 12 chương I–XII, mỗi chương có A/B và 1/2, hơn 300.000 ký tự | 12 root, đúng con, chunk ≤12.000 ký tự, không hụt cuối văn bản | Đạt |
| Mẫu IT khoảng 5.000 ký tự có La Mã, A/B, 1/2, `1.1.`/`1.2`, số đo `1.5 milliseconds` | Đúng cây ba cấp; số đo là nội dung; chunk ưu tiên ranh giới con | Đạt |
| Danh sách 1/2/3 ngắn không có thân mục | Không tạo ba chương giả | Đạt |
| Hai chunk cùng chương và một chunk khác chương đều có section “Tổng quan” | Gộp hai chunk cùng chương; chương còn lại tách riêng | Đạt |
| Tài liệu hơn 400.000 ký tự gồm 180 heading Markdown | Chunk ≤12.000 ký tự, thứ tự/đoạn cuối còn đủ | Đạt (test có sẵn) |

Toàn bộ 50 unit/integration test hiện tại đạt, typecheck và Next.js build đạt. Đây là kiểm thử bộ phân chia và hợp nhất trên mẫu tổng hợp, không chứng minh mô hình Gemini luôn chọn tiêu đề hay tóm tắt đúng ngữ nghĩa ở mọi tài liệu. Với nguồn mơ hồ, người dùng vẫn cần xem và sửa nội dung ở bước review. Sau deploy cần tiếp tục kiểm tra một phiên thật từ Input → Review → Processing → Result trên production.
