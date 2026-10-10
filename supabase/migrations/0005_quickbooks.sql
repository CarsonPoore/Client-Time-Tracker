-- Release 2: read-only QuickBooks customer link.
-- Each client can point at one QuickBooks customer. The name is a snapshot for display.
alter table public.clients
  add column quickbooks_customer_id text unique,
  add column quickbooks_customer_name text;

-- One QuickBooks company per install. Tokens are server-only: RLS on, no policies,
-- and no grants to signed-in or anonymous users, so only the service role can read them.
create table public.quickbooks_connection (
  id boolean primary key default true check (id),
  realm_id text not null,
  company_name text,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.quickbooks_connection enable row level security;
revoke all on public.quickbooks_connection from public, anon, authenticated;
create trigger quickbooks_connection_updated before update on public.quickbooks_connection
  for each row execute function public.set_updated_at();
