-- Read-only checks: run after 01_fresh_production_bootstrap.sql on a NEW project.
-- No document, password, email address or key is returned.
select
 (select count(*) from pg_tables where schemaname='public' and tablename in ('profiles','topics','topic_specializations','prompt_templates','validation_rules','analyses','analysis_inputs','analysis_chunks','llm_exchanges','analysis_results','generated_assets','quizzes','quiz_questions','quiz_attempts','chat_messages','exports','api_rate_limits','analysis_activity','gemini_model_health')) app_tables,
 (select count(*) from public.topics where is_active and code='IT') it_topics,
 (select count(*) from public.topic_specializations where is_active) active_specializations,
 (select count(*) from public.prompt_templates where is_active) active_prompts,
 (select count(*) from public.validation_rules where is_active) active_rules,
 (select count(*) from storage.buckets where id in ('analysis-inputs','analysis-exports','analysis-assets') and not public) private_buckets,
 (select count(*) from pg_tables where schemaname='public' and rowsecurity) rls_tables;
-- Expected for an otherwise-empty project: 19 / 1 / 73 / 43 / 7 / 3 / 19.
select table_name,column_name from information_schema.columns
where table_schema='public' and column_name in ('quiz_settings','finalization_lease_until','ingest_lease_until','quiz_finished','quiz_batches','quiz_lease_until') order by table_name,column_name;
-- Expected: 6 columns: analyses(2), analysis_inputs(1), analysis_chunks(3).
select
 has_table_privilege('service_role','public.analyses','insert') service_can_create,
 has_table_privilege('anon','public.quiz_questions','select') anon_can_read_answers,
 has_table_privilege('authenticated','public.quiz_questions','select') user_can_read_answers,
 has_table_privilege('authenticated','public.analyses','update') user_can_mutate_state_directly,
 has_function_privilege('anon','public.consume_api_quota(text,integer,integer)','execute') anon_can_call_quota,
 has_function_privilege('authenticated','public.gemini_circuit_event(text,text,text,bigint,integer)','execute') user_can_change_model_health;
-- Expected true / false / false / false / false / false.
select purpose,count(*) active_count from public.prompt_templates where is_active group by purpose order by purpose;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id in ('analysis-inputs','analysis-assets','analysis-exports') order by id;
select trigger_name,event_object_schema,event_object_table,action_statement from information_schema.triggers
where event_object_schema='public' or (event_object_schema='auth' and trigger_name='on_auth_user_created') order by event_object_schema,event_object_table;
