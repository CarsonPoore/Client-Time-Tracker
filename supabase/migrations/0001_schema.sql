create type public.app_role as enum ('admin', 'team', 'client');
create type public.deliverable_status as enum ('draft', 'awaiting_approval', 'approved', 'changes_requested');
create type public.update_source as enum ('os', 'clickup');
create type public.request_kind as enum ('comment', 'request');
create type public.request_status as enum ('open', 'done');
create type public.sync_kind as enum ('webhook', 'nightly', 'manual');

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  clickup_space_id text unique,
  is_active boolean not null default true,
  contact_name text,
  contact_email text,
  quickbooks_invoices_url text,
  portal_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  client_id uuid references public.clients(id) on delete cascade,
  full_name text,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_role_has_client check ((role = 'client') = (client_id is not null))
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  clickup_list_id text unique,
  name text not null,
  status text,
  due_date date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  clickup_task_id text not null unique,
  name text not null,
  status text not null,
  status_color text,
  due_date date,
  client_visible boolean not null default false,
  clickup_url text,
  clickup_updated_at timestamptz,
  status_changed_at timestamptz not null default now(),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  description text,
  file_path text,
  link_url text,
  clickup_task_id text,
  status public.deliverable_status not null default 'draft',
  client_feedback text,
  published_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint changes_need_feedback check (status <> 'changes_requested' or btrim(coalesce(client_feedback, '')) <> '')
);

create table public.updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  body text not null check (btrim(body) <> ''),
  source public.update_source not null default 'os',
  clickup_comment_id text unique,
  author_name text,
  published_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null unique,
  name text not null,
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  deliverable_id uuid references public.deliverables(id) on delete set null,
  kind public.request_kind not null,
  body text not null check (btrim(body) <> ''),
  status public.request_status not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clickup_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind public.sync_kind not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  counts jsonb not null default '{}'::jsonb,
  error text
);

create table public.digest_sends (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  unique (client_id, week_start)
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index projects_client_id_idx on public.projects(client_id);
create index tasks_project_id_idx on public.tasks(project_id);
create index deliverables_project_id_idx on public.deliverables(project_id);
create index updates_project_id_idx on public.updates(project_id, published_at desc);
create index files_project_id_idx on public.files(project_id);
create index requests_client_id_idx on public.requests(client_id, status);
create index profiles_client_id_idx on public.profiles(client_id);
create index sync_runs_started_idx on public.sync_runs(started_at desc);

create trigger clients_updated before update on public.clients for each row execute function public.set_updated_at();
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
create trigger deliverables_updated before update on public.deliverables for each row execute function public.set_updated_at();
create trigger updates_updated before update on public.updates for each row execute function public.set_updated_at();
create trigger files_updated before update on public.files for each row execute function public.set_updated_at();
create trigger requests_updated before update on public.requests for each row execute function public.set_updated_at();

create function public.track_task_status_change() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at = now();
  end if;
  return new;
end $$;

create trigger tasks_status_changed before update on public.tasks
  for each row execute function public.track_task_status_change();

insert into storage.buckets (id, name, public) values ('project-files', 'project-files', false)
  on conflict (id) do nothing;
