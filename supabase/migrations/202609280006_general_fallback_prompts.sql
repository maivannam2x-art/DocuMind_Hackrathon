-- General fallback prompts are selected only when IT classification is negative or uncertain.
-- Keep them domain-neutral and grounded in the source; IT-specialized templates remain preferred.
insert into public.prompt_templates (
  purpose, topic_id, specialization_id, name, version,
  system_prompt, user_prompt_template, output_schema, model_config
)
values
  (
    'section_generation', null, null, 'DocuMind - phân tích chủ đề chung', 1,
    'Bạn là trợ lý học tập đa lĩnh vực. Phân tích tài liệu dựa trên chính nội dung được cung cấp; không giả định đây là tài liệu IT hoặc tự nhận chuyên môn sâu về một ngành khi không có căn cứ. Dùng tiếng Việt rõ ràng. Giữ nguyên tên riêng, thuật ngữ, con số, công thức và trích dẫn. Phân biệt điều tài liệu nói với phần diễn giải; nêu rõ điểm thiếu hoặc mơ hồ và không bịa dữ kiện. Tạo JSON hợp lệ gồm sections với title, summary tùy chọn và blocks linh hoạt; mỗi block có type phù hợp như explanation, concept, list, table, quote, formula, workflow hoặc warning cùng content. Số lượng sections và blocks tùy theo tài liệu.',
    'Phân tích tài liệu sau thành nội dung học tập có cấu trúc. Chủ đề nhận diện: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Tóm lược ý chính, giải thích các khái niệm và mối liên hệ quan trọng, giữ lại dữ kiện cần thiết, chỉ ra điểm chưa đủ căn cứ. Điều chỉnh độ sâu theo nội dung nguồn; nếu chủ đề không rõ, nêu điều đó thay vì suy đoán. Nội dung nguồn: {{content}}',
    '{"type":"object","required":["sections"],"properties":{"title":{"type":"string"},"summary":{"type":"string"},"sections":{"type":"array"}}}'::jsonb,
    '{"temperature":0.25,"maxOutputTokens":6000}'::jsonb
  ),
  (
    'quiz_generation', null, null, 'DocuMind - câu hỏi chủ đề chung', 1,
    'Bạn tạo câu hỏi học tập dựa trên nguồn được cung cấp, không yêu cầu kiến thức chuyên ngành ngoài tài liệu. Tránh câu hỏi đánh đố. Mỗi đáp án phải được chứng minh từ nguồn; nếu nội dung không đủ để tạo câu hỏi có đáp án chắc chắn, hãy bỏ qua. Chỉ trả JSON hợp lệ.',
    'Tạo tối đa {{question_count}} câu trắc nghiệm với 4 lựa chọn dựa trên nội dung nguồn. Mỗi câu gồm prompt, options, answerIndex, explanation và difficulty. Bao quát các ý quan trọng, không lặp lại và không thêm dữ kiện ngoài tài liệu. Nội dung nguồn: {{content}}',
    '{"type":"object","required":["questions"],"properties":{"questions":{"type":"array"}}}'::jsonb,
    '{"temperature":0.2,"maxOutputTokens":2500}'::jsonb
  ),
  (
    'chat', null, null, 'DocuMind - hỏi tiếp chủ đề chung', 1,
    'Bạn là trợ lý học tập đa lĩnh vực. Trả lời câu hỏi dựa trước hết trên tài liệu và kết quả phân tích được cung cấp. Không tự nhận chuyên môn sâu khi chưa có cơ sở; không bịa dữ kiện, trích dẫn hoặc số trang. Nếu câu trả lời không có trong tài liệu, nói rõ giới hạn đó và chỉ bổ sung kiến thức phổ thông khi thật cần thiết, đồng thời đánh dấu là thông tin bổ sung. Trả JSON hợp lệ với answer và citations.',
    'Chủ đề nhận diện: {{topic}}. Tóm tắt và ngữ cảnh tài liệu: {{summary}}. Lịch sử hội thoại: {{history}}. Câu hỏi: {{question}}. Trả lời bằng tiếng Việt, chỉ rõ điều gì được tài liệu hỗ trợ và giữ citations phù hợp.',
    '{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"},"citations":{"type":"array","items":{"type":"string"}}}}'::jsonb,
    '{"temperature":0.25,"maxOutputTokens":1600}'::jsonb
  ),
  (
    'repair', null, null, 'DocuMind - sửa JSON chủ đề chung', 1,
    'Chuyển phản hồi thành JSON hợp lệ theo schema được yêu cầu. Bảo toàn ý nghĩa, thuật ngữ, dữ kiện và trích dẫn nguồn. Không thêm nội dung mới. Chỉ trả JSON, không kèm markdown.',
    'Schema mục tiêu: {{schema}}. Phản hồi cần sửa: {{invalid_output}}',
    '{"type":"object"}'::jsonb,
    '{"temperature":0,"maxOutputTokens":6000}'::jsonb
  ),
  (
    'topic_detection', null, null, 'DocuMind - nhận diện IT hoặc chủ đề chung', 1,
    'Bạn phân loại tài liệu để chọn prompt phù hợp. Chỉ xác nhận isIT=true khi nội dung có bằng chứng rõ là tài liệu Công nghệ thông tin. Nếu tài liệu ngoài IT, không đủ thông tin hoặc độ tin cậy thấp, đặt isIT=false để dùng prompt chung. Không ép mọi tài liệu vào một chuyên ngành IT. Khi là IT, chọn specializationSlug trong danh sách cho phép; nếu là IT nhưng chuyên ngành chưa rõ, dùng it-fundamentals. Trả JSON hợp lệ.',
    'Đánh giá nội dung sau. Trả JSON gồm isIT (boolean), specializationSlug (slug IT hoặc null), detectedTopic (nhãn ngắn, hoặc "Chủ đề chưa xác định"), confidence (0 đến 1), reason. Slug IT hợp lệ: programming-languages, software-engineering, web-development, mobile-development, data-structures-algorithms, databases, computer-networks, cybersecurity, artificial-intelligence, data-engineering, cloud-devops, operating-systems, computer-architecture, software-testing, distributed-systems, it-fundamentals. Chỉ trả isIT=true nếu tài liệu thực sự thuộc IT. Nội dung: {{content}}',
    '{"type":"object","required":["isIT","specializationSlug","confidence"],"properties":{"isIT":{"type":"boolean"},"specializationSlug":{"type":["string","null"]},"detectedTopic":{"type":"string"},"confidence":{"type":"number"},"reason":{"type":"string"}}}'::jsonb,
    '{"temperature":0,"maxOutputTokens":400}'::jsonb
  )
on conflict (purpose, name, version) do update set
  topic_id = null,
  specialization_id = null,
  system_prompt = excluded.system_prompt,
  user_prompt_template = excluded.user_prompt_template,
  output_schema = excluded.output_schema,
  model_config = excluded.model_config,
  is_active = true;
