-- Portable Markdown exports include report.md and canonical PNG images in a ZIP.
-- Preserve bucket privacy and existing allowed MIME types.
update storage.buckets
set allowed_mime_types = case when allowed_mime_types is null then null
  else array(select distinct mime from unnest(allowed_mime_types || array['application/zip']::text[]) as mime) end
where id = 'analysis-exports';
