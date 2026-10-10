-- Release 2: manual time entries. Admin-only; clients never see raw entries.
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  work_date date not null,
  minutes integer not null check (minutes > 0 and minutes <= 1440 and minutes % 15 = 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index time_entries_date_idx on public.time_entries (work_date);
create index time_entries_client_idx on public.time_entries (client_id, work_date);
create index time_entries_project_idx on public.time_entries (project_id);

-- A project on an entry must belong to the entry's client.
create function public.check_time_entry_project() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects where id = new.project_id and client_id = new.client_id
  ) then
    raise exception 'Project does not belong to this client' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.check_time_entry_project() from public, anon, authenticated;

create trigger time_entries_project_check before insert or update on public.time_entries
  for each row execute function public.check_time_entry_project();
create trigger time_entries_updated before update on public.time_entries
  for each row execute function public.set_updated_at();

alter table public.time_entries enable row level security;
create policy admin_all on public.time_entries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
