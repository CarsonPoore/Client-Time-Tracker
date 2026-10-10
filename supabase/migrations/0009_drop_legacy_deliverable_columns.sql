-- Release 3a: file, link and decision now live on deliverable_versions.
-- decide_deliverable (legacy wrapper that wrote the dropped columns) has no
-- remaining callers in the app; clients decide via decide_version.
drop function public.decide_deliverable(uuid, public.deliverable_status, text);

alter table public.deliverables
  drop column file_path,
  drop column link_url,
  drop column client_feedback,
  drop column decided_at,
  drop column decided_by;
