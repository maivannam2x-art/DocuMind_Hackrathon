-- Idempotent indexes for the FK columns reported by Supabase's performance advisor.
-- Run after the main schema is installed. Existing application rows are preserved.
create index if not exists analyses_prompt_template_fk_idx on public.analyses(prompt_template_id);
create index if not exists analyses_specialization_fk_idx on public.analyses(specialization_id);
create index if not exists analyses_topic_fk_idx on public.analyses(topic_id);
create index if not exists exports_result_fk_idx on public.exports(result_id);
create index if not exists generated_assets_result_fk_idx on public.generated_assets(result_id);
create index if not exists llm_exchanges_chunk_fk_idx on public.llm_exchanges(chunk_id);
create index if not exists llm_exchanges_prompt_fk_idx on public.llm_exchanges(prompt_template_id);
create index if not exists prompt_templates_specialization_fk_idx on public.prompt_templates(specialization_id);
create index if not exists prompt_templates_topic_fk_idx on public.prompt_templates(topic_id);
create index if not exists quiz_attempts_user_fk_idx on public.quiz_attempts(user_id);
create index if not exists quiz_questions_source_chunk_fk_idx on public.quiz_questions(source_chunk_id);
create index if not exists quizzes_result_fk_idx on public.quizzes(result_id);
create index if not exists topic_specializations_parent_fk_idx on public.topic_specializations(parent_id);
