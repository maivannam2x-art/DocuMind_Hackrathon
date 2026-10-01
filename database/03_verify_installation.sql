-- Read-only smoke check; no personal data or document content is returned.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name in (
    'profiles','topics','topic_specializations','prompt_templates','validation_rules',
    'analyses','analysis_inputs','analysis_chunks','llm_exchanges','analysis_results',
    'generated_assets','quizzes','quiz_questions','quiz_attempts','chat_messages','exports'
  )) as app_tables,
  (select count(*) from public.topics where code = 'IT' and is_active) as it_topics,
  (select count(*) from public.topic_specializations where is_active) as active_specializations,
  (select count(*) from public.prompt_templates where is_active) as active_prompts,
  (select count(*) from public.validation_rules where is_active) as active_rules,
  (select count(*) from storage.buckets where id in ('analysis-inputs','analysis-exports','analysis-assets') and public = false) as private_buckets,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relname in (
       'profiles','topics','topic_specializations','prompt_templates','validation_rules',
       'analyses','analysis_inputs','analysis_chunks','llm_exchanges','analysis_results',
       'generated_assets','quizzes','quiz_questions','quiz_attempts','chat_messages','exports'
     ) and c.relrowsecurity) as rls_enabled_tables;

-- Expected on the current catalog: 16 / 1 / 49 / 19 / 7 / 3 / 16.
-- Re-running 02_it_catalog_enhancement.sql must not change these counts.
