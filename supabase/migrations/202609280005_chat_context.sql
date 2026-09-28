update public.prompt_templates
set user_prompt_template = 'Chủ đề IT: {{topic}}. Kết quả và ngữ cảnh tài liệu: {{summary}}. Lịch sử hội thoại: {{history}}. Câu hỏi của người học: {{question}}. Trả JSON có answer và citations.',
    version = version + 1
where name = 'DocuMind IT - hỏi tiếp về tài liệu'
  and purpose = 'chat'
  and topic_id = (select id from public.topics where code = 'IT');

