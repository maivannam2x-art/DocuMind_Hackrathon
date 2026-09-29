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
