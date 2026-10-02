-- Read-only audit. Image bytes belong in private Supabase Storage, never JSON columns.
select asset_type, count(*) as records,
       count(*) filter (where storage_bucket='analysis-assets' and storage_path like '%.png') as png_stored,
       count(*) filter (where storage_path is null) as awaiting_render
from public.generated_assets group by asset_type;
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='analysis-assets';
select count(*) as unexpected_embedded_image_metadata
from public.generated_assets
where metadata::text ~* 'base64|data:image|inlinePng|inlineSvg';
select a.analysis_id, a.result_id, a.asset_type, a.storage_path,
       a.metadata->>'mimeType' as mime_type, a.metadata->>'width' as width, a.metadata->>'height' as height
from public.generated_assets a
join public.analysis_results r on r.id=a.result_id and r.is_current
where a.storage_path is not null
order by a.created_at desc limit 100;
-- Missing images in legacy results are generated when the owner opens a visual or exports a report.
-- Rendering is local code (MathJax / Mermaid / resvg), with no additional Gemini call.
