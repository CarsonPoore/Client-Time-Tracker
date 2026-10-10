-- supabase/migrations/0008_revisions.sql
-- Release 3a: deliverable versions, comment threads, attachments, client activity.

create table public.deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  number int not null check (number > 0),
  file_path text,
  link_url text,
  notes text,
  status public.deliverable_status not null default 'draft',
  published_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deliverable_id, number)
);
create index deliverable_versions_deliverable_id_idx on public.deliverable_versions(deliverable_id);
create trigger deliverable_versions_updated before update on public.deliverable_versions
  for each row execute function public.set_updated_at();

alter table public.deliverables
  add column current_version_id uuid references public.deliverable_versions(id) on delete set null,
  add column revision_limit int check (revision_limit is null or revision_limit > 0);

create table public.deliverable_comments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.deliverable_versions(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('client', 'admin')),
  body text not null check (btrim(body) <> '' and length(body) <= 5000),
  kind text not null default 'comment' check (kind in ('comment', 'decision')),
  pin_x numeric check (pin_x between 0 and 100),
  pin_y numeric check (pin_y between 0 and 100),
  created_at timestamptz not null default now(),
  constraint pin_pair check ((pin_x is null) = (pin_y is null))
);
create index deliverable_comments_version_idx on public.deliverable_comments(version_id, created_at);

create table public.comment_attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.deliverable_comments(id) on delete cascade,
  storage_path text not null unique,
  name text not null,
  size_bytes bigint check (size_bytes between 0 and 26214400),
  mime_type text,
  created_at timestamptz not null default now()
);
create index comment_attachments_comment_idx on public.comment_attachments(comment_id);

create table public.client_activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null,
  ref_table text not null,
  ref_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index client_activity_client_created_idx on public.client_activity(client_id, created_at desc);

-- Backfill: every deliverable becomes v1.
insert into public.deliverable_versions
  (deliverable_id, number, file_path, link_url, status, published_at, decided_at, decided_by, created_at)
select id, 1, file_path, link_url, status, published_at, decided_at, decided_by, created_at
from public.deliverables;

update public.deliverables d set current_version_id = v.id
from public.deliverable_versions v where v.deliverable_id = d.id and v.number = 1;

insert into public.deliverable_comments (version_id, author_id, author_role, body, kind, created_at)
select d.current_version_id, d.decided_by, 'client', btrim(d.client_feedback), 'decision', coalesce(d.decided_at, d.updated_at)
from public.deliverables d
where btrim(coalesce(d.client_feedback, '')) <> '';

insert into public.client_activity (client_id, type, ref_table, ref_id, actor_id, summary, created_at)
select p.client_id, 'version_published', 'deliverable_versions', v.id, null,
       d.title || ' v1 sent for approval', v.published_at
from public.deliverable_versions v
join public.deliverables d on d.id = v.deliverable_id
join public.projects p on p.id = d.project_id
where v.published_at is not null;

insert into public.client_activity (client_id, type, ref_table, ref_id, actor_id, summary, created_at)
select p.client_id,
       case v.status when 'approved' then 'version_approved' else 'changes_requested' end,
       'deliverable_versions', v.id, v.decided_by,
       d.title || case v.status when 'approved' then ' v1 approved' else ' v1: changes requested' end,
       v.decided_at
from public.deliverable_versions v
join public.deliverables d on d.id = v.deliverable_id
join public.projects p on p.id = d.project_id
where v.decided_at is not null and v.status in ('approved', 'changes_requested');

-- deliverables.status mirrors its current version.
create function public.mirror_version_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.deliverables
     set status = new.status
   where current_version_id = new.id and status is distinct from new.status;
  return new;
end $$;

create trigger deliverable_versions_mirror after insert or update of status on public.deliverable_versions
  for each row execute function public.mirror_version_status();

-- RLS
alter table public.deliverable_versions enable row level security;
alter table public.deliverable_comments enable row level security;
alter table public.comment_attachments enable row level security;
alter table public.client_activity enable row level security;

create function public.version_client_id(p_version_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.client_id
  from public.deliverable_versions v
  join public.deliverables d on d.id = v.deliverable_id
  join public.projects p on p.id = d.project_id
  where v.id = p_version_id and v.status <> 'draft' and not p.archived
$$;
revoke all on function public.version_client_id(uuid) from public, anon;
grant execute on function public.version_client_id(uuid) to authenticated;

create policy admin_all on public.deliverable_versions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.deliverable_comments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.comment_attachments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.client_activity for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy client_read on public.deliverable_versions for select to authenticated
  using (public.version_client_id(id) = public.auth_client_id());

create policy client_read on public.deliverable_comments for select to authenticated
  using (public.version_client_id(version_id) = public.auth_client_id());

create policy client_insert on public.deliverable_comments for insert to authenticated
  with check (
    public.version_client_id(version_id) = public.auth_client_id()
    and author_id = auth.uid()
    and author_role = 'client'
    and kind = 'comment'
  );

create policy client_read on public.comment_attachments for select to authenticated
  using (exists (
    select 1 from public.deliverable_comments c
    where c.id = comment_id and public.version_client_id(c.version_id) = public.auth_client_id()));

create policy client_insert on public.comment_attachments for insert to authenticated
  with check (exists (
    select 1 from public.deliverable_comments c
    join public.deliverable_versions v on v.id = c.version_id
    join public.deliverables d on d.id = v.deliverable_id
    where c.id = comment_id
      and c.author_id = auth.uid()
      and public.version_client_id(c.version_id) = public.auth_client_id()
      and storage_path like d.project_id::text || '/comments/' || c.id::text || '/%'));

grant select, insert, update, delete on public.deliverable_versions, public.deliverable_comments,
  public.comment_attachments, public.client_activity to authenticated;
revoke all on public.deliverable_versions, public.deliverable_comments,
  public.comment_attachments, public.client_activity from anon;
