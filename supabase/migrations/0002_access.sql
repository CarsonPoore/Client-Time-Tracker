create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where user_id = auth.uid()), false)
$$;

create function public.auth_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where user_id = auth.uid() and role = 'client'
$$;

create function public.project_client_id(p_project_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.projects where id = p_project_id
$$;

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.deliverables enable row level security;
alter table public.updates enable row level security;
alter table public.files enable row level security;
alter table public.requests enable row level security;
alter table public.clickup_events enable row level security;
alter table public.sync_runs enable row level security;
alter table public.digest_sends enable row level security;
alter table public.app_settings enable row level security;

create policy admin_all on public.clients for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.projects for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.tasks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.deliverables for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.updates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.files for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.clickup_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.sync_runs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.digest_sends for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy own_profile_read on public.profiles for select to authenticated
  using (user_id = auth.uid());

create policy client_read on public.clients for select to authenticated
  using (id = public.auth_client_id());

create policy client_read on public.projects for select to authenticated
  using (client_id = public.auth_client_id() and not archived);

create policy client_read on public.tasks for select to authenticated
  using (client_visible and not deleted and public.project_client_id(project_id) = public.auth_client_id());

create policy client_read on public.deliverables for select to authenticated
  using (status <> 'draft' and public.project_client_id(project_id) = public.auth_client_id());

create policy client_read on public.updates for select to authenticated
  using (published_at is not null and published_at <= now()
         and public.project_client_id(project_id) = public.auth_client_id());

create policy client_read on public.files for select to authenticated
  using (public.project_client_id(project_id) = public.auth_client_id());

create policy client_read on public.requests for select to authenticated
  using (client_id = public.auth_client_id());

create policy client_insert on public.requests for insert to authenticated
  with check (
    client_id = public.auth_client_id()
    and created_by = auth.uid()
    and status = 'open'
    and (project_id is null or public.project_client_id(project_id) = client_id)
    and (deliverable_id is null or exists (
      select 1 from public.deliverables d
      where d.id = deliverable_id and public.project_client_id(d.project_id) = client_id))
  );

create function public.decide_deliverable(
  p_id uuid, p_decision public.deliverable_status, p_feedback text
) returns public.deliverables
language plpgsql security definer set search_path = public as $$
declare
  d public.deliverables;
begin
  select * into d from public.deliverables where id = p_id for update;
  if not found
     or d.status = 'draft'
     or public.project_client_id(d.project_id) is distinct from public.auth_client_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if d.status <> 'awaiting_approval' then
    raise exception 'not_awaiting_approval' using errcode = 'P0001';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_decision = 'changes_requested' and btrim(coalesce(p_feedback, '')) = '' then
    raise exception 'feedback_required' using errcode = 'P0001';
  end if;

  update public.deliverables
     set status = p_decision,
         client_feedback = nullif(btrim(coalesce(p_feedback, '')), ''),
         decided_at = now(),
         decided_by = auth.uid()
   where id = p_id
  returning * into d;
  return d;
end $$;

revoke all on function public.decide_deliverable(uuid, public.deliverable_status, text) from public, anon;
grant execute on function public.decide_deliverable(uuid, public.deliverable_status, text) to authenticated;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
