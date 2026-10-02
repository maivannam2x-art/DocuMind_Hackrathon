-- Private counters; atomic RPC prevents per-instance serverless limit bypass.
create table if not exists public.api_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  hits integer not null check(hits > 0),
  expires_at timestamptz not null
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;
grant select,insert,update,delete on public.api_rate_limits to service_role;
create index if not exists api_rate_limits_expiry_idx on public.api_rate_limits(expires_at);
create or replace function public.consume_api_quota(p_key text, p_limit integer, p_window_seconds integer)
returns table(allowed boolean,retry_after integer)
language plpgsql security invoker set search_path = '' as $$
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
end; $$;
revoke execute on function public.consume_api_quota(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_api_quota(text,integer,integer) to service_role;
alter table public.analyses add column if not exists quiz_settings jsonb not null default '{"questionCount":20,"difficulty":"mixed","types":["multiple_choice"]}'::jsonb;
alter table public.analysis_chunks add column if not exists quiz_finished boolean not null default false;
alter table public.analysis_chunks add column if not exists quiz_batches integer not null default 0;
alter table public.analysis_chunks add column if not exists quiz_lease_until timestamptz;
