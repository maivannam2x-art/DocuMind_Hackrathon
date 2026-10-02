-- DOCUMIND: BO SUNG TUONG THICH CODE HIEN TAI
-- Chay SAU 08_simple_tables_and_seed.sql neu can chay app day du.
-- 4 ham, 10 trigger, 3 bucket rieng tu; khong tao lai bang hay seed.
BEGIN;
CREATE OR REPLACE FUNCTION public.consume_api_quota(p_key text, p_limit integer, p_window_seconds integer)
 RETURNS TABLE(allowed boolean, retry_after integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare counter public.api_rate_limits%rowtype;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(p_key) <> 64 then raise exception 'invalid quota'; end if;
  insert into public.api_rate_limits as r(key_hash,window_started_at,hits,expires_at)
  values(p_key,clock_timestamp(),1,clock_timestamp()+make_interval(secs=>p_window_seconds))
  on conflict(key_hash) do update set
    hits=case when r.expires_at <= clock_timestamp() then 1 else r.hits+1 end,
    window_started_at=case when r.expires_at <= clock_timestamp() then clock_timestamp() else r.window_started_at end,
    expires_at=case when r.expires_at <= clock_timestamp() then clock_timestamp()+make_interval(secs=>p_window_seconds) else r.expires_at end
  returning * into counter;
  return query select counter.hits<=p_limit,greatest(1,ceil(extract(epoch from (counter.expires_at-clock_timestamp())))::integer);
end; $function$
;
REVOKE ALL ON FUNCTION consume_api_quota(text,integer,integer) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.gemini_circuit_event(p_scope text, p_model text, p_event text, p_generation bigint DEFAULT NULL::bigint, p_status integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  h public.gemini_model_health%rowtype;
  t timestamptz := clock_timestamp();
  allowed boolean := false;
begin
  if p_event not in ('claim', 'success', 'failure') then
    raise exception 'Invalid circuit event';
  end if;
  insert into public.gemini_model_health(scope, model) values(p_scope, p_model)
    on conflict (scope, model) do nothing;
  select * into h from public.gemini_model_health
    where scope = p_scope and model = p_model for update;
  if p_event = 'claim' then
    if h.open_until is null then
      allowed := true;
    elsif h.open_until <= t and (h.probe_until is null or h.probe_until <= t) then
      -- Only one recovery probe. Its lease outlives the 60-second LLM timeout.
      h.generation := h.generation + 1;
      h.probe_until := t + interval '90 seconds';
      allowed := true;
    end if;
  elsif p_generation = h.generation then
    if p_event = 'success' and (h.open_until is null or h.probe_until is not null) then
      if h.probe_until is not null then h.generation := h.generation + 1; end if;
      h.failures := 0;
      h.open_until := null;
      h.probe_until := null;
      h.last_status := null;
    elsif p_event = 'failure' and (h.open_until is null or h.probe_until is not null) then
      h.failures := h.failures + 1;
      h.last_status := p_status;
      if h.failures >= 5 or h.probe_until is not null then
        h.open_until := t + interval '5 minutes';
        h.probe_until := null;
        -- Late in-flight completions cannot unlock this cooldown.
        h.generation := h.generation + 1;
      end if;
    end if;
  end if;
  update public.gemini_model_health set failures = h.failures,
    generation = h.generation, open_until = h.open_until,
    probe_until = h.probe_until, last_status = h.last_status, updated_at = t
    where scope = p_scope and model = p_model;
  return jsonb_build_object('allowed', allowed, 'generation', h.generation,
    'failures', h.failures, 'openUntil', h.open_until,
    'retryAfter', case when h.open_until is null then 0
      else greatest(1, ceil(extract(epoch from (greatest(h.open_until, coalesce(h.probe_until, h.open_until)) - t)))::integer) end);
end;
$function$
;
REVOKE ALL ON FUNCTION gemini_circuit_event(text,text,text,bigint,integer) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION set_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER analyses_updated_at BEFORE UPDATE ON public.analyses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER chunks_updated_at BEFORE UPDATE ON public.analysis_chunks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER inputs_updated_at BEFORE UPDATE ON public.analysis_inputs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER prompts_updated_at BEFORE UPDATE ON public.prompt_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER quizzes_updated_at BEFORE UPDATE ON public.quizzes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER specializations_updated_at BEFORE UPDATE ON public.topic_specializations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER topics_updated_at BEFORE UPDATE ON public.topics FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER validation_rules_updated_at BEFORE UPDATE ON public.validation_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
GRANT EXECUTE ON FUNCTION public.consume_api_quota(text,integer,integer), public.gemini_circuit_event(text,text,text,bigint,integer) TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('analysis-assets','analysis-assets',false,10485760,ARRAY['image/svg+xml','image/png','image/jpeg','image/webp']) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('analysis-exports','analysis-exports',false,20971520,ARRAY['text/markdown','text/html','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/zip','application/json','application/pdf']) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('analysis-inputs','analysis-inputs',false,20971520,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/png','image/jpeg']) ON CONFLICT(id) DO NOTHING;
NOTIFY pgrst, 'reload schema';
COMMIT;
