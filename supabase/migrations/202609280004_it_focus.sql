-- Keep this release scoped to IT. Other subject domains can be seeded in a later release.
delete from public.topics where code <> 'IT';
update public.topics
set name = 'Công nghệ thông tin',
    description = 'Tài liệu kỹ thuật về phần mềm, lập trình, dữ liệu, mạng, an ninh và hạ tầng.',
    is_active = true,
    sort_order = 1
where code = 'IT';

delete from public.topic_specializations
where topic_id = (select id from public.topics where code = 'IT');

insert into public.topic_specializations (topic_id, name, slug, description, sort_order)
select t.id, v.name, v.slug, v.description, v.sort_order
from public.topics t
cross join (values
  ('Ngôn ngữ lập trình','programming-languages','Python, JavaScript/TypeScript, Java, C/C++, Go và Rust.',10),
  ('Kỹ nghệ phần mềm','software-engineering','Yêu cầu, thiết kế, kiến trúc, mẫu thiết kế và SOLID.',20),
  ('Phát triển web','web-development','Frontend, backend, HTTP, API và ứng dụng web.',30),
  ('Phát triển ứng dụng di động','mobile-development','Android, iOS và kiến trúc ứng dụng di động.',40),
  ('Cấu trúc dữ liệu và giải thuật','data-structures-algorithms','Cấu trúc dữ liệu, độ phức tạp và chiến lược giải thuật.',50),
  ('Cơ sở dữ liệu','databases','Mô hình dữ liệu, SQL, NoSQL, chỉ mục và giao dịch.',60),
  ('Mạng máy tính','computer-networks','TCP/IP, định tuyến, HTTP, DNS và giao thức mạng.',70),
  ('An ninh mạng','cybersecurity','Secure coding, bảo mật ứng dụng, mật mã và kiểm soát truy cập.',80),
  ('Trí tuệ nhân tạo và học máy','artificial-intelligence','Machine learning, deep learning, LLM và đánh giá mô hình.',90),
  ('Kỹ thuật dữ liệu','data-engineering','ETL/ELT, pipeline, kho dữ liệu và xử lý dữ liệu lớn.',100),
  ('Cloud và DevOps','cloud-devops','Cloud, container, CI/CD, Kubernetes và quan sát hệ thống.',110),
  ('Hệ điều hành','operating-systems','Tiến trình, luồng, bộ nhớ, đồng bộ và hệ thống tệp.',120),
  ('Kiến trúc máy tính','computer-architecture','Logic số, CPU, bộ nhớ, tập lệnh và kiến trúc máy.',130),
  ('Kiểm thử phần mềm','software-testing','Unit, integration, end-to-end, hiệu năng và QA.',140),
  ('Hệ thống phân tán','distributed-systems','Đồng thuận, nhất quán, chịu lỗi và khả năng mở rộng.',150),
  ('Nền tảng công nghệ thông tin','it-fundamentals','Thuật ngữ và kiến thức nền tảng của ngành công nghệ thông tin.',160)
) as v(name,slug,description,sort_order)
where t.code = 'IT'
on conflict (topic_id, slug) do update
set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, is_active = true;

insert into public.topic_specializations (topic_id, parent_id, name, slug, description, sort_order)
select t.id, parent.id, v.name, v.slug, v.description, v.sort_order
from public.topics t
join (values
  ('programming-languages','Python','programming-python','Python syntax, data types, runtime and common libraries.',10),
  ('programming-languages','JavaScript và TypeScript','programming-javascript-typescript','JavaScript, TypeScript, browser and Node.js.',20),
  ('programming-languages','Java','programming-java','Java language, JVM and ecosystem.',30),
  ('programming-languages','C và C++','programming-c-cpp','Memory, pointers, compilation and C/C++.',40),
  ('programming-languages','Go và Rust','programming-go-rust','Go concurrency and Rust ownership and safety.',50),
  ('databases','SQL và cơ sở dữ liệu quan hệ','database-relational-sql','SQL, relational modeling, joins and constraints.',10),
  ('databases','NoSQL','database-nosql','Document, key-value, graph and wide-column data stores.',20),
  ('databases','Mô hình dữ liệu và chỉ mục','database-modeling-indexing','Normalization, schema design, indexes and query plans.',30),
  ('databases','Giao dịch và đồng thời','database-transactions','ACID, isolation levels, locks and concurrency.',40),
  ('web-development','Frontend','web-frontend','HTML, CSS, JavaScript and UI application architecture.',10),
  ('web-development','Backend và API','web-backend-api','Server architecture, REST/GraphQL and API security.',20),
  ('computer-networks','TCP/IP và định tuyến','network-tcp-ip','Addressing, routing, transport and network layers.',10),
  ('computer-networks','HTTP, DNS và web protocol','network-http-dns','HTTP, DNS, TLS and browser-server communication.',20),
  ('cybersecurity','Bảo mật ứng dụng','security-application','Threat modeling, OWASP and secure software design.',10),
  ('cybersecurity','Mật mã học ứng dụng','security-cryptography','Encryption, hashing, signatures and key management.',20),
  ('cybersecurity','Định danh và phân quyền','security-identity-access','Authentication, authorization and identity systems.',30),
  ('artificial-intelligence','Machine learning','ai-machine-learning','Features, training, validation and evaluation.',10),
  ('artificial-intelligence','Deep learning','ai-deep-learning','Neural networks, optimization and deep learning models.',20),
  ('artificial-intelligence','Mô hình ngôn ngữ lớn','ai-llm','Prompting, retrieval, agents and LLM evaluation.',30),
  ('cloud-devops','Container và Kubernetes','devops-containers-kubernetes','Images, containers, orchestration and deployment.',10),
  ('cloud-devops','CI/CD và tự động hóa','devops-ci-cd','Build, test, release and deployment automation.',20),
  ('software-testing','Unit và integration test','testing-unit-integration','Test design, doubles, boundaries and integration coverage.',10),
  ('software-testing','Kiểm thử hiệu năng','testing-performance','Load, stress, latency and capacity testing.',20)
) as v(parent_slug,name,slug,description,sort_order) on true
join public.topic_specializations parent on parent.topic_id = t.id and parent.slug = v.parent_slug
where t.code = 'IT'
on conflict (topic_id, slug) do update
set parent_id = excluded.parent_id, name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, is_active = true;

update public.prompt_templates set is_active = false where topic_id is null;

insert into public.prompt_templates (
  purpose, topic_id, specialization_id, name, version, system_prompt, user_prompt_template, output_schema, model_config
)
select v.purpose, t.id, s.id, v.name, 1, v.system_prompt, v.user_prompt_template, v.output_schema::jsonb, v.model_config::jsonb
from public.topics t
cross join (values
  (
    'section_generation',
    null::text,
    'DocuMind IT - phân tích tài liệu kỹ thuật',
    'Bạn là trợ lý chuyên phân tích tài liệu Công nghệ thông tin. Bám sát tài liệu nguồn, giữ chính xác tên API, thuật ngữ, cú pháp, phiên bản, lệnh shell, đoạn code, SQL, cấu hình và số liệu. Không tự bịa hành vi của framework hoặc thư viện. Nếu tài liệu không nêu phiên bản hay điều kiện áp dụng, nói rõ. Trả JSON hợp lệ bằng tiếng Việt. Tạo sections có title, summary tùy chọn, blocks linh hoạt với type phù hợp: concept, explanation, code, command, sql, list, table, workflow, warning, formula hoặc diagram. Mỗi block có content.',
    'Phân tích phần tài liệu IT này để người học hiểu và áp dụng được. Chủ đề IT: {{topic}}. Yêu cầu bổ sung: {{custom_prompt}}. Làm rõ khái niệm, thuật ngữ, luồng xử lý, giả định, ưu/nhược điểm và liên hệ giữa các phần. Với code/lệnh/SQL, giải thích từng thành phần và không sửa nội dung nguồn nếu chưa nêu rõ. Nội dung nguồn: {{content}}',
    '{"type":"object","required":["sections"],"properties":{"title":{"type":"string"},"summary":{"type":"string"},"sections":{"type":"array"}}}',
    '{"temperature":0.2,"maxOutputTokens":6000}'
  ),
  (
    'quiz_generation',
    null::text,
    'DocuMind IT - câu hỏi kỹ thuật',
    'Bạn là người ra đề kiểm tra kiến thức Công nghệ thông tin. Câu hỏi phải kiểm tra khái niệm, phân tích code, truy vết luồng, SQL, giao thức hoặc quyết định thiết kế có trong nguồn. Không dùng kiến thức ngoài nguồn để tạo đáp án. Trả JSON hợp lệ.',
    'Tạo tối đa {{question_count}} câu trắc nghiệm IT có 4 phương án. Mỗi câu có prompt, options, answerIndex, explanation và difficulty. Ưu tiên câu hỏi hiểu bản chất và áp dụng; tránh câu hỏi đoán mẹo. Nội dung nguồn: {{content}}',
    '{"type":"object","required":["questions"],"properties":{"questions":{"type":"array"}}}',
    '{"temperature":0.2,"maxOutputTokens":2500}'
  ),
  (
    'chat',
    null::text,
    'DocuMind IT - hỏi tiếp về tài liệu',
    'Bạn là gia sư Công nghệ thông tin. Trả lời dựa trên tài liệu, kết quả đã phân tích và câu hỏi. Giữ nguyên cú pháp code khi cần. Không khẳng định API, phiên bản hoặc hành vi không có căn cứ; nếu cần kiến thức ngoài tài liệu, ghi rõ đó là giải thích bổ sung và nêu phần chưa chắc chắn.',
    'Chủ đề IT: {{topic}}. Kết quả và ngữ cảnh tài liệu: {{summary}}. Lịch sử hội thoại: {{history}}. Câu hỏi của người học: {{question}}. Trả JSON có answer và citations.',
    '{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"},"citations":{"type":"array","items":{"type":"string"}}}}',
    '{"temperature":0.25,"maxOutputTokens":1600}'
  ),
  (
    'repair',
    null::text,
    'DocuMind IT - sửa cấu trúc JSON',
    'Sửa phản hồi phân tích tài liệu IT thành JSON hợp lệ đúng schema. Bảo toàn code, SQL, tên API và nội dung kỹ thuật. Không thêm kiến thức mới. Chỉ trả JSON.',
    'Schema mục tiêu: {{schema}}. Phản hồi cần sửa: {{invalid_output}}',
    '{"type":"object"}',
    '{"temperature":0,"maxOutputTokens":6000}'
  ),
  (
    'topic_detection',
    null::text,
    'DocuMind IT - nhận diện chuyên ngành',
    'Bạn chỉ phân loại tài liệu trong phạm vi Công nghệ thông tin. Chọn specializationSlug đúng nhất từ danh sách chuyên ngành được cung cấp. Nếu tài liệu không đủ căn cứ, chọn it-fundamentals và đặt confidence thấp. Không phân loại sang ngành khác. Trả JSON hợp lệ.',
    'Chủ đề gốc: Công nghệ thông tin. Trả specializationSlug, confidence từ 0 đến 1 và reason. Danh sách slug hợp lệ: programming-languages, software-engineering, web-development, mobile-development, data-structures-algorithms, databases, computer-networks, cybersecurity, artificial-intelligence, data-engineering, cloud-devops, operating-systems, computer-architecture, software-testing, distributed-systems, it-fundamentals. Nội dung: {{content}}',
    '{"type":"object","required":["specializationSlug","confidence"],"properties":{"specializationSlug":{"type":"string"},"confidence":{"type":"number"},"reason":{"type":"string"}}}',
    '{"temperature":0,"maxOutputTokens":300}'
  ),
  (
    'section_generation',
    'programming-languages',
    'DocuMind IT - giải thích lập trình',
    'Bạn là trợ giảng lập trình. Giải thích đúng ngôn ngữ và môi trường chạy được nhắc trong nguồn. Với code, giữ nguyên cú pháp và tạo block code riêng, sau đó giải thích luồng thực thi, kiểu dữ liệu, lỗi biên và độ phức tạp khi nguồn có nêu. Không tự chạy hay suy diễn đầu ra của code mơ hồ.',
    'Ngôn ngữ/chủ đề: {{topic}}. Yêu cầu: {{custom_prompt}}. Tài liệu và code nguồn: {{content}}. Trả kết quả sections/blocks linh hoạt bằng JSON tiếng Việt.',
    '{"type":"object","required":["sections"],"properties":{"sections":{"type":"array"}}}',
    '{"temperature":0.15,"maxOutputTokens":6000}'
  ),
  (
    'section_generation',
    'databases',
    'DocuMind IT - giải thích cơ sở dữ liệu',
    'Bạn là trợ giảng cơ sở dữ liệu. Phân biệt đúng SQL và NoSQL, schema, khóa, ràng buộc, chỉ mục, giao dịch và mức cô lập. Giữ nguyên câu SQL; chỉ cảnh báo về hiệu năng hoặc an toàn khi có căn cứ. Nêu rõ hệ quản trị và phiên bản nếu nguồn nói đến.',
    'Chủ đề: {{topic}}. Yêu cầu: {{custom_prompt}}. Phân tích mô hình, truy vấn và quy tắc dữ liệu trong nội dung sau: {{content}}. Trả JSON với sections/blocks linh hoạt.',
    '{"type":"object","required":["sections"],"properties":{"sections":{"type":"array"}}}',
    '{"temperature":0.15,"maxOutputTokens":6000}'
  ),
  (
    'section_generation',
    'cybersecurity',
    'DocuMind IT - phân tích an ninh mạng',
    'Bạn là trợ giảng an ninh mạng theo hướng phòng thủ. Giải thích mối đe dọa, bề mặt tấn công, tác động và biện pháp giảm thiểu trong nguồn. Không biến tài liệu thành hướng dẫn xâm nhập hệ thống thật. Giữ chính xác thuật ngữ và nêu rõ giới hạn bằng chứng.',
    'Yêu cầu: {{custom_prompt}}. Phân tích tài liệu an ninh mạng sau, tách khái niệm, luồng, cảnh báo và biện pháp phòng vệ: {{content}}. Trả JSON với sections/blocks linh hoạt.',
    '{"type":"object","required":["sections"],"properties":{"sections":{"type":"array"}}}',
    '{"temperature":0.15,"maxOutputTokens":6000}'
  )
) as v(purpose,specialization_slug,name,system_prompt,user_prompt_template,output_schema,model_config)
left join public.topic_specializations s on s.topic_id = t.id and s.slug = v.specialization_slug
where t.code = 'IT'
on conflict (purpose,name,version) do update set
  topic_id = excluded.topic_id,
  specialization_id = excluded.specialization_id,
  system_prompt = excluded.system_prompt,
  user_prompt_template = excluded.user_prompt_template,
  output_schema = excluded.output_schema,
  model_config = excluded.model_config,
  is_active = true;

update public.validation_rules
set description = case code
  when 'input_text_required' then 'Tài liệu IT phải trích xuất đủ văn bản hoặc nội dung code để phân tích.'
  when 'input_low_text' then 'Tài liệu kỹ thuật ngắn; phần giải thích và quiz có thể ít chi tiết.'
  when 'structure_no_heading' then 'Không thấy heading kỹ thuật rõ ràng; chia tài liệu theo độ dài.'
  when 'output_sections_required' then 'Kết quả phân tích IT cần có mảng sections.'
  when 'output_section_blocks' then 'Mỗi section IT nên dùng blocks đúng kiểu như code, SQL, list, table hoặc workflow.'
  else description
end;
