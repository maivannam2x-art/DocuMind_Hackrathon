# Sửa luồng ảnh sơ đồ, công thức và xuất báo cáo

## Lỗi đã xác nhận

Tại thời điểm kiểm tra có 560 bản ghi LaTeX, không có đường dẫn ảnh; 549 bản ghi Mermaid, chỉ 143 bản có đường dẫn SVG. Công thức được dựng riêng ở giao diện và ở từng bộ xuất. Mermaid chỉ được lưu khi trình duyệt mở sơ đồ. HTML dùng SVG còn Word/PDF dùng Sharp chuyển SVG thành PNG; lỗi chuyển đổi bị bỏ qua, báo cáo vẫn thành công với mã nguồn hoặc thiếu hình. Vì vậy HTML hiển thị không chứng minh được Word/PDF đúng.

## Luồng mới

1. Kết quả AI có block được đánh dấu `latex`, `mermaid`, `plantuml`; giữ mã nguồn để kiểm tra/chỉnh sửa.
2. Backend dựng Mermaid thành SVG rồi rasterize bằng resvg, với font tiếng Việt đóng gói cùng ứng dụng. Công thức dùng MathJax/resvg để tạo PNG.
3. Upload PNG nhị phân vào bucket riêng tư `analysis-assets`. `generated_assets` chỉ lưu nguồn, đường dẫn, SHA-256, MIME, kích thước; không lưu base64 hay buffer.
4. Trong xử lý phân tích mới, dựng/lưu tối đa ba ảnh đồng thời. Nhật ký đánh dấu đây là tác vụ hệ thống nội bộ, không phải gửi AI.
5. Giao diện lấy URL có chữ ký để hiển thị PNG; đường dẫn hết hạn có nút thử lại. Kết quả cũ được dựng/lưu bổ sung khi mở ảnh hoặc xuất, không cần phân tích AI lại.
6. Xuất đọc PNG từ Storage. Phải dựng đủ các block hình; không xuất thành công rồi âm thầm bỏ ảnh. Mã không dựng được trả 422 có thông báo; Storage không sẵn sàng trả 503 để thử lại.

| Định dạng | Cách đưa ảnh vào tệp |
| --- | --- |
| PDF | Nhúng PNG nhị phân, không dùng URL có thời hạn |
| Word | Nhúng PNG vào `word/media`, có quan hệ ảnh và kích thước giữ tỷ lệ |
| HTML | Nhúng PNG trong chính file để đọc offline; base64 chỉ trong file HTML, không trong database |
| Markdown | ZIP chứa `report.md` và `images/*.png`, đường dẫn tương đối; giải nén để mở |
| JSON | Giữ mã nguồn, loại block, đường dẫn Storage, kích thước, URL xem có thời hạn; không chứa byte ảnh |

Bucket giữ nguyên chính sách riêng tư, API kiểm tra chủ sở hữu và kết quả hiện tại trước khi cho lưu/xuất. Không mở public bucket và không tải tài nguyên ngoài trong SVG.

## Kiểm tra

- Kiểm thử dựng ảnh: flowchart, sequence, class, state, ER; nhãn tiếng Việt, cạnh/mũi tên, PNG có kích thước và nội dung thực.
- Kiểm thử công thức phân số/logarit; mã LaTeX lỗi được chặn.
- Kiểm tra Word ZIP có PNG giống chính ảnh đầu vào, PDF chứa đối tượng ảnh; mở PDF rasterized để kiểm tra chữ, mũi tên, công thức.
- Kiểm thử Storage: upload buffer, metadata không chứa base64; tái sử dụng PNG đã lưu; Storage lỗi không trả thành công; công thức lặp chỉ dựng một lần.
- Kiểm tra UI desktop/mobile trong CI: ảnh sơ đồ/công thức thay cho SVG/KaTeX trong kết quả; bảo toàn flow input → review → processing → result, quiz và chatbot.
- SQL kiểm tra nằm ở `database/05_visual_assets_audit.sql`; không cần thêm bảng/cột. Migration `20261002170651_allow_portable_markdown_exports.sql` bổ sung MIME `application/zip` cho bucket báo cáo, giữ nguyên quyền riêng tư. Bản thử production phát hiện thiếu MIME này và đã được sửa trước khi chốt.

## Giới hạn được báo rõ

Backend hỗ trợ trực tiếp các dạng Mermaid được bộ dựng hỗ trợ. Các dạng khác dùng bộ Mermaid trong trình duyệt rồi upload SVG an toàn để backend chuyển PNG; cần cú pháp hợp lệ. PlantUML chưa có bộ dựng ảnh tại server: báo lỗi rõ và chặn xuất thiếu ảnh, yêu cầu chuyển sang Mermaid. JSON là dữ liệu tích hợp; URL xem hết hạn sau một giờ, đường dẫn Storage và mã nguồn còn nguyên để xin URL mới. Kết quả cũ không được sửa hàng loạt trong phiên này.

Không coi các kiểm thử trên là chứng minh mọi sơ đồ bất kỳ hoặc mọi phần mềm mở file đều được hỗ trợ. Cần giữ cơ chế báo lỗi thay vì bỏ qua hình.

## Kết quả trên production

- Commit chức năng chính `f1c0457`, cập nhật font/ZIP `7aa4fb1`; cả hai đã được Vercel triển khai thành công.
- Với tài liệu IT thử dài khoảng 20.909 ký tự: PDF tải được và có 4 ảnh nội dung (8 đối tượng PDF khi tính cả alpha mask); DOCX có 4 PNG trong `word/media`; HTML có 4 PNG nhúng; ZIP Markdown có 4 ảnh; JSON có 4 block hình với đường dẫn Storage, không chứa byte ảnh. Tải lại ảnh qua signed URL trả PNG hợp lệ.
- Kiểm tra SQL: metadata `generated_assets` không chứa base64; đường dẫn PNG và kích thước đã được ghi.
- Phân tích mới chạy input → validate → confirm → run → result: hoàn tất với Mermaid và LaTeX có PNG Storage ngay khi nhận kết quả, trước khi mở ảnh ở frontend. Nhật ký có tác vụ hệ thống dựng/lưu ảnh.
- 130 unit test qua ở bản font cuối. CI trước đó chạy đủ 16 E2E desktop/mobile; kiểm tra download được nâng cấp để xác nhận tên ZIP, nội dung Markdown và thư mục PNG thay vì chỉ nhận sự kiện tải xuống.
- Trình điều khiển browser bị timeout khi đợi sự kiện download Word. Database xác nhận thao tác giao diện đã tạo tệp Word trạng thái ready; file nhị phân được tải/kiểm tra riêng qua API. Không coi việc chưa bắt được đường dẫn download trong công cụ là bằng chứng đã kiểm tra Microsoft Word trực tiếp.
