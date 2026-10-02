begin;
alter table public.analysis_inputs add column if not exists ingest_lease_until timestamptz;
create table if not exists public.analysis_activity (
 id uuid primary key default gen_random_uuid(),
 analysis_id uuid not null references public.analyses(id) on delete cascade,
 actor text not null check(actor in ('ai','system')),
 label text not null check(length(label)<=300),
 model text,
 status text not null check(status in ('running','succeeded','failed')),
 created_at timestamptz not null default now(),completed_at timestamptz
);
create index if not exists analysis_activity_analysis_created_idx on public.analysis_activity(analysis_id,created_at desc);
alter table public.analysis_activity enable row level security;
revoke all on public.analysis_activity from public,anon,authenticated;
grant select,insert,update,delete on public.analysis_activity to service_role;
-- Recover old failed drafts without altering user document contents.
update public.analyses a set status='failed',error_code=i.metadata->>'errorCode',error_message='Tệp vượt giới hạn hoặc không hợp lệ. Hãy tách nhỏ/chuyển đổi rồi tạo phiên mới.'
from public.analysis_inputs i where i.analysis_id=a.id and a.status='draft' and a.confirmed_at is null and i.status='error'
and i.metadata->>'errorCode' in ('PDF_TOO_MANY_PAGES','FILE_TOO_LARGE','VISION_FILE_TOO_LARGE','EMBEDDED_MEDIA_TOO_LARGE','EXTRACTED_TEXT_TOO_LONG','FILE_CONTENT_MISMATCH');
commit;
