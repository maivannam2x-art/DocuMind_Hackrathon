-- Serialize final result/quiz writes across concurrent tabs and retries.
alter table public.analyses add column if not exists finalization_lease_until timestamptz;
