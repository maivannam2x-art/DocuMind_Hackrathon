-- Transactional QA only: all fake model rows are rolled back.
begin;
do $$
declare s text := repeat('c',64); h jsonb; i int;
begin
  h := public.gemini_circuit_event(s,'qa-model','claim');
  for i in 1..5 loop
    h := public.gemini_circuit_event(s,'qa-model','failure',0,429);
    if i<5 and h->>'openUntil' is not null then raise exception 'Opened before 5 failures'; end if;
  end loop;
  if (h->>'retryAfter')::int <> 300 then raise exception 'Wrong cooldown'; end if;
  h := public.gemini_circuit_event(s,'qa-model','claim');
  if (h->>'allowed')::boolean then raise exception 'Cooldown allowed call'; end if;
  perform public.gemini_circuit_event(s,'qa-model','success',0);
  h := public.gemini_circuit_event(s,'qa-model','claim');
  if (h->>'allowed')::boolean then raise exception 'Late success unlocked'; end if;
  update public.gemini_model_health set open_until=now()-interval '1 second' where scope=s and model='qa-model';
  h := public.gemini_circuit_event(s,'qa-model','claim');
  if not (h->>'allowed')::boolean then raise exception 'Probe denied'; end if;
  h := public.gemini_circuit_event(s,'qa-model','claim');
  if (h->>'allowed')::boolean then raise exception 'Duplicate probe'; end if;
  perform public.gemini_circuit_event(s,'qa-model','success',(h->>'generation')::bigint);
  h := public.gemini_circuit_event(s,'qa-model','claim');
  if not (h->>'allowed')::boolean or (h->>'failures')::int<>0 then raise exception 'Recovery failed'; end if;
end $$;
rollback;
select 'PASS: threshold, cooldown, stale completions, one probe, recovery; QA rows rolled back' as result;
