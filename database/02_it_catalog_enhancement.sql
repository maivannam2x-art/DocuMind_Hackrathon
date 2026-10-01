-- DocuMind IT catalog extension. Safe to rerun on an existing DocuMind schema.
-- This file contains configuration only: no account, document, or LLM data.
begin;

insert into public.topic_specializations (topic_id, parent_id, name, slug, description, sort_order)
select t.id, p.id, v.name, v.slug, v.description, v.sort_order
from public.topics t
join (values
  ('data-structures-algorithms','Cấu trúc dữ liệu','dsa-data-structures','Mảng, danh sách liên kết, cây, heap, hash map và đồ thị.',10),
  ('data-structures-algorithms','Thuật toán và độ phức tạp','dsa-algorithms-complexity','Độ phức tạp, truy vết, chứng minh đúng và các kỹ thuật giải thuật.',20),
  ('software-engineering','Kiến trúc và thiết kế phần mềm','engineering-architecture','Thiết kế module, SOLID, design pattern và đánh đổi kiến trúc.',10),
  ('distributed-systems','Nhất quán và chịu lỗi','distributed-consistency','Replication, consistency, retry, idempotency và khả năng chịu lỗi.',10),
  ('operating-systems','Tiến trình và đồng bộ','os-process-concurrency','Process, thread, scheduler, lock, deadlock và đồng bộ.',10),
  ('data-engineering','Pipeline và kho dữ liệu','data-pipelines-warehouse','ETL/ELT, data quality, batch/stream và kho dữ liệu.',10),
  ('cloud-devops','Quan sát và vận hành','devops-observability','Logs, metrics, traces, cảnh báo và xử lý sự cố.',30),
  ('computer-architecture','CPU và bộ nhớ','architecture-cpu-memory','Tập lệnh, pipeline, cache, bộ nhớ và hiệu năng.',10),
  ('mobile-development','Android và iOS','mobile-android-ios','Vòng đời, giao diện, lưu trữ và kiến trúc ứng dụng di động.',10),
  ('artificial-intelligence','RAG và đánh giá LLM','ai-rag-evaluation','Truy hồi tài liệu, trích dẫn, đánh giá chất lượng và an toàn đầu ra.',40)
) as v(parent_slug,name,slug,description,sort_order) on true
  join public.topic_specializations p on p.topic_id = t.id and p.slug = v.parent_slug
where t.code = 'IT'
on conflict (topic_id, slug) do update set
  parent_id = excluded.parent_id,
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

-- Each template inherits the canonical typed-block output schema, so it stays
-- compatible with the backend parser and PDF/Word/HTML report renderer.
insert into public.prompt_templates (
  purpose, topic_id, specialization_id, name, version,
  system_prompt, user_prompt_template, output_schema, model_config
)
select 'section_generation', t.id, s.id, v.name, 1,
  v.system_prompt || E'\nChỉ trả JSON sections[]. Mỗi section có title và blocks; mỗi block có type, content và contentType rõ ràng nếu là code, table, latex, mermaid, plantuml hoặc json. Sơ đồ dùng mã nguồn hợp lệ, không giả vờ có ảnh đã render. Công thức giữ dạng LaTeX; nếu không chắc cú pháp, dùng văn bản thường và nêu giới hạn. Không bịa dữ kiện ngoài nguồn.',
  v.user_prompt_template || E'\nYêu cầu người dùng: {{custom_prompt}}. Tên chủ đề: {{topic}}. Nguồn: {{content}}',
  base.output_schema, base.model_config
from public.topics t
join public.prompt_templates base on base.topic_id = t.id
  and base.purpose = 'section_generation'
  and base.name = 'DocuMind IT - phân tích tài liệu kỹ thuật'
join (values
  ('data-structures-algorithms','DocuMind IT - giải thuật và cấu trúc dữ liệu',
   'Bạn là trợ giảng giải thuật. Phân biệt dữ liệu vào/ra, bất biến, độ đúng, độ phức tạp thời gian và bộ nhớ. Giữ nguyên mã giả, code và ký hiệu trong nguồn. Chỉ vẽ flowchart Mermaid khi luồng có đủ dữ kiện; ví dụ phản ví dụ hoặc trường hợp biên phải có căn cứ.',
   'Tạo các mục dễ học: bài toán, trực giác, từng bước giải thuật, độ phức tạp và trường hợp biên. Biểu thức toán dùng block formula với contentType=latex khi có thể kiểm chứng. Không biến từng dòng đánh số thành heading.'),
  ('web-backend-api','DocuMind IT - backend và API',
   'Bạn là trợ giảng backend. Giữ nguyên endpoint, HTTP method, payload, trạng thái, auth và tên framework. Phân biệt request, validation, service, persistence và response; không giả định API không được tài liệu mô tả.',
   'Tóm lược hợp đồng API, luồng request-response, điều kiện lỗi và bảo mật. Dùng block code/json/table có nhãn; sơ đồ sequence hoặc flow Mermaid chỉ khi có dữ kiện rõ ràng.'),
  ('distributed-systems','DocuMind IT - hệ thống phân tán',
   'Bạn là trợ giảng hệ thống phân tán. Phân biệt latency, throughput, consistency, availability, retries, idempotency, partition và failure mode. Không khẳng định guarantee nếu tài liệu không nói.',
   'Giải thích luồng thành phần, trạng thái bình thường và lỗi, đánh đổi và giới hạn giả định. Có thể dùng sơ đồ Mermaid khi topology được nguồn mô tả.'),
  ('ai-llm','DocuMind IT - LLM và RAG',
   'Bạn là trợ giảng AI/LLM. Phân biệt huấn luyện, inference, embedding, retrieval, grounding, hallucination, evaluation và quyền riêng tư. Không bịa benchmark, giá hoặc năng lực model.',
   'Chia rõ mục tiêu, pipeline dữ liệu, prompt/response, đánh giá và giới hạn. Giữ trích dẫn về chunk hoặc nguồn khi được cung cấp; không tạo trích dẫn giả.'),
  ('cloud-devops','DocuMind IT - cloud và DevOps',
   'Bạn là trợ giảng Cloud/DevOps. Giữ nguyên lệnh, cấu hình, port, biến môi trường và ngữ cảnh triển khai; không làm lộ secret. Phân biệt build, test, deploy, runtime, monitoring và rollback.',
   'Trình bày các bước, phụ thuộc, lỗi thường gặp và cách xác minh. Lệnh shell ở block code, sơ đồ triển khai Mermaid chỉ khi nguồn đủ thông tin.'),
  ('operating-systems','DocuMind IT - hệ điều hành',
   'Bạn là trợ giảng hệ điều hành. Phân biệt process/thread, scheduling, virtual memory, synchronization và file system. Chỉ suy ra timeline hoặc trạng thái khi nguồn cung cấp quy tắc rõ.',
   'Tóm tắt khái niệm và cơ chế, minh họa chuyển trạng thái/đồng bộ nếu có căn cứ. Công thức và bảng tính dùng kiểu block tương ứng, nêu đơn vị và giả định.')
) as v(specialization_slug,name,system_prompt,user_prompt_template) on true
join public.topic_specializations s on s.topic_id = t.id and s.slug = v.specialization_slug
where t.code = 'IT'
on conflict (purpose, name, version) do update set
  topic_id = excluded.topic_id,
  specialization_id = excluded.specialization_id,
  system_prompt = excluded.system_prompt,
  user_prompt_template = excluded.user_prompt_template,
  output_schema = excluded.output_schema,
  model_config = excluded.model_config,
  is_active = true;

commit;
