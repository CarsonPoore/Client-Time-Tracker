-- Release 3a: file, link and decision now live on deliverable_versions.
-- Deliverables created or edited by pre-3a app code between 0008 and this
-- migration only touched the legacy columns, so re-backfill idempotently first.

-- (a) Any deliverable still without a version gets v1 from its legacy columns
--     (same mapping as the 0008 backfill).
create temp table _late_v1 as
select d.id as deliverable_id
from public.deliverables d
where d.current_version_id is null
  and not exists (select 1 from public.deliverable_versions v where v.deliverable_id = d.id and v.number = 1);

insert into public.deliverable_versions
  (deliverable_id, number, file_path, link_url, status, published_at, decided_at, decided_by, created_at)
select d.id, 1, d.file_path, d.link_url, d.status, d.published_at, d.decided_at, d.decided_by, d.created_at
from public.deliverables d join _late_v1 l on l.deliverable_id = d.id;

update public.deliverables d set current_version_id = v.id
from public.deliverable_versions v
where d.current_version_id is null and v.deliverable_id = d.id and v.number = 1;

insert into public.deliverable_comments (version_id, author_id, author_role, body, kind, created_at)
select d.current_version_id, d.decided_by, 'client', btrim(d.client_feedback), 'decision', coalesce(d.decided_at, d.updated_at)
from public.deliverables d join _late_v1 l on l.deliverable_id = d.id
where btrim(coalesce(d.client_feedback, '')) <> '';

drop table _late_v1;

-- (b) Legacy file/link edits made after 0008: drafts take the legacy pair when it
--     has a value; any other current version without a file or link gets it filled.
update public.deliverable_versions v
   set file_path = d.file_path, link_url = d.link_url
  from public.deliverables d
 where d.current_version_id = v.id
   and (d.file_path is not null or d.link_url is not null)
   and (v.status = 'draft' or (v.file_path is null and v.link_url is null))
   and (v.file_path is distinct from d.file_path or v.link_url is distinct from d.link_url);

-- (c) Nothing may be left without a current version.
do $$
declare n int;
begin
  select count(*) into n from public.deliverables where current_version_id is null;
  if n > 0 then
    raise exception '0009: % deliverable(s) have no current_version_id; refusing to drop legacy columns', n;
  end if;
end $$;

-- decide_deliverable (legacy wrapper that wrote the dropped columns) has no
-- remaining callers in the app; clients decide via decide_version.
drop function public.decide_deliverable(uuid, public.deliverable_status, text);

alter table public.deliverables
  drop column file_path,
  drop column link_url,
  drop column client_feedback,
  drop column decided_at,
  drop column decided_by;
