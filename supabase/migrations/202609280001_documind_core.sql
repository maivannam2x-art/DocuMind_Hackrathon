-- DocuMind MVP schema. All document data is private; server uses service role.
create extension if not exists pgcrypto with schema extensions;

create type public.analysis_status as enum (
  'draft', 'validating', 'needs_review', 'ready', 'processing',
  'completed', 'failed', 'expired'
);
create type public.input_status as enum ('staged', 'extracted', 'needs_review', 'valid', 'error');
create type public.chunk_status as enum ('pending', 'processing', 'complete', 'failed');
create type public.llm_exchange_status as enum ('started', 'succeeded', 'failed');
create type public.quiz_attempt_status as enum ('in_progress', 'submitted');

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.topic_specializations (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  parent_id uuid references public.topic_specializations(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_id, slug)
);
create index topic_specializations_parent_idx on public.topic_specializations(topic_id, parent_id, sort_order);

create table public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('section_generation','quiz_generation','chat','repair','topic_detection')),
  topic_id uuid references public.topics(id) on delete set null,
  specialization_id uuid references public.topic_specializations(id) on delete set null,
  version integer not null default 1 check (version > 0),
  name text not null,
  system_prompt text not null,
  user_prompt_template text not null,
  output_schema jsonb not null default '{}'::jsonb,
  model_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purpose, name, version)
);
create index prompt_templates_lookup_idx on public.prompt_templates(purpose, topic_id, specialization_id, is_active);

create table public.validation_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  stage text not null check (stage in ('input','structure','output','quiz')),
  severity text not null check (severity in ('info','warning','error')),
  description text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_session_hash text,
  title text not null default 'Phân tích mới',
  topic_id uuid references public.topics(id) on delete set null,
  specialization_id uuid references public.topic_specializations(id) on delete set null,
  prompt_template_id uuid references public.prompt_templates(id) on delete set null,
  custom_prompt text,
  quiz_enabled boolean not null default false,
  status public.analysis_status not null default 'draft',
  validation_report jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  model_provider text,
  model_name text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analysis_owner_check check ((user_id is not null)::int + (guest_session_hash is not null)::int = 1)
);
create index analyses_user_created_idx on public.analyses(user_id, created_at desc) where user_id is not null;
create index analyses_guest_created_idx on public.analyses(guest_session_hash, created_at desc) where guest_session_hash is not null;
create index analyses_status_idx on public.analyses(status, updated_at);

create table public.analysis_inputs (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  input_kind text not null check (input_kind in ('file','pasted_text')),
  original_name text,
  mime_type text,
  byte_size bigint not null default 0 check (byte_size >= 0),
  storage_bucket text,
  storage_path text,
  original_text text,
  normalized_text text,
  edited_text text,
  status public.input_status not null default 'staged',
  validation_report jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint input_payload_check check (
    (input_kind = 'pasted_text' and original_text is not null)
    or (input_kind = 'file' and (storage_path is not null or original_name is not null))
  )
);
create index analysis_inputs_analysis_idx on public.analysis_inputs(analysis_id, position);

create table public.analysis_chunks (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  input_id uuid not null references public.analysis_inputs(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  title text,
  content text not null,
  char_start integer not null default 0,
  char_end integer not null default 0,
  status public.chunk_status not null default 'pending',
  retry_count integer not null default 0 check (retry_count >= 0),
  error_message text,
  generated_content jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (input_id, chunk_index)
);
create index analysis_chunks_analysis_idx on public.analysis_chunks(analysis_id, chunk_index);

create table public.llm_exchanges (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  chunk_id uuid references public.analysis_chunks(id) on delete set null,
  prompt_template_id uuid references public.prompt_templates(id) on delete set null,
  purpose text not null,
  provider text not null,
  model text not null,
  attempt integer not null default 1 check (attempt > 0),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  status public.llm_exchange_status not null default 'started',
  error_message text,
  created_at timestamptz not null default now()
);
create index llm_exchanges_analysis_idx on public.llm_exchanges(analysis_id, created_at);

create table public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  schema_version text not null default '1.0',
  result_json jsonb not null,
  summary text,
  source_metadata jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (analysis_id, version),
  constraint result_shape_check check (
    jsonb_typeof(result_json) = 'object'
    and jsonb_typeof(result_json -> 'sections') = 'array'
  )
);
create unique index analysis_results_one_current_idx on public.analysis_results(analysis_id) where is_current;

create table public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  result_id uuid references public.analysis_results(id) on delete cascade,
  asset_type text not null check (asset_type in ('latex','mermaid','plantuml','code','image','other')),
  title text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  storage_bucket text,
  storage_path text,
  created_at timestamptz not null default now()
);
create index generated_assets_analysis_idx on public.generated_assets(analysis_id, asset_type);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  result_id uuid references public.analysis_results(id) on delete set null,
  title text not null default 'Ôn tập nhanh',
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check (status in ('draft','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quizzes_analysis_idx on public.quizzes(analysis_id, created_at desc);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  question_type text not null default 'multiple_choice' check (question_type in ('multiple_choice','true_false','short_answer')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  answer jsonb not null,
  explanation text,
  difficulty text check (difficulty in ('easy','medium','hard')),
  source_chunk_id uuid references public.analysis_chunks(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quiz_id, question_index)
);
create index quiz_questions_quiz_idx on public.quiz_questions(quiz_id, question_index);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  guest_session_hash text,
  answers jsonb not null default '{}'::jsonb,
  score numeric(5,2),
  total_questions integer not null default 0,
  status public.quiz_attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint quiz_attempt_owner_check check ((user_id is not null)::int + (guest_session_hash is not null)::int = 1)
);
create index quiz_attempts_quiz_idx on public.quiz_attempts(quiz_id, started_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_analysis_idx on public.chat_messages(analysis_id, created_at);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  result_id uuid references public.analysis_results(id) on delete set null,
  format text not null check (format in ('json','markdown','html')),
  status text not null default 'ready' check (status in ('pending','ready','failed')),
  storage_bucket text,
  storage_path text,
  created_at timestamptz not null default now()
);
create index exports_analysis_idx on public.exports(analysis_id, created_at desc);

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger topics_updated_at before update on public.topics for each row execute procedure public.set_updated_at();
create trigger specializations_updated_at before update on public.topic_specializations for each row execute procedure public.set_updated_at();
create trigger prompts_updated_at before update on public.prompt_templates for each row execute procedure public.set_updated_at();
create trigger validation_rules_updated_at before update on public.validation_rules for each row execute procedure public.set_updated_at();
create trigger analyses_updated_at before update on public.analyses for each row execute procedure public.set_updated_at();
create trigger inputs_updated_at before update on public.analysis_inputs for each row execute procedure public.set_updated_at();
create trigger chunks_updated_at before update on public.analysis_chunks for each row execute procedure public.set_updated_at();
create trigger quizzes_updated_at before update on public.quizzes for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.topics enable row level security;
alter table public.topic_specializations enable row level security;
alter table public.prompt_templates enable row level security;
alter table public.validation_rules enable row level security;
alter table public.analyses enable row level security;
alter table public.analysis_inputs enable row level security;
alter table public.analysis_chunks enable row level security;
alter table public.llm_exchanges enable row level security;
alter table public.analysis_results enable row level security;
alter table public.generated_assets enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.chat_messages enable row level security;
alter table public.exports enable row level security;

create policy "topics are readable" on public.topics for select to anon, authenticated using (is_active);
create policy "active specializations are readable" on public.topic_specializations for select to anon, authenticated using (is_active);
create policy "active prompt templates are readable" on public.prompt_templates for select to authenticated using (is_active);
create policy "active validation rules are readable" on public.validation_rules for select to authenticated using (is_active);
create policy "profile owner read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profile owner update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "analysis owner read" on public.analyses for select to authenticated using (user_id = (select auth.uid()));
create policy "analysis owner insert" on public.analyses for insert to authenticated with check (user_id = (select auth.uid()) and guest_session_hash is null);
create policy "analysis owner update" on public.analyses for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "analysis owner delete" on public.analyses for delete to authenticated using (user_id = (select auth.uid()));

create policy "input owner access" on public.analysis_inputs for all to authenticated
using (exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid())))
with check (exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid())));
create policy "chunk owner read" on public.analysis_chunks for select to authenticated
using (exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid())));
create policy "exchange owner read" on public.llm_exchanges for select to authenticated
using (exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid())));
create policy "result owner read" on public.analysis_results for select to authenticated
using (exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid())));
create policy "assets owner read" on public.generated_assets for select to authenticated
using (exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid())));
create policy "quiz owner read" on public.quizzes for select to authenticated
using (exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid())));
create policy "question owner read" on public.quiz_questions for select to authenticated
using (exists (select 1 from public.quizzes q join public.analyses a on a.id = q.analysis_id where q.id = quiz_id and a.user_id = (select auth.uid())));
create policy "attempt owner access" on public.quiz_attempts for all to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.quizzes q join public.analyses a on a.id = q.analysis_id where q.id = quiz_id and a.user_id = (select auth.uid())))
with check (user_id = (select auth.uid()) and guest_session_hash is null and exists (select 1 from public.quizzes q join public.analyses a on a.id = q.analysis_id where q.id = quiz_id and a.user_id = (select auth.uid())));
create policy "chat owner access" on public.chat_messages for all to authenticated
using (exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid())))
with check (exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid())));
create policy "export owner read" on public.exports for select to authenticated
using (exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid())));

-- Only authenticated users can access files directly. Guest and server-mediated flows
-- use the server-only service role and short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('analysis-inputs', 'analysis-inputs', false, 20971520, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/png','image/jpeg']),
  ('analysis-exports', 'analysis-exports', false, 20971520, array['application/json','text/markdown','text/html'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "user read own analysis files" on storage.objects for select to authenticated
using (bucket_id in ('analysis-inputs','analysis-exports') and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy "user upload own analysis files" on storage.objects for insert to authenticated
with check (bucket_id in ('analysis-inputs','analysis-exports') and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy "user update own analysis files" on storage.objects for update to authenticated
using (bucket_id in ('analysis-inputs','analysis-exports') and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text)
with check (bucket_id in ('analysis-inputs','analysis-exports') and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy "user delete own analysis files" on storage.objects for delete to authenticated
using (bucket_id in ('analysis-inputs','analysis-exports') and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = (select auth.uid())::text);

insert into public.topics (code, name, description, sort_order) values
  ('EDUCATION', 'Giáo dục', 'Tài liệu học tập, ghi chú và giáo trình.', 10),
  ('IT', 'Công nghệ thông tin', 'Lập trình, hệ thống và khoa học máy tính.', 20),
  ('FINANCE', 'Tài chính', 'Tài liệu về tài chính và kế toán.', 30),
  ('HEALTH', 'Sức khỏe', 'Nội dung khoa học sức khỏe và y sinh.', 40),
  ('OTHER', 'Khác', 'Chủ đề tổng quát khi không khớp lĩnh vực có sẵn.', 100)
on conflict (code) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;

insert into public.topic_specializations (topic_id, name, slug, description, sort_order)
select t.id, v.name, v.slug, v.description, v.sort_order
from public.topics t
cross join (values
  ('EDUCATION','Khoa học tự nhiên','natural-sciences','Toán, Lý, Hóa, Sinh.',10),
  ('EDUCATION','Khoa học xã hội','social-sciences','Lịch sử, địa lý, xã hội học.',20),
  ('EDUCATION','Ngôn ngữ','languages','Ngôn ngữ và kỹ năng giao tiếp.',30),
  ('IT','Lập trình','programming','Ngôn ngữ lập trình và thực hành code.',10),
  ('IT','Cơ sở dữ liệu','databases','Mô hình dữ liệu, SQL và hệ quản trị.',20),
  ('IT','Trí tuệ nhân tạo','artificial-intelligence','AI, machine learning và ứng dụng.',30),
  ('FINANCE','Kế toán','accounting','Kế toán tài chính và quản trị.',10),
  ('FINANCE','Đầu tư','investing','Đầu tư và quản trị rủi ro.',20),
  ('HEALTH','Y học cơ sở','basic-medicine','Kiến thức nền tảng y sinh.',10),
  ('HEALTH','Sức khỏe cộng đồng','public-health','Sức khỏe và y tế cộng đồng.',20)
) as v(topic_code,name,slug,description,sort_order)
where t.code = v.topic_code
on conflict (topic_id, slug) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;

insert into public.validation_rules (code,stage,severity,description,config,sort_order) values
  ('input_text_required','input','error','Tệp hoặc nội dung phải trích xuất được văn bản.',jsonb_build_object('min_characters',40),10),
  ('input_max_characters','input','error','Tổng nội dung vượt giới hạn xử lý.',jsonb_build_object('max_characters',500000),20),
  ('input_low_text','input','warning','Văn bản ngắn, kết quả có thể ít chi tiết.',jsonb_build_object('min_characters',500),30),
  ('structure_no_heading','structure','info','Không thấy tiêu đề rõ ràng; hệ thống tự chia theo độ dài.',jsonb_build_object(),10),
  ('output_sections_required','output','error','Kết quả cần có mảng sections.',jsonb_build_object('min_sections',1),10),
  ('output_section_blocks','output','warning','Mỗi section nên có các block có kiểu dữ liệu.',jsonb_build_object(),20),
  ('quiz_min_questions','quiz','warning','Quiz nên có tối thiểu ba câu hỏi.',jsonb_build_object('min_questions',3),10)
on conflict (code) do update set severity = excluded.severity, description = excluded.description, config = excluded.config, sort_order = excluded.sort_order;

insert into public.prompt_templates (purpose,name,version,system_prompt,user_prompt_template,output_schema,model_config) values
  ('section_generation','DocuMind - tạo section học tập',1,
   'Bạn là trợ lý học tập DocuMind. Chỉ dùng kiến thức trong nguồn. Trả lời JSON hợp lệ theo schema. Không bịa dữ kiện; ghi rõ giới hạn nguồn.',
   'Phân tích đoạn tài liệu sau, tạo các section học tập có tiêu đề, tóm tắt, giải thích khái niệm, danh sách và câu hỏi ôn tập khi phù hợp. Chủ đề: {{topic}}. Yêu cầu: {{custom_prompt}}. Nội dung: {{content}}',
   '{"type":"object","required":["sections"],"properties":{"sections":{"type":"array"}}}'::jsonb,
   '{"temperature":0.2,"maxOutputTokens":4096}'::jsonb),
  ('quiz_generation','DocuMind - tạo quiz',1,
   'Tạo câu hỏi ôn tập từ nguồn được cung cấp. Không suy diễn thông tin không có trong nguồn. Trả JSON với mảng questions.',
   'Tạo tối đa {{question_count}} câu hỏi trắc nghiệm bốn lựa chọn. Gồm prompt, options, answerIndex, explanation và difficulty. Nội dung: {{content}}',
   '{"type":"object","required":["questions"],"properties":{"questions":{"type":"array"}}}'::jsonb,
   '{"temperature":0.3,"maxOutputTokens":2048}'::jsonb),
  ('chat','DocuMind - hỏi tiếp',1,
   'Bạn là trợ lý học tập của DocuMind. Ưu tiên trả lời từ tài liệu và kết quả đã phân tích. Nêu rõ nếu tài liệu không cung cấp đủ căn cứ.',
   'Chủ đề: {{topic}}. Tóm tắt kết quả: {{summary}}. Câu hỏi: {{question}}',
   '{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"},"citations":{"type":"array","items":{"type":"string"}}}}'::jsonb,
   '{"temperature":0.3,"maxOutputTokens":1024}'::jsonb),
  ('repair','DocuMind - sửa JSON',1,
   'Sửa đầu ra thành JSON hợp lệ theo schema chỉ định. Giữ nội dung đúng, loại bỏ văn bản ngoài JSON.',
   'Schema: {{schema}}. Đầu ra lỗi: {{invalid_output}}',
   '{"type":"object"}'::jsonb,
   '{"temperature":0,"maxOutputTokens":4096}'::jsonb),
  ('topic_detection','DocuMind - phát hiện chủ đề',1,
   'Phân loại tài liệu vào một mã chủ đề phù hợp nhất trong EDUCATION, IT, FINANCE, HEALTH, OTHER.',
   'Chủ đề người dùng chọn (có thể rỗng): {{topic}}. Văn bản: {{content}}',
   '{"type":"object","required":["topicCode","confidence"],"properties":{"topicCode":{"type":"string","enum":["EDUCATION","IT","FINANCE","HEALTH","OTHER"]},"confidence":{"type":"number","minimum":0,"maximum":1},"reason":{"type":"string"}}}'::jsonb,
   '{"temperature":0,"maxOutputTokens":256}'::jsonb)
on conflict (purpose,name,version) do update set system_prompt = excluded.system_prompt, user_prompt_template = excluded.user_prompt_template, output_schema = excluded.output_schema, model_config = excluded.model_config;

grant select on public.topics, public.topic_specializations to anon, authenticated;
grant select on public.prompt_templates, public.validation_rules to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.analyses to authenticated;
grant select on public.analysis_inputs, public.chat_messages, public.quiz_attempts to authenticated;
grant select on public.analysis_chunks, public.llm_exchanges, public.analysis_results, public.generated_assets, public.quizzes, public.quiz_questions, public.exports to authenticated;
