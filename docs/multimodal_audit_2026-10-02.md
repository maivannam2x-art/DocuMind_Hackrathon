# Trích xuất có thứ tự và kiểm tra báo cáo — 02/10/2026

## Thay đổi

- PDF production Gemini được đọc từng trang, kể cả trang có lớp chữ; mỗi trang trả các block theo thứ tự đọc. Không dùng điều kiện dưới 40 ký tự để quyết định có đọc hình hay không.
- Word DOCX được chuyển thành luồng đoạn văn/heading/list/table → ảnh/Office Math/native chart/SmartArt → đoạn văn tiếp theo. Mã Mermaid, LaTeX hoặc mô tả được chèn vào vị trí đơn vị nguồn. Ảnh PNG/JPEG nhúng không còn giới hạn 3 ảnh. Một số định dạng hình nhúng khác được chuyển sang PNG bằng Sharp.
- Gemini phân loại ảnh minh họa/trang trí không chứa kiến thức kỹ thuật thành `illustration`; hệ thống bỏ qua và báo số lượng. Screenshot UI, code, bảng và hình chứa thông tin kỹ thuật được giữ.
- Các biểu thức không chuyển được trung thực thành mã dùng mô tả rõ hạn chế. LaTeX được kiểm tra cú pháp bằng KaTeX; mã không hợp lệ không được hiển thị như công thức đã đúng.
- Mỗi ingest request thực hiện tối đa một lượt nhận diện Gemini, lưu checkpoint trong `analysis_inputs.metadata.extractionProgress` và văn bản đã đọc. Có hash tệp và kiểm tra thời điểm cập nhật để tránh ghi đè tiến độ. Retry không cần đọc lại các trang/hình đã lưu. Chưa đọc xong thì không được xác nhận phân tích.
- Các khối code/sơ đồ/công thức có hàng rào không bị cắt giữa khối khi chunking. Khối riêng lớn hơn giới hạn được báo lỗi ở Review để sửa, không gửi mã cụt sang AI. Kết quả phân tích giữ lại các mã sơ đồ/công thức nguồn nếu LLM bỏ sót.
- Review mặc định là chế độ đọc: tiêu đề, đoạn văn, bảng, LaTeX và Mermaid; editor mở riêng. Văn bản dài được hiển thị theo từng đợt để tránh dựng toàn bộ DOM cùng lúc.
- Xuất bảng thành bảng Word/HTML/Markdown và bảng có ô trong PDF. Công thức là ảnh trong Word/PDF, MathML trong HTML, LaTeX trong Markdown/JSON. Mermaid được dựng SVG trên browser, lưu private Storage và chuyển PNG cho Word/PDF. Bỏ giới hạn cũ chỉ chuẩn bị 24 sơ đồ. Tắt HTML labels để SVG không chứa foreignObject bị bộ kiểm tra Storage từ chối.
- Cả upload trực tiếp multipart và upload qua URL đều dùng bước ingest tiếp tục được, tránh xử lý mọi trang trong một request tạo phiên.

## Dữ liệu và database

Không đổi schema hoặc RLS. Checkpoint, số ảnh bỏ qua, cảnh báo và số trang được lưu trong `analysis_inputs.metadata` có sẵn. Sơ đồ kết quả dùng `generated_assets` và bucket private `analysis-assets` hiện tại. Không cần migration mới cho bản sửa này.

## Kiểm thử tự động

59 test đạt, gồm: DOCX bốn hình có thứ tự trước/sau, ảnh minh họa bị bỏ qua; Office Math tại chỗ; native Word chart có dữ liệu; PDF hai trang trong đó trang đầu có cả lớp chữ và hình; tiếp tục checkpoint không lặp văn bản; Vision trả JSON sai bị từ chối; LaTeX/Mermaid không bị chia giữa khối; khôi phục visual nguồn bị LLM bỏ sót; bảng và ảnh/công thức trong các định dạng báo cáo. Các test Vision dùng response giả lập để kiểm tra code, không phải chứng cứ độ chính xác nhận diện của mô hình thật.

## Giới hạn phải phân biệt

- Mặc định 20 MB/tệp, 8 MB/đơn vị Vision, 200 trang/PDF, 64 MB dữ liệu hình DOCX sau giải nén, 500.000 ký tự sau trích xuất. Vượt giới hạn được báo lỗi để tách/giảm tệp; không bỏ phần vượt giới hạn âm thầm.
- Chỉ hỗ trợ Word DOCX; DOC cũ cần chuyển đổi. XML chart/SmartArt/shape được đọc về mặt ngữ nghĩa; không bảo đảm tái tạo hình thức/vị trí pixel của Word. Bố cục nhiều cột, hình nổi, nguồn mờ hoặc ký hiệu hiếm vẫn cần đối chiếu ở Review.
- Ảnh minh họa do AI phân loại; không thể bảo đảm mọi hình đều được phân loại đúng. Mã sơ đồ hợp lệ cú pháp không tự chứng minh quan hệ ngữ nghĩa đúng; cần đối chiếu nhãn/cạnh với nguồn.
- PlantUML nguồn được giữ dưới dạng mã; renderer tích hợp ưu tiên Mermaid. Sơ đồ không dựng được vẫn giữ mã/mô tả và báo hạn chế khi xuất.
- Bản sửa áp dụng cho các lần trích xuất mới; kết quả cũ không tự được tái trích xuất.

## Kiểm chứng production

- Vercel deploy thành công ở commit `4e841f100adb724d6d636f3943d443bffa469fd3`; TypeScript và build production đạt. 59/59 test đạt sau các bản sửa phát hiện trong kiểm chứng.
- Phiên API `76a16e52-4239-4197-ae1f-1597684c41c2`: upload signed URL hai tệp PDF/DOCX → 6 ingest request tiếp tục checkpoint → validate → confirm → run → completed. PDF có lớp chữ vẫn đọc sơ đồ; ảnh công thức trả `T(n)=n \log(n)`; Office Math trả `x+1`. Cả hai tài liệu bỏ đúng một hình phong cảnh minh họa và giữ câu sau hình. Đã đối chiếu vị trí bằng các marker BEFORE/AFTER. Đây là hình minh họa vẽ tổng hợp, chưa phải kiểm chứng mọi loại ảnh chụp thật.
- Phiên UI `4057f8e3-1a2f-4285-a10f-8cc4a07d71d8`: nhập văn bản có Mermaid/LaTeX/bảng → Review đọc và mở editor → confirm → completed → reload → mở lại lịch sử → xem kết quả → xuất Word/PDF. Supabase ghi nhận 2 generated assets và hai exports trạng thái ready.
- Kiểm tra UI phát hiện Mermaid lỗi khi đo SVG trong container không gắn vào DOM. Đã dùng host nằm ngoài màn hình, gắn vào DOM và luôn cleanup. Trên production đã xác minh sơ đồ dựng thành ảnh sau sửa. Có test cleanup cả khi thành công/lỗi.
- PDF qua API được mở thành ảnh để kiểm tra font tiếng Việt và công thức. Phát hiện PDFKit `fit` phóng biểu thức ngắn ra quá lớn; đã chuyển sang kích thước cụ thể và cập nhật vị trí dòng sau ảnh. Word dùng tỷ lệ ảnh công thức phù hợp hơn.
- Cả 5 exports PDF/DOCX/HTML/Markdown/JSON qua API trả HTTP 200 và tải được bytes hợp lệ. Gọi export API trực tiếp trước khi có asset Mermaid vẫn giữ mã nguồn; luồng UI chuẩn bị ảnh trước export. Không coi mã nguồn fallback là sơ đồ đã dựng.
- Giới hạn kiểm chứng browser: file chooser của môi trường kiểm thử nhận tệp tổng hợp thành 0 byte; đã kiểm tra file gốc và chuyển upload thật sang API. UI đã bổ sung thông báo riêng cho tệp rỗng. Trình duyệt cloud báo download failed khi nhận PDF, dù backend đã tạo export ready; Word trả đường dẫn download nhưng file không có trong thư mục chia sẻ. Vì vậy chưa xác nhận khả năng tải UI tới thiết bị ở môi trường này; tải API đã kiểm chứng.
- Không tuyên bố tất cả tài liệu/bố cục/ảnh đều chính xác; cần kiểm tra bộ tài liệu thật của người dùng, đặc biệt trang nhiều cột, hình mờ, ảnh chụp và PlantUML. Không thực hiện tái xử lý dữ liệu cũ tự động.

Ảnh trang xuất báo cáo: `docs/screenshots/multimodal-report.jpg`.
