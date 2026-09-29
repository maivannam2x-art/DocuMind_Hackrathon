-- Make report export options match the product flow.
alter table public.exports drop constraint if exists exports_format_check;
alter table public.exports add constraint exports_format_check
  check (format in ('json', 'markdown', 'html', 'pdf', 'docx'));

-- Keep section JSON flexible while teaching the model and repair prompt to label
-- structured content explicitly for safe, typed front-end rendering.
update public.prompt_templates
set system_prompt = concat_ws(E'\n', system_prompt,
  'Kết quả phải là một object JSON có sections[]. Mỗi block bắt buộc có type và content. Nếu content là object/array có cấu trúc thì bắt buộc thêm contentType: json, table, mermaid, plantuml, latex hoặc code phù hợp; không trả object dữ liệu không có nhãn. Dùng contentType=mermaid và mã Mermaid hợp lệ khi cần sơ đồ; dùng contentType=latex cho công thức. Danh sách dùng type=list hoặc key_points và content là mảng chuỗi. Không đặt JSON thô trong block paragraph/code.'),
  user_prompt_template = concat_ws(E'\n', user_prompt_template,
  'Định dạng block: {"type":"paragraph|list|table|code|formula|diagram|json", "content":"...", "contentType":"text|table|code|latex|mermaid|plantuml|json"}. Content object/array phải có contentType rõ ràng. Chỉ gắn sơ đồ khi có thể tạo cú pháp Mermaid hợp lệ; giữ công thức trong contentType=latex.'),
  output_schema = jsonb_build_object(
    'type','object', 'required',jsonb_build_array('sections'),
    'properties',jsonb_build_object(
      'title',jsonb_build_object('type','string'),
      'summary',jsonb_build_object('type','string'),
      'sections',jsonb_build_object('type','array','items',jsonb_build_object(
        'type','object','required',jsonb_build_array('title','blocks'),
        'properties',jsonb_build_object(
          'title',jsonb_build_object('type','string'),
          'summary',jsonb_build_object('type','string'),
          'blocks',jsonb_build_object('type','array','items',jsonb_build_object(
            'type','object','required',jsonb_build_array('type','content'),
            'properties',jsonb_build_object(
              'type',jsonb_build_object('type','string'),
              'contentType',jsonb_build_object('type','string','enum',jsonb_build_array('text','json','latex','mermaid','plantuml','table','code')),
              'content',jsonb_build_object(),
              'metadata',jsonb_build_object('type','object')
            )
          ))
        )
      ))
    )
  )
where purpose in ('section_generation','repair') and is_active;

-- Constrain quiz answers to the shape the scoring API stores, while retaining
-- flexible Vietnamese question content and source-specific prompts.
update public.prompt_templates
set system_prompt = concat_ws(E'\n', system_prompt,
  'Trả object JSON {"questions":[...]}, không trả mảng ở cấp cao nhất. Mỗi câu có prompt, options (mảng 2-4 chuỗi), answerIndex (số nguyên bắt đầu từ 0), explanation, difficulty (easy|medium|hard). Chỉ dùng dữ kiện trong đoạn nguồn.'),
  user_prompt_template = concat_ws(E'\n', user_prompt_template,
  'Bắt buộc trả object có khóa questions. Mỗi phần tử phải có prompt, options, answerIndex, explanation, difficulty. Không trả câu hỏi chỉ gồm prompt.'),
  output_schema = jsonb_build_object(
    'type','object','required',jsonb_build_array('questions'),
    'properties',jsonb_build_object('questions',jsonb_build_object(
      'type','array','items',jsonb_build_object(
        'type','object','required',jsonb_build_array('prompt','options','answerIndex','explanation','difficulty'),
        'properties',jsonb_build_object(
          'prompt',jsonb_build_object('type','string'),
          'options',jsonb_build_object('type','array','items',jsonb_build_object('type','string')),
          'answerIndex',jsonb_build_object('type','integer'),
          'explanation',jsonb_build_object('type','string'),
          'difficulty',jsonb_build_object('type','string','enum',jsonb_build_array('easy','medium','hard'))
        )
      )
    ))
  )
where purpose = 'quiz_generation' and is_active;
