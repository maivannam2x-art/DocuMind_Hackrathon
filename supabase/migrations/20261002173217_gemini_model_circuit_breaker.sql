-- Shared Gemini health state: server-only, atomic across Vercel instances.
create table if not exists public.gemini_model_health (
  scope text not null check (length(scope) = 64),
  model text not null check (length(model) between 1 and 100),
  failures integer not null default 0 check (failures >= 0),
  generation bigint not null default 0,
  open_until timestamptz,
  probe_until timestamptz,
  last_status integer,
  updated_at timestamptz not null default now(),
  primary key (scope, model)
);
alter table public.gemini_model_health enable row level security;
revoke all on public.gemini_model_health from public, anon, authenticated;
grant select, insert, update, delete on public.gemini_model_health to service_role;

create or replace function public.gemini_circuit_event(
  p_scope text, p_model text, p_event text,
  p_generation bigint default null, p_status integer default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
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
$$;
revoke all on function public.gemini_circuit_event(text, text, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.gemini_circuit_event(text, text, text, bigint, integer) to service_role;
