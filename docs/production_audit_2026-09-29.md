# DocuMind — kiểm tra từng màn và trạng thái triển khai (29/09/2026)

## Kết luận kiểm chứng

Bản live: https://docu-mind-hackrathon.vercel.app/. Luồng khách với tài liệu IT đã chạy thật từ nhập → kiểm tra → Gemini → kết quả → quiz → chatbot → xem trước xuất. Một tài liệu IT dài 21.683 ký tự được chia 3 chunk, UI hiện 1/3 rồi 2/3, kết thúc với 8 section và 9 câu quiz; cơ sở dữ liệu ghi nhận 3/3 chunk hoàn thành. Tài liệu ngoài IT đi qua prompt `general_fallback`, tạo 3 section. Bản sửa mới nhất tách trích xuất thành từng tệp mỗi request, kết xuất công thức LaTeX thành ảnh PNG trong PDF/DOCX và báo lỗi nếu lưu chunk thất bại.

**Chưa đạt ngưỡng cam kết production cho mọi tình huống.** Các phép thử live còn thiếu upload nhiều PDF/DOCX/ảnh, OCR thật, đăng ký tài khoản và email, tải đủ năm định dạng, mobile/accessibility và khả năng tự chạy khi đóng trình duyệt. Không suy diễn rằng 36 test local chứng minh các phần này đã qua trên Supabase/Vercel.

## Căn cứ thiết kế và flow

Ảnh ghép Product(V2) người dùng cung cấp ở `upload/download.png` cho thấy điều hướng trái, các bước Input → Review → Processing → Result theo hàng trên, các tab kết quả/quiz phía dưới. UI hiện có sidebar, chỉ báo bốn bước, các thẻ nhập liệu, Review cho sửa text, màn xử lý, các tab Overview/Summary/Detail/Conclusion/Quiz/Chat/Export và History. Nội dung mẫu tài chính trong ảnh không được mang sang prompt: taxonomy và prompt chi tiết chỉ tập trung IT; chủ đề ngoài IT/chưa rõ dùng prompt chung. Ảnh ghép không đủ độ phân giải để xác nhận pixel, font, trạng thái hover và responsive. Figma trực tiếp không truy cập được trong lượt này (MCP rate limit, browser báo Site Unavailable).

## Đánh giá theo màn

| Màn | Đã xác nhận | Còn cần kiểm chứng/sửa trước khi công bố rộng |
|---|---|---|
| Input | Dán text, chọn chủ đề tự động/IT/chung, độ sâu, prompt riêng, bật quiz, danh sách loại tệp và giới hạn 10 tệp × 20 MB | Trình duyệt thử upload bị treo ngay tại `filechooser.setFiles` của môi trường kiểm thử, trước khi app nhận tệp. Chưa có bằng chứng E2E upload nhiều tệp trên live. |
| Review | Live hiển thị số từ/chunk và text có thể sửa, chỉ chạy AI sau xác nhận | PDF scan/ảnh/DOCX chứa ảnh cần đối chiếu OCR thật với nguồn; cho người dùng sửa khi OCR sai. |
| Processing | Live 3 chunk IT hiển thị tiến độ 1/3, 2/3, hoàn thành; chunk được lưu riêng. Từng request xử lý một tệp ingest hoặc một chunk LLM và có nút tiếp tục từ History | Chưa có worker tự tiếp tục nếu đóng tab. Một phiên cũ 57 chunk hiện 52/57 và `processing`, minh họa giới hạn này; không khẳng định có thể truy cập phiên đó từ tài khoản khác. Chưa kiểm chứng 500.000 ký tự/10 tệp hoặc đồng thời nhiều tab. |
| Overview | Live có tóm tắt, metadata, đường sang các tab | Cần thử nội dung bất thường và màn hẹp. |
| Summary | FE dựng section/block, không in thẳng object JSON | Cần đánh giá chất lượng tóm tắt của tài liệu rất dài. |
| Detail | Mermaid SVG và KaTeX hiện trong live; JSON có nhãn JSON và trình bày có cấu trúc | PlantUML hiện mã nguồn, chưa dựng ảnh; ảnh do model trả về cần kiểm tra đường lưu/URL riêng. |
| Conclusion | Có tab kết luận và điều hướng | Chưa đánh giá thủ công độ chính xác với nhiều nguồn mâu thuẫn. |
| Quiz | Live 3/3 câu, chấm 100%, phản hồi nguồn; mẫu 3 chunk tạo 9 câu. Candidate được tạo từng chunk và có fallback khi Gemini quiz lỗi | Chưa kiểm chứng nhiều lần làm và dữ liệu lỗi từ model trên live. |
| Chat | Live trả lời câu hỏi TCP ACK, dẫn section nguồn | Chưa thử hội thoại dài và prompt injection trong tài liệu. |
| Export | UI 5 định dạng PDF/DOCX/Markdown/HTML/JSON, preview block; unit test tạo PDF/DOCX thật và công thức dạng ảnh; Mermaid được dựng/lưu trước PDF/Word/HTML; HTML dùng MathML | Browser chặn điều hướng URL download do policy. Supabase có một hàng PDF `ready` và object 22.036 byte, nhưng chưa xác nhận byte tải từ live. Mermaid xuất còn phụ thuộc trình duyệt chạy trước; nếu render lỗi UI báo lỗi. PlantUML không có ảnh. |
| History | Có danh sách và nút mở/tiếp tục `processing`/`failed` | Chưa thử resume sau đóng tab bằng cùng guest cookie trên live; không có worker tự chạy. |
| Auth/Profile | Live hiện form đăng ký tên, email, mật khẩu và xác nhận; code có đăng nhập/đăng xuất/profile, bearer auth | Chưa lập tài khoản thật, xác nhận email, phiên hồi phục, kiểm thử phân quyền chéo tài khoản và redirect Supabase. |

## Dữ liệu, sơ đồ, công thức và ảnh

- Tệp/txt được lưu Storage; ingest PDF/DOCX/text/ảnh → normalize → chia chunk có overlap → Review và chỉnh sửa → confirm. Ảnh PNG/JPEG, PDF scan và hình DOCX có nhánh Gemini Vision; test local dùng Gemini giả lập, nên không chứng minh OCR thật.
- Gemini dùng prompt IT theo specialization hoặc prompt chung cho chủ đề ngoài IT/không rõ; output có sections/blocks được schema xác nhận và có repair. `contentType` phân biệt `text`, `code`, `json`, `table`, `latex`, `mermaid`, `plantuml`, `image`; FE dựng theo kiểu, không giả định mọi object là JSON cần in nguyên.
- Mermaid: FE render SVG ở strict mode và lưu asset trong Supabase; PDF/DOCX nhúng PNG chuyển từ SVG đã lưu, HTML nhúng SVG. Việc tạo bản export yêu cầu client render trước; sơ đồ lỗi được báo thay vì âm thầm bỏ qua. PlantUML chưa được render thành ảnh.
- Công thức: KaTeX trên màn, HTML MathML, PDF/DOCX MathJax SVG → Sharp PNG rồi nhúng ảnh. Với LaTeX không hợp lệ, báo cáo giữ nguồn có nhãn. Test local kiểm tra PNG thực có pixel, ảnh được nhúng PDF và DOCX. JSON và code có nhãn kiểu riêng.

## Các sửa đã thực hiện và bằng chứng

| Mức | Lỗi/phát hiện | Sửa và trạng thái |
|---|---|---|
| P0 | PDF hợp lệ tạo `bad XRef entry` với Buffer trong `pdf-parse` | Chuyển parser sang plain `Uint8Array`; PDF/DOCX thực qua test. |
| P1 | Lưu Mermaid đăng nhập thiếu bearer | Gửi bearer khi POST asset; chưa E2E tài khoản live. |
| P1 | Mock cắt nguồn chỉ còn vài dòng và mất block công thức/sơ đồ | Giữ nội dung chunk, parse fenced typed block; mock được gắn nhãn mô phỏng. |
| P1 | Tài liệu dài xử lý nhiều chunk trong cùng một request dễ timeout | Lưu/tiếp tục một chunk mỗi request, quiz candidate từng chunk. Live 3 chunk đã qua; 57 chunk và mất kết nối chưa kiểm chứng hoàn tất. |
| P1 | Nhiều tệp ingest trong cùng request dễ timeout | Một tệp mỗi request, client lặp đến validate; test parser nhiều định dạng local qua, live upload còn thiếu. |
| P1 | PDF/DOCX chỉ in nguồn LaTeX | Nhúng PNG công thức từ MathJax; test PDF/DOCX qua. |
| P1 | Kết xuất sơ đồ trước khi mở tab Detail có thể thiếu ảnh | Client render/lưu Mermaid trước PDF/Word/HTML và báo lỗi nếu thất bại. |
| P1 | DB lỗi khi lưu chunk có thể bị bỏ qua và trả tiến độ sai | Kiểm tra lỗi update `analysis_chunks`, trả thông báo có thể tiếp tục; test compile qua. |
| P2 | Tiêu đề, tab chọn, nhãn chuyên môn lộ kỹ thuật | Chỉnh chữ tiếng Việt và tab tương ứng. |

## Kiểm thử và điều kiện còn mở

- `npm test`: **36/36** qua, gồm schema, auth validation, quiz, API error, tệp PDF/DOCX/Markdown/JPEG thật hoặc fixture, chuỗi dài gần giới hạn, công thức PNG và báo cáo PDF/DOCX/HTML/Markdown. `npm run typecheck` qua. `npm run lint` không lỗi, còn 2 cảnh báo `<img>`. `next build` đã qua ở lần sửa tính năng trước; commit vá lỗi kiểm tra lưu chunk mới cần CI deploy xác nhận.
- Live: IT ngắn có Mermaid/LaTeX/JSON, quiz/chat/export preview; ngoài IT prompt chung; IT 21.683 ký tự 3 chunk và 9 quiz. DB xác nhận trạng thái `completed` và 3/3 chunk. Nút PDF live tạo row/storage ready nhưng browser policy không cho xác minh tải.
- **P0 trước phát hành rộng:** E2E thật cho nhiều PDF/DOCX/ảnh và OCR; tải/đọc lại cả 5 định dạng trên live; auth email và RLS nhiều tài khoản; kiểm thử mobile và accessibility; worker bền vững hoặc đặc tả rõ rằng người dùng phải mở trang để xử lý xong tài liệu dài. **P1:** render PlantUML/ảnh đầu ra, tải cao và lỗi Gemini, chất lượng báo cáo dài, bảo đảm finalization đồng thời/idempotency. Figma từng màn ở độ phân giải gốc để tinh chỉnh pixel khi truy cập được.
- Khóa Gemini đã từng được dán trong cuộc trò chuyện. Trước phát hành công khai cần xoay khóa và lưu khóa mới chỉ ở biến môi trường Vercel; mã nguồn không chứa khóa.

## Bổ sung kiểm tra cấu trúc và Review (29/09, 20:31 ICT)

Người dùng phát hiện Review nhận nhầm mọi dòng số đầu là mục, tạo quá nhiều chunk/chi phí AI, nguồn trích xuất tràn trang và đường nối stepper đè chữ. Bản sửa này tách **cây cấu trúc** khỏi **chunk gửi Gemini**:

- Chỉ chấp nhận dãy tiêu đề có cặp liên tiếp I/II, A/B hoặc 1/2; Markdown `#` là tiêu đề rõ ràng. Chọn dãy đầu xuất hiện làm cấp chính; các kiểu còn lại có thể là cấp con. Bỏ qua fenced code. Dòng `1.5 milliseconds` không thành mục. Với nguồn thiếu dấu hiệu rõ, hiển thị một mục tài liệu và chia theo độ dài, không đoán cấu trúc.
- Mục I chứa mọi mục con đến ngay trước II; cây Review có nút mở từng cấp. Các mục ngắn liền nhau được gom thành một lô tối đa `MAX_CHUNK_CHARS` (mặc định 12.000) thay vì một lần Gemini mỗi mục. Mục lớn hơn giới hạn mới được chia có overlap. Nội dung Mermaid, LaTeX và mô tả hình từ OCR được giữ nguyên trong lô, prompt nhắc model giữ thứ bậc và typed block.
- Nguồn trích xuất nay ở thẻ thu gọn mỗi tệp, có bản xem trước ngắn; mở thẻ mới thấy ảnh gốc và ô sửa toàn văn. Sau sửa phải nhấn Lưu để tính lại cây/chunk. Đường nối stepper là flex item nằm sau nhãn, không còn phủ chữ.
- Test bổ sung cây Roman/alpha/number, chọn cặp tiêu đề xuất hiện trước, không nhận dòng số đơn lẻ, gộp các mục ngắn có công thức và Mermaid. **39/39 test qua**, typecheck/lint không lỗi; build cần CI xác nhận sau push. Đây là kiểm thử mã nguồn; chưa xác nhận qua trình duyệt trên bản deploy mới tại thời điểm cập nhật.
- Giới hạn đã biết: heuristic không thể phân biệt tuyệt đối mọi danh sách đánh số với tiêu đề thiếu định dạng; Review vẫn cho người dùng sửa text rồi tính lại. Công thức/ảnh OCR vẫn phụ thuộc Gemini Vision, PDF scan và hình DOCX có giới hạn kích thước/số hình như phần trên. PlantUML vẫn là mã nguồn, chưa có ảnh. Chưa có kiểm thử live nhiều file hoặc tài liệu 500.000 ký tự ở lần cập nhật này.

Kiểm tra tiếp API Review thấy `metadata` OCR đã lưu nhưng endpoint chi tiết không trả về, nên giao diện không thể hiển thị cảnh báo. Đã thêm `metadata` vào dữ liệu đầu vào và cảnh báo rõ khi hình nhúng DOCX vượt mức xử lý hoặc Gemini Vision không đọc được. Đây là vấn đề dữ liệu nguồn cần người dùng bổ sung; không âm thầm coi mọi ảnh là đã được phân tích.

Xác minh trình duyệt live sau deploy `4e3cd680`: dán tài liệu IT 374 ký tự có I/II, mỗi mục A/B và dòng `1.5 milliseconds`; Review cho 1 phần xử lý, cây chỉ có hai gốc I và II, I xổ đúng A/B, dòng `1.5 milliseconds` nằm trong nội dung B. Ảnh chụp Review cho thấy đường nối tiến độ nằm sau nhãn, không gạch qua “Tài liệu/Kiểm tra/Xử lý/Kết quả”. Chưa chạy Gemini cho mẫu này vì phép kiểm nhắm bước phân chia trước khi xác nhận.

## Điều tra tài liệu dài và lỗi sơ đồ (29/09, 21:03 ICT)

Ảnh người dùng gửi cho thấy Mermaid 12.0.0 chèn nhiều hình “Syntax error in text” bên ngoài vùng nội dung. Đối chiếu Supabase:

- Phiên `Đồ án IT về AI` có 80.522 ký tự, tạo lúc 13:21 UTC theo thuật toán cũ: **140 chunk**, 140 lượt `section_generation`, 140 lượt `quiz_generation`, 6 lượt `repair`, kết thúc 351 section, 187 Mermaid và 272 LaTeX. Một chunk chỉ 27–31 ký tự. Trường summary tổng thể rỗng; FE cũ nối 351 section summaries, nên Tổng quan/Tóm tắt thành đoạn rất dài và render hàng trăm block. Supabase ghi các lượt LLM là succeeded, nhưng thành công JSON không đồng nghĩa cú pháp Mermaid hợp lệ. Log unified của Supabase trong khung 13:20–14:05 UTC không cho thấy 5xx theo trường status_code; lỗi Mermaid là client rendering, không phải bằng chứng 5xx API.
- Tệp gần đây cùng cỡ 80.492 ký tự tạo lúc 13:57 UTC theo thuật toán mới còn **9 chunk**, trạng thái Review, chưa chạy AI. Không được gọi đây là bài test Gemini hoàn tất.

Sửa bổ sung: một lần Gemini tổng hợp overview từ các section summaries đã có, bắt buộc `lead` 2–3 câu và 3–7 ý có tiêu đề, lưu vào result JSON; nếu Gemini lỗi/JSON không hợp lệ thì fallback lấy tối đa sáu mục trải đều tài liệu. UI lịch sử cũ cũng dùng fallback này, không nối 351 đoạn. Summary hiển thị rõ “Các ý quan trọng” và “Tóm tắt theo đề mục”, tải 20 mục mỗi lượt, chỉ dùng câu tóm tắt thay vì đưa block chi tiết vào trang Summary. Detail chỉ tải tám mục mỗi lượt và từng mục mở mới dựng blocks. Báo cáo preview giới hạn tám mục đầu, tệp xuất vẫn dựa dữ liệu đầy đủ. Mermaid chỉ parse/render khi người dùng mở sơ đồ, invalid source hiện mã và cảnh báo tại chỗ thay vì render hàng loạt error SVG. Xuất báo cáo chỉ dựng tối đa 24 sơ đồ tại một lần, bỏ qua sơ đồ invalid và báo số bản chỉ giữ mã nguồn.

Giới hạn: phần overview của phiên cũ là fallback xác định dựa trên section summaries chứ không ghi lại kết quả Gemini của phiên cũ; muốn LLM viết lại toàn bộ cần chức năng tái phân tích có kiểm soát. Một số sơ đồ Mermaid do LLM tạo vẫn có thể sai cú pháp/ngữ nghĩa, cần kiểm tra trước khi công bố ảnh. Việc export hàng trăm section và công thức rất nặng vẫn cần thử tải thật trên Vercel.

Kiểm tra tiếp 272 block LaTeX của phiên trên chỉ có 119 công thức khác nhau. Thêm cache có giới hạn cho ảnh PNG công thức khi xuất PDF/DOCX để tránh render lặp cùng biểu thức. Tính chính xác của 119 công thức và sơ đồ vẫn phải đối chiếu nguồn; render thành ảnh không chứng minh nội dung toán học do AI suy luận là đúng. Bộ test hiện 42/42 qua, typecheck/lint không lỗi, build production local qua trước bản cache và typecheck/test sau bản cache qua.

### Xác minh live sau deploy và nguyên nhân hình báo lỗi tràn trang

Commit `77d6f74` đã deploy thành công. Một phép thử E2E mới (156 từ, chủ đề IT, cấu trúc I/II và A/B) đi từ Review một chunk đến trạng thái completed. DB có một `overview_generation` succeeded và JSON lưu `lead` cùng bốn `highlights` tên API Gateway, Dịch vụ phân tích, MVCC, Kiểm thử/giám sát. Trình duyệt live hiển thị Tổng quan thành lead và bốn dòng có tiêu đề; Tóm tắt có các ý quan trọng và hai đề mục I/II, không còn đoạn nối toàn bộ section. Trang Chi tiết ban đầu thu gọn hai mục, mỗi mục có nút mở ba block. Đây là kiểm thử nguồn nhỏ cho kết thúc pipeline, không chứng minh tài liệu 80.492 ký tự trong Review đã chạy hết Gemini.

Đọc mã Mermaid 12.0.0 trong dependency thấy `render` mặc định tạo phần tử tạm trong `document.body`; khi renderer lỗi có thể dựng sơ đồ lỗi kích thước lớn trước khi ném exception. Bản vá kế tiếp dùng `suppressErrorRendering: true` và truyền một div rời DOM cho cả Detail lẫn Export. Cùng với parse trước/lazy render, sơ đồ lỗi giữ mã nguồn và cảnh báo tại đúng block, không còn có đường chèn SVG lỗi ra toàn trang. Typecheck sau vá qua; bản vá này cần CI deploy và phép thử sơ đồ lỗi trực tiếp sau push.

Commit `f65c273` đã qua Vercel. Trên live, mở lại phiên từ History, mở mục I rồi sơ đồ do Gemini trả về sai cú pháp: UI hiển thị “Mã sơ đồ không hợp lệ hoặc quá dài để dựng ảnh”, có nút xem mã, không xuất hiện SVG lỗi phủ toàn trang. Trên tab Export, tạo PDF nhận thông báo một sơ đồ chỉ giữ mã nguồn; Supabase có hàng export `pdf` trạng thái `ready`. Trình duyệt kiểm thử chặn điều hướng download theo URL policy, do đó chưa đọc lại byte PDF từ phía người dùng. Đây là xác nhận đường lỗi trên mẫu cụ thể, không chứng minh mọi loại sơ đồ Mermaid và công thức đều chính xác.

DB cho thấy tài liệu mới 80.492 ký tự có 9 chunk (2.163–12.000 ký tự, trung bình 9.109) thay cho phiên cũ 80.522 ký tự có 140 chunk (ít nhất 18 ký tự, trung bình 577). Vì phiên mới còn `needs_review`, chưa thể đánh giá chất lượng summary thực tế của chính tài liệu dài bằng Gemini. Trích xuất PDF có text layer hiện không OCR mọi ảnh nhúng; DOCX OCR tối đa ba ảnh đầu và cảnh báo số còn lại. Vì thế không được tuyên bố mọi sơ đồ/ảnh trong PDF/DOCX đã được hiểu. Cần thử OCR tệp nguồn cụ thể và đối chiếu ảnh với bản gốc trước khi coi kết quả là đáng tin cậy.
