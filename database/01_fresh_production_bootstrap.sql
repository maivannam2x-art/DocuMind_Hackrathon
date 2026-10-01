-- DOCUMIND: FRESH SUPABASE PROJECT ONLY. NEVER RUN ON AN EXISTING DATABASE.
-- Snapshot of the nine schema migrations plus the versioned IT catalog extension.
-- This is a schema/configuration bootstrap, NOT a user-data backup.
-- Run with the Supabase SQL editor (postgres role) after reviewing database/README.md.
-- Do not run individual migrations again after this bootstrap on the same database.
begin;

-- ===== 202609280001_documind_core.sql =====
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

-- ===== 202609280002_security_tightening.sql =====
-- Browser clients use the API for state transitions. Keep direct PostgREST access read-only.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke insert, update, delete on public.analyses from authenticated;
revoke insert, update, delete on public.analysis_inputs from authenticated;
revoke insert, update, delete on public.analysis_chunks from authenticated;
revoke insert, update, delete on public.llm_exchanges from authenticated;
revoke insert, update, delete on public.analysis_results from authenticated;
revoke insert, update, delete on public.generated_assets from authenticated;
revoke insert, update, delete on public.quizzes from authenticated;
revoke insert, update, delete on public.quiz_questions from authenticated;
revoke insert, update, delete on public.quiz_attempts from authenticated;
revoke insert, update, delete on public.chat_messages from authenticated;
revoke insert, update, delete on public.exports from authenticated;
grant select on public.analyses, public.analysis_inputs, public.analysis_chunks,
  public.llm_exchanges, public.analysis_results, public.generated_assets,
  public.quizzes, public.quiz_questions, public.quiz_attempts, public.chat_messages,
  public.exports to authenticated;

-- ===== 202609280003_quiz_answer_privacy.sql =====
-- Correct answers are delivered only by the scoring endpoint, never PostgREST.
revoke select on public.quiz_questions from anon, authenticated;

-- ===== 202609280004_it_focus.sql =====
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

-- ===== 202609280005_chat_context.sql =====
update public.prompt_templates
set user_prompt_template = 'Chủ đề IT: {{topic}}. Kết quả và ngữ cảnh tài liệu: {{summary}}. Lịch sử hội thoại: {{history}}. Câu hỏi của người học: {{question}}. Trả JSON có answer và citations.',
    version = version + 1
where name = 'DocuMind IT - hỏi tiếp về tài liệu'
  and purpose = 'chat'
  and topic_id = (select id from public.topics where code = 'IT');

-- ===== 202609280006_general_fallback_prompts.sql =====
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

-- ===== 20260929034249_results_exports_and_typed_blocks.sql =====
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

-- ===== 20260929041557_allow_binary_report_exports.sql =====
-- Permit the two binary export formats generated by the report workspace.
update storage.buckets
set allowed_mime_types = array[
  'application/json',
  'text/markdown',
  'text/html',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'analysis-exports';

-- ===== 20260929051348_documind_visual_assets.sql =====
-- Private bucket for rendered diagrams and image assets generated from a result.
-- Clients only receive short-lived signed read URLs from the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'analysis-assets',
  'analysis-assets',
  false,
  10485760,
  array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ===== 02_it_catalog_enhancement.sql =====
-- DocuMind IT catalog extension. Safe to rerun on an existing DocuMind schema.
-- This file contains configuration only: no account, document, or LLM data.

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

