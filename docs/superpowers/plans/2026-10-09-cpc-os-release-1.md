# CPC OS Release 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Carson Poore Consulting OS foundation and client portal: admin and client logins, clients and projects mirrored from ClickUp, deliverables with client approval, an updates feed, files, client requests, and email notifications plus a weekly digest.

**Architecture:** Next.js 15 App Router app on Vercel backed by Supabase (Postgres with row-level security, Auth, Storage). ClickUp is the source of truth for projects and tasks. A sync engine copies client spaces, lists and tasks into Postgres through a webhook plus a nightly reconcile, so the portal reads only from the OS database. Pure logic (mapping, signatures, digest building, email templates) lives in small modules with unit tests; database access rules are tested with PGlite (in-process Postgres) because Docker is not available on this machine.

**Tech Stack:** Next.js 15.5.27, React 19.3.0, TypeScript 5.9.3, Tailwind CSS 4.3.3, @supabase/ssr 0.12.7, @supabase/supabase-js 2.117.3, Resend 6.32.1, Zod 4.6.5, Vitest 5.0.3, @electric-sql/pglite 0.5.8, Playwright 1.64.0, @axe-core/playwright 4.13.0.

**Spec:** `docs/superpowers/specs/2026-10-09-cpc-os-release-1-design.md`

## Global Constraints

- All dependency versions are pinned exactly (no `^`, no `~`, no `latest`).
- Roles: `admin`, `team` (exists, unused in Release 1), `client`. No `pending` role; users without a profile have no access.
- Admin login is Google only and only for emails in `ADMIN_EMAILS` (comma-separated, case-insensitive).
- Client login is email and password, invite only, one login per client. Public sign-up is disabled in Supabase.
- ClickUp mapping: space = client, list = project. Space `Carson Poore Consulting` is not a client by default.
- Client visibility comes from the ClickUp checkbox custom field named exactly `Client visible`. Missing or unchecked means hidden.
- Comments whose text starts with `#client` (case-insensitive, leading whitespace ignored) become portal updates with the marker removed.
- The OS never creates, edits or deletes ClickUp tasks. It only posts comments.
- The portal reads only from the OS database, never live from ClickUp.
- Brand: Midnight Navy `#0b1b33`, Royal Blue `#1e4fd8` (actions), Warm Gold `#e0a030` (sparse emphasis only), Off White `#f8f7f4`, Pale Grey `#eaedf1`. Figtree is the only typeface. No gradients. Light and dark themes follow `prefers-color-scheme`.
- Weekly digest: Mondays 08:00 Eastern. Nightly reconcile: 03:00 Eastern.
- Storage bucket `project-files` is private. Only the server (service role) touches it; clients get short-lived signed URLs after an RLS-checked read.
- Uploads go browser → Supabase Storage via signed upload URLs (Vercel caps request bodies at 4.5 MB).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. The same ClickUp webhook delivered twice is processed once. Test: `tests/unit/webhook.test.ts` "ignores duplicate deliveries" (Task 6).
2. A webhook with a missing or wrong `X-Signature` is rejected with 401 and changes nothing. Test: `tests/unit/clickup-signature.test.ts` and `tests/unit/webhook.test.ts` "rejects bad signature" (Tasks 5, 6).
3. A client's feedback or request text containing HTML (`<script>`, `<img onerror>`) is escaped in every email. Test: `tests/unit/email-templates.test.ts` "escapes client text" (Task 10).
4. "Request changes" with empty or whitespace-only feedback is refused by the database, not just the form. Test: `tests/db/rls.test.ts` "decide_deliverable requires feedback for changes" (Task 2).
5. A task moved out of a client space, deleted, or with `Client visible` unticked disappears from the portal on the next event. Tests: `tests/unit/sync.test.ts` "hides task moved to a non-client space" and `tests/unit/clickup-mapping.test.ts` "treats string and boolean checkbox values" (Tasks 5, 6).

---

## File Structure

```
package.json, tsconfig.json, next.config.ts, postcss.config.mjs, vitest.config.ts,
playwright.config.ts, vercel.json, .env.example, .gitignore, README.md
supabase/migrations/0001_schema.sql        tables, enums, triggers, indexes
supabase/migrations/0002_access.sql        RLS helpers, policies, grants, decide_deliverable RPC
public/brand/*.svg                          CPC logo files
src/middleware.ts                           session refresh + route guarding
src/app/globals.css                         Tailwind + CPC tokens, light/dark
src/app/layout.tsx                          root layout, Figtree
src/app/page.tsx                            redirect by role
src/app/login/{page.tsx,actions.ts,google-button.tsx}
src/app/auth/callback/route.ts              OAuth code exchange + admin allowlist
src/app/auth/confirm/route.ts               invite / recovery token verification
src/app/set-password/{page.tsx,actions.ts}
src/app/forgot-password/{page.tsx,actions.ts}
src/app/admin/layout.tsx, page.tsx, actions.ts
src/app/admin/clients/page.tsx, clients/[id]/page.tsx
src/app/admin/projects/[id]/page.tsx
src/app/admin/settings/page.tsx
src/app/portal/layout.tsx, page.tsx, actions.ts
src/app/portal/projects/[id]/page.tsx
src/app/portal/deliverables/[id]/page.tsx
src/app/portal/account/page.tsx
src/app/api/clickup/webhook/route.ts
src/app/api/cron/reconcile/route.ts
src/app/api/cron/digest/route.ts
src/components/ui.tsx                       Button, Card, StatusPill, Field, PageHeader, EmptyState
src/components/shell.tsx                    AppShell (nav + logo)
src/components/file-uploader.tsx            client-side signed-URL uploader
src/lib/env.ts                              Zod-validated env
src/lib/types.ts                            row types
src/lib/auth.ts                             homeForRole, isAdminEmail, getViewer, requireAdmin, requireClient
src/lib/supabase/{server.ts,browser.ts,admin.ts,middleware.ts}
src/lib/clickup/types.ts, client.ts, mapping.ts, signature.ts
src/lib/sync/engine.ts                      reconcile + per-event sync against a SyncStore
src/lib/sync/store.ts                       Supabase implementation of SyncStore
src/lib/sync/webhook.ts                     processWebhook (signature, idempotency, dispatch)
src/lib/sync/runs.ts                        withSyncRun logger
src/lib/email/{send.ts,templates.ts,digest.ts,notify.ts}
src/lib/storage.ts                          bucket name, path builders, signed URLs
tests/db/harness.ts, tests/db/rls.test.ts
tests/unit/*.test.ts
e2e/portal.spec.ts, e2e/seed.ts
```

---

### Task 1: Project scaffold, brand theme, env

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/globals.css`, `src/app/layout.tsx`, `src/lib/env.ts`, `public/brand/*`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Produces: `publicEnv: { NEXT_PUBLIC_SUPABASE_URL: string; NEXT_PUBLIC_SUPABASE_ANON_KEY: string }`, `serverEnv(): ServerEnv` (lazy, throws listing missing keys), `parseServerEnv(input: Record<string, string | undefined>): ServerEnv`. Tailwind color utilities `bg-bg`, `bg-surface`, `bg-surface-2`, `text-fg`, `text-muted`, `border-line`, `bg-navy`, `bg-royal`, `text-gold`.

- [ ] **Step 1: Write config files**

`package.json`:
```json
{
  "name": "cpc-os",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@supabase/ssr": "0.12.7",
    "@supabase/supabase-js": "2.117.3",
    "next": "15.5.27",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "resend": "6.32.1",
    "server-only": "0.0.1",
    "zod": "4.6.5"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.13.0",
    "@electric-sql/pglite": "0.5.8",
    "@playwright/test": "1.64.0",
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "22.20.5",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "tailwindcss": "4.3.3",
    "typescript": "5.9.3",
    "vitest": "5.0.3"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2023"],
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "skipLibCheck": true,
    "allowJs": false,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
};

export default config;
```

`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"], environment: "node", testTimeout: 30000 },
});
```

`.gitignore`:
```
node_modules
.next
.env*.local
.env
.DS_Store
test-results
playwright-report
*.tsbuildinfo
next-env.d.ts
```

`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://uzmbzvnswhhdtsmdbelg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAILS=carsonpoore@gmail.com
CLICKUP_API_TOKEN=
CLICKUP_TEAM_ID=90141141695
RESEND_API_KEY=
EMAIL_FROM=Carson Poore Consulting <os@carsonpoore.com>
CRON_SECRET=
APP_URL=https://os.carsonpoore.com
```

- [ ] **Step 2: Install and copy brand assets**

Run:
```bash
npm install
mkdir -p public/brand && cp ~/.claude/skills/carson-poore-consulting-brand/assets/*.svg public/brand/
```
Expected: install succeeds, `public/brand` holds six SVGs.

- [ ] **Step 3: Write the failing env test**

`tests/unit/env.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const full = {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  ADMIN_EMAILS: "Carson@Example.com, other@example.com",
  CLICKUP_API_TOKEN: "pk_1",
  CLICKUP_TEAM_ID: "123",
  RESEND_API_KEY: "re_1",
  EMAIL_FROM: "CPC <os@example.com>",
  CRON_SECRET: "s",
  APP_URL: "https://os.example.com/",
};

describe("parseServerEnv", () => {
  it("parses a complete env and normalizes values", () => {
    const env = parseServerEnv(full);
    expect(env.ADMIN_EMAILS).toEqual(["carson@example.com", "other@example.com"]);
    expect(env.APP_URL).toBe("https://os.example.com");
  });

  it("lists every missing key in the error", () => {
    expect(() => parseServerEnv({ ...full, CLICKUP_API_TOKEN: undefined, CRON_SECRET: "" }))
      .toThrow(/CLICKUP_API_TOKEN.*CRON_SECRET|CRON_SECRET.*CLICKUP_API_TOKEN/s);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run tests/unit/env.test.ts`
Expected: FAIL, cannot resolve `@/lib/env`.

- [ ] **Step 5: Implement env**

`src/lib/env.ts`:
```ts
import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  ADMIN_EMAILS: nonEmpty.transform((v) =>
    v.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  ),
  CLICKUP_API_TOKEN: nonEmpty,
  CLICKUP_TEAM_ID: nonEmpty,
  RESEND_API_KEY: nonEmpty,
  EMAIL_FROM: nonEmpty,
  CRON_SECRET: nonEmpty,
  APP_URL: z.url().transform((v) => v.replace(/\/+$/, "")),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(input: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(input);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Missing or invalid environment variables: ${keys.join(", ")}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run tests/unit/env.test.ts`
Expected: 2 passed.

- [ ] **Step 7: Theme and root layout**

`src/app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-navy: #0b1b33;
  --color-royal: #1e4fd8;
  --color-royal-hover: #1a44bb;
  --color-gold: #e0a030;
  --color-offwhite: #f8f7f4;
  --color-palegrey: #eaedf1;
  --font-sans: var(--font-figtree), ui-sans-serif, system-ui, sans-serif;
}

:root {
  --bg: #f8f7f4;
  --surface: #ffffff;
  --surface-2: #eaedf1;
  --fg: #0b1b33;
  --muted: #4a5568;
  --line: #d7dce3;
  --ok: #157347;
  --warn: #9a6400;
  --danger: #b42318;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b1b33;
    --surface: #10244a;
    --surface-2: #17305c;
    --fg: #f8f7f4;
    --muted: #a9b4c4;
    --line: #24406e;
    --ok: #5fd39a;
    --warn: #e0a030;
    --danger: #ff8a7a;
    color-scheme: dark;
  }
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-fg: var(--fg);
  --color-muted: var(--muted);
  --color-line: var(--line);
  --color-ok: var(--ok);
  --color-warn: var(--warn);
  --color-danger: var(--danger);
}

body {
  background: var(--bg);
  color: var(--fg);
}

:focus-visible {
  outline: 2px solid var(--color-royal);
  outline-offset: 2px;
}
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", weight: ["400", "600", "700", "900"] });

export const metadata: Metadata = {
  title: { default: "CPC OS", template: "%s · CPC OS" },
  description: "Carson Poore Consulting client portal and operating system.",
  icons: { icon: "/brand/cpc-mark-royalblue.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add -A && git commit -m "feat: scaffold Next.js app with CPC theme and env validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database schema, access rules, PGlite tests

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `supabase/migrations/0002_access.sql`, `tests/db/harness.ts`
- Test: `tests/db/rls.test.ts`

**Interfaces:**
- Produces tables `clients`, `profiles`, `projects`, `tasks`, `deliverables`, `updates`, `files`, `requests`, `clickup_events`, `sync_runs`, `digest_sends`, `app_settings`; enums `app_role`, `deliverable_status`, `update_source`, `request_kind`, `request_status`, `sync_kind`; functions `public.is_admin()`, `public.auth_client_id()`, `public.project_client_id(uuid)`, `public.decide_deliverable(p_id uuid, p_decision deliverable_status, p_feedback text) returns deliverables`. `tasks.status_changed_at` is maintained by trigger.
- Test harness: `createDb(): Promise<PGlite>`, `asUser(db, userId | null, fn)`.

- [ ] **Step 1: Write the schema migration**

`supabase/migrations/0001_schema.sql`:
```sql
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
```

- [ ] **Step 2: Write the access migration**

`supabase/migrations/0002_access.sql`:
```sql
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
  if not found or public.project_client_id(d.project_id) is distinct from public.auth_client_id() then
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
```

- [ ] **Step 3: Write the PGlite harness**

`tests/db/harness.ts`:
```ts
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
`;

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(process.cwd(), "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    return fn(tx);
  });
}
```

- [ ] **Step 4: Write the failing RLS tests**

`tests/db/rls.test.ts`:
```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDb } from "./harness";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ALICE = "00000000-0000-0000-0000-0000000000a1";
const BOB = "00000000-0000-0000-0000-0000000000b1";
const STRANGER = "00000000-0000-0000-0000-0000000000c1";
const CLIENT_A = "10000000-0000-0000-0000-00000000000a";
const CLIENT_B = "10000000-0000-0000-0000-00000000000b";
const PROJ_A = "20000000-0000-0000-0000-00000000000a";
const PROJ_B = "20000000-0000-0000-0000-00000000000b";
const DEL_AWAIT = "30000000-0000-0000-0000-000000000001";
const DEL_DRAFT = "30000000-0000-0000-0000-000000000002";
const DEL_B = "30000000-0000-0000-0000-000000000003";

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@x.com'), ('${ALICE}', 'alice@a.com'), ('${BOB}', 'bob@b.com'), ('${STRANGER}', 's@x.com');
    insert into clients (id, name) values ('${CLIENT_A}', 'A Co'), ('${CLIENT_B}', 'B Co');
    insert into profiles (user_id, role, client_id, email) values
      ('${ADMIN}', 'admin', null, 'admin@x.com'),
      ('${ALICE}', 'client', '${CLIENT_A}', 'alice@a.com'),
      ('${BOB}', 'client', '${CLIENT_B}', 'bob@b.com');
    insert into projects (id, client_id, name) values ('${PROJ_A}', '${CLIENT_A}', 'Site'), ('${PROJ_B}', '${CLIENT_B}', 'Brand');
    insert into projects (client_id, name, archived) values ('${CLIENT_A}', 'Old', true);
    insert into tasks (project_id, clickup_task_id, name, status, client_visible) values
      ('${PROJ_A}', 't1', 'Visible', 'open', true),
      ('${PROJ_A}', 't2', 'Hidden', 'open', false),
      ('${PROJ_B}', 't3', 'B task', 'open', true);
    insert into tasks (project_id, clickup_task_id, name, status, client_visible, deleted) values
      ('${PROJ_A}', 't4', 'Deleted', 'open', true, true);
    insert into deliverables (id, project_id, title, status) values
      ('${DEL_AWAIT}', '${PROJ_A}', 'Homepage', 'awaiting_approval'),
      ('${DEL_DRAFT}', '${PROJ_A}', 'Draft', 'draft'),
      ('${DEL_B}', '${PROJ_B}', 'B logo', 'awaiting_approval');
    insert into updates (project_id, body) values ('${PROJ_A}', 'A update'), ('${PROJ_B}', 'B update');
    insert into updates (project_id, body, published_at) values ('${PROJ_A}', 'Unpublished', null);
    insert into sync_runs (kind, ok) values ('manual', true);
  `);
});

const names = (rows: { name?: string; title?: string; body?: string }[]) =>
  rows.map((r) => r.name ?? r.title ?? r.body).sort();

describe("client isolation", () => {
  it("client sees only their own client row", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ name: string }>("select name from clients"));
    expect(names(rows.rows)).toEqual(["A Co"]);
  });

  it("client sees only own non-archived projects", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ name: string }>("select name from projects"));
    expect(names(rows.rows)).toEqual(["Site"]);
  });

  it("client sees only visible, non-deleted tasks of own projects", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ name: string }>("select name from tasks"));
    expect(names(rows.rows)).toEqual(["Visible"]);
  });

  it("client never sees drafts or other clients' deliverables", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ title: string }>("select title from deliverables"));
    expect(names(rows.rows)).toEqual(["Homepage"]);
  });

  it("client sees only published updates of own projects", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ body: string }>("select body from updates"));
    expect(names(rows.rows)).toEqual(["A update"]);
  });

  it("client cannot read internal tables", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query("select * from sync_runs"));
    expect(rows.rows).toHaveLength(0);
  });

  it("user without a profile sees nothing", async () => {
    const rows = await asUser(db, STRANGER, (tx) => tx.query("select * from projects"));
    expect(rows.rows).toHaveLength(0);
  });

  it("anonymous cannot read tables", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select * from clients"))).rejects.toThrow(/permission denied/);
  });

  it("admin sees everything", async () => {
    const rows = await asUser(db, ADMIN, (tx) => tx.query("select * from tasks"));
    expect(rows.rows).toHaveLength(4);
  });
});

describe("privilege escalation", () => {
  it("client cannot promote themselves", async () => {
    const res = await asUser(db, ALICE, (tx) =>
      tx.query("update profiles set role = 'admin', client_id = null where user_id = $1 returning *", [ALICE]));
    expect(res.rows).toHaveLength(0);
  });

  it("client cannot update a deliverable directly", async () => {
    const res = await asUser(db, ALICE, (tx) =>
      tx.query("update deliverables set status = 'approved' where id = $1 returning *", [DEL_AWAIT]));
    expect(res.rows).toHaveLength(0);
  });
});

describe("requests", () => {
  it("client can file a request for own project", async () => {
    const res = await asUser(db, ALICE, (tx) =>
      tx.query("insert into requests (client_id, project_id, kind, body, created_by) values ($1, $2, 'request', 'New page', $3) returning id",
        [CLIENT_A, PROJ_A, ALICE]));
    expect(res.rows).toHaveLength(1);
  });

  it("client cannot file a request against another client's project", async () => {
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("insert into requests (client_id, project_id, kind, body, created_by) values ($1, $2, 'request', 'x', $3)",
        [CLIENT_A, PROJ_B, ALICE]))).rejects.toThrow(/row-level security/);
  });

  it("client cannot file a request as another client", async () => {
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("insert into requests (client_id, kind, body, created_by) values ($1, 'comment', 'x', $2)",
        [CLIENT_B, ALICE]))).rejects.toThrow(/row-level security/);
  });
});

describe("decide_deliverable", () => {
  it("decide_deliverable requires feedback for changes", async () => {
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("select * from decide_deliverable($1, 'changes_requested', '   ')", [DEL_AWAIT])))
      .rejects.toThrow(/feedback_required/);
  });

  it("client cannot decide another client's deliverable", async () => {
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("select * from decide_deliverable($1, 'approved', null)", [DEL_B]))).rejects.toThrow(/not_found/);
  });

  it("client cannot decide a draft", async () => {
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("select * from decide_deliverable($1, 'approved', null)", [DEL_DRAFT]))).rejects.toThrow(/not_found/);
  });

  it("client approves own awaiting deliverable once", async () => {
    const res = await asUser(db, ALICE, (tx) =>
      tx.query<{ status: string; decided_by: string }>("select * from decide_deliverable($1, 'approved', null)", [DEL_AWAIT]));
    expect(res.rows[0]).toMatchObject({ status: "approved", decided_by: ALICE });
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("select * from decide_deliverable($1, 'approved', null)", [DEL_AWAIT]))).rejects.toThrow(/not_awaiting_approval/);
  });
});

describe("task status tracking", () => {
  it("bumps status_changed_at only when status changes", async () => {
    await db.exec("update tasks set status_changed_at = '2020-01-01' where clickup_task_id = 't1'");
    await db.exec("update tasks set name = 'Visible!' where clickup_task_id = 't1'");
    let r = await db.query<{ status_changed_at: Date }>("select status_changed_at from tasks where clickup_task_id = 't1'");
    expect(r.rows[0].status_changed_at.getUTCFullYear()).toBe(2020);
    await db.exec("update tasks set status = 'done' where clickup_task_id = 't1'");
    r = await db.query<{ status_changed_at: Date }>("select status_changed_at from tasks where clickup_task_id = 't1'");
    expect(r.rows[0].status_changed_at.getUTCFullYear()).toBeGreaterThan(2020);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/db`
Expected: all pass. If a test fails, fix the SQL, not the test, unless the test contradicts the spec.

- [ ] **Step 6: Commit**

```bash
git add supabase tests/db && git commit -m "feat: database schema and access rules with PGlite tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Supabase clients, auth, login, shells and UI kit

**Files:**
- Create: `src/lib/types.ts`, `src/lib/auth.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`, `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/login/google-button.tsx`, `src/app/auth/callback/route.ts`, `src/app/auth/confirm/route.ts`, `src/app/set-password/page.tsx`, `src/app/set-password/actions.ts`, `src/app/forgot-password/page.tsx`, `src/app/forgot-password/actions.ts`, `src/components/ui.tsx`, `src/components/shell.tsx`, `src/app/admin/layout.tsx`, `src/app/portal/layout.tsx`
- Test: `tests/unit/auth.test.ts`

**Interfaces:**
- Consumes: `serverEnv()`, `publicEnv` (Task 1).
- Produces:
  - `type Role = "admin" | "team" | "client"`; row types in `src/lib/types.ts`.
  - `homeForRole(role: Role | null): string`, `isAdminEmail(email: string | null | undefined, allow: string[]): boolean`, `safeNext(next: string | null): string | null`.
  - `getViewer(): Promise<Viewer | null>` where `Viewer = { userId: string; email: string; role: Role; clientId: string | null; fullName: string | null }`; `requireAdmin(): Promise<Viewer>`; `requireClient(): Promise<Viewer & { clientId: string }>`.
  - `createClient()` (server, RLS, cookie session), `createBrowserSupabase()`, `createAdminClient()` (service role, server only).
  - UI: `Button`, `LinkButton`, `Card`, `StatusPill`, `Field`, `Input`, `Textarea`, `PageHeader`, `EmptyState`, `FormMessage`; `AppShell({ area, nav, userLabel, children })`.

- [ ] **Step 1: Write the failing auth helper tests**

`tests/unit/auth.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { homeForRole, isAdminEmail, safeNext } = await import("@/lib/auth");

describe("homeForRole", () => {
  it("routes each role", () => {
    expect(homeForRole("admin")).toBe("/admin");
    expect(homeForRole("client")).toBe("/portal");
    expect(homeForRole("team")).toBe("/login?error=no_access");
    expect(homeForRole(null)).toBe("/login?error=no_access");
  });
});

describe("isAdminEmail", () => {
  it("matches case-insensitively and trims", () => {
    expect(isAdminEmail(" Carson@Example.com ", ["carson@example.com"])).toBe(true);
    expect(isAdminEmail("eve@example.com", ["carson@example.com"])).toBe(false);
    expect(isAdminEmail(undefined, ["carson@example.com"])).toBe(false);
  });
});

describe("safeNext", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/portal/account")).toBe("/portal/account");
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/auth.test.ts`
Expected: FAIL, cannot resolve `@/lib/auth`.

- [ ] **Step 3: Types and Supabase clients**

`src/lib/types.ts`:
```ts
export type Role = "admin" | "team" | "client";
export type DeliverableStatus = "draft" | "awaiting_approval" | "approved" | "changes_requested";

export interface ClientRow {
  id: string; name: string; clickup_space_id: string | null; is_active: boolean;
  contact_name: string | null; contact_email: string | null; quickbooks_invoices_url: string | null;
  portal_user_id: string | null; created_at: string;
}
export interface ProjectRow {
  id: string; client_id: string; clickup_list_id: string | null; name: string;
  status: string | null; due_date: string | null; archived: boolean;
}
export interface TaskRow {
  id: string; project_id: string; clickup_task_id: string; name: string; status: string;
  status_color: string | null; due_date: string | null; client_visible: boolean;
  clickup_url: string | null; status_changed_at: string; deleted: boolean;
}
export interface DeliverableRow {
  id: string; project_id: string; title: string; description: string | null;
  file_path: string | null; link_url: string | null; clickup_task_id: string | null;
  status: DeliverableStatus; client_feedback: string | null; published_at: string | null;
  decided_at: string | null; created_at: string;
}
export interface UpdateRow {
  id: string; project_id: string; body: string; source: "os" | "clickup";
  author_name: string | null; published_at: string | null;
}
export interface FileRow {
  id: string; project_id: string; storage_path: string; name: string;
  size_bytes: number | null; mime_type: string | null; created_at: string;
}
export interface RequestRow {
  id: string; client_id: string; project_id: string | null; deliverable_id: string | null;
  kind: "comment" | "request"; body: string; status: "open" | "done"; created_at: string;
}
export interface SyncRunRow {
  id: string; kind: "webhook" | "nightly" | "manual"; started_at: string;
  finished_at: string | null; ok: boolean | null; counts: Record<string, number>; error: string | null;
}
```

`src/lib/supabase/server.ts`:
```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; middleware refreshes the session instead.
        }
      },
    },
  });
}
```

`src/lib/supabase/browser.ts`:
```ts
"use client";
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

`src/lib/supabase/admin.ts`:
```ts
import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

let admin: SupabaseClient | undefined;

export function createAdminClient(): SupabaseClient {
  const env = serverEnv();
  admin ??= createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
```

`src/lib/supabase/middleware.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth", "/forgot-password", "/api/clickup/webhook", "/api/cron"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
```

`src/middleware.ts`:
```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|favicon.ico).*)"],
};
```

- [ ] **Step 4: Auth helpers**

`src/lib/auth.ts`:
```ts
import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export interface Viewer {
  userId: string;
  email: string;
  role: Role;
  clientId: string | null;
  fullName: string | null;
}

export function homeForRole(role: Role | null): string {
  if (role === "admin") return "/admin";
  if (role === "client") return "/portal";
  return "/login?error=no_access";
}

export function isAdminEmail(email: string | null | undefined, allow: string[]): boolean {
  if (!email) return false;
  return allow.includes(email.trim().toLowerCase());
}

export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id, full_name, email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return null;
  return {
    userId: user.id,
    email: profile.email,
    role: profile.role as Role,
    clientId: profile.client_id,
    fullName: profile.full_name,
  };
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "admin") redirect(homeForRole(viewer.role));
  return viewer;
}

export async function requireClient(): Promise<Viewer & { clientId: string }> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "client" || !viewer.clientId) redirect(homeForRole(viewer.role));
  return viewer as Viewer & { clientId: string };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/unit/auth.test.ts`
Expected: 3 passed.

- [ ] **Step 6: UI kit and shell**

`src/components/ui.tsx`:
```tsx
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnVariants = {
  primary: "bg-royal text-white hover:bg-royal-hover",
  secondary: "border border-line bg-surface text-fg hover:bg-surface-2",
  danger: "border border-danger text-danger hover:bg-surface-2",
} as const;
type Variant = keyof typeof btnVariants;

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${btnBase} ${btnVariants[variant]} ${className}`} {...props} />;
}

export function LinkButton({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${btnBase} ${btnVariants[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-xl border border-line bg-surface p-5 shadow-sm ${className}`} {...props} />;
}

const pillTones: Record<string, string> = {
  draft: "bg-surface-2 text-muted",
  awaiting_approval: "bg-royal/10 text-royal dark:text-blue-300",
  approved: "bg-ok/15 text-ok",
  changes_requested: "bg-warn/15 text-warn",
  open: "bg-royal/10 text-royal dark:text-blue-300",
  done: "bg-ok/15 text-ok",
};
const pillLabels: Record<string, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  changes_requested: "Changes requested",
  open: "Open",
  done: "Done",
};

export function StatusPill({ status, color }: { status: string; color?: string | null }) {
  const tone = pillTones[status] ?? "bg-surface-2 text-fg";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {color ? <span aria-hidden className="size-2 rounded-full" style={{ background: color }} /> : null}
      {pillLabels[status] ?? status}
    </span>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={4} {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-widest text-muted">{eyebrow}</p> : null}
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="font-semibold">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
    </div>
  );
}

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (success) return <p role="status" className="text-sm text-ok">{success}</p>;
  return null;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const d = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}
```

`src/components/shell.tsx`:
```tsx
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({
  area, nav, userLabel, children,
}: { area: "admin" | "portal"; nav: { href: string; label: string }[]; userLabel: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="bg-navy text-offwhite">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
          <Link href={area === "admin" ? "/admin" : "/portal"} className="flex items-center gap-3">
            <Image src="/brand/cpc-lockup-white.svg" alt="Carson Poore Consulting" width={160} height={32} priority />
            {area === "admin" ? <span className="text-xs font-semibold uppercase tracking-widest text-gold">OS</span> : null}
          </Link>
          <nav aria-label="Main" className="flex flex-1 flex-wrap gap-1">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md px-3 py-1.5 text-sm font-semibold text-offwhite/80 hover:bg-white/10 hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-offwhite/70">{userLabel}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-md px-3 py-1.5 font-semibold hover:bg-white/10">Sign out</button>
            </form>
          </div>
        </div>
        <div aria-hidden className="h-1 w-24 bg-gold" />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
```

Add `src/app/auth/signout/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
```

- [ ] **Step 7: Login, callback, confirm, password pages**

`src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getViewer, homeForRole } from "@/lib/auth";

export default async function Home() {
  const viewer = await getViewer();
  redirect(viewer ? homeForRole(viewer.role) : "/login");
}
```

`src/app/login/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

const schema = z.object({ email: z.email(), password: z.string().min(1) });

export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "That email and password don't match. Try again or reset your password." };
  redirect("/");
}
```

`src/app/login/google-button.tsx`:
```tsx
"use client";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui";

export function GoogleButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      onClick={() =>
        createBrowserSupabase().auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        })
      }
    >
      Continue with Google
    </Button>
  );
}
```

`src/app/login/page.tsx`:
```tsx
"use client";
import Image from "next/image";
import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { GoogleButton } from "./google-button";
import { signInWithPassword, type LoginState } from "./actions";

const errors: Record<string, string> = {
  no_access: "That account doesn't have access. Contact Carson if you think this is a mistake.",
  link_expired: "That link has expired. Request a new one below.",
};

function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPassword, { error: null });
  const urlError = errors[params.get("error") ?? ""] ?? null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy p-12 text-offwhite lg:flex lg:flex-col lg:justify-between">
        <Image src="/brand/cpc-lockup-white.svg" alt="Carson Poore Consulting" width={200} height={40} priority />
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-offwhite/60">Client portal</p>
          <h1 className="mt-3 max-w-md text-5xl font-black leading-tight">
            Your project, <span className="text-gold">in one place.</span>
          </h1>
        </div>
        <Image aria-hidden src="/brand/cpc-mark-offwhite.svg" alt="" width={520} height={520}
          className="pointer-events-none absolute -right-24 -bottom-24 opacity-[0.06]" />
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <Image src="/brand/cpc-mark-royalblue.svg" alt="" width={40} height={40} className="lg:hidden" />
          <h2 className="text-2xl font-black">Sign in</h2>
          <FormMessage error={state.error ?? urlError} />
          <form action={action} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>
            <Button type="submit" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
          </form>
          <Link href="/forgot-password" className="block text-sm font-semibold text-royal">Forgot your password?</Link>
          <div className="border-t border-line pt-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Carson Poore Consulting team</p>
            <GoogleButton />
          </div>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
```

`src/app/auth/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { homeForRole, isAdminEmail } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import type { Role } from "@/lib/types";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=link_expired`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=link_expired`);
  const user = data.user;
  const admin = createAdminClient();

  const { data: profile } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  let role = (profile?.role as Role | undefined) ?? null;

  if (!role && user.app_metadata.provider === "google") {
    if (isAdminEmail(user.email, serverEnv().ADMIN_EMAILS)) {
      await admin.from("profiles").insert({
        user_id: user.id, role: "admin", email: user.email!, full_name: user.user_metadata.full_name ?? null,
      });
      role = "admin";
    } else {
      await supabase.auth.signOut();
      await admin.auth.admin.deleteUser(user.id);
      return NextResponse.redirect(`${origin}/login?error=no_access`);
    }
  }

  if (!role) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_access`);
  }
  return NextResponse.redirect(`${origin}${homeForRole(role)}`);
}
```

`src/app/auth/confirm/route.ts` (invite and password-recovery links):
```ts
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(`${origin}/login?error=link_expired`);
  return NextResponse.redirect(`${origin}/set-password`);
}
```

`src/app/set-password/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PasswordState = { error: string | null };

const schema = z
  .object({ password: z.string().min(10, "Use at least 10 characters."), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match.", path: ["confirm"] });

export async function setPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const parsed = schema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Couldn't save your password. Your link may have expired." };
  redirect("/");
}
```

`src/app/set-password/page.tsx`:
```tsx
"use client";
import { useActionState } from "react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { setPassword, type PasswordState } from "./actions";

export default function SetPasswordPage() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, { error: null });
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form action={action} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-black">Set your password</h1>
        <FormMessage error={state.error} />
        <Field label="New password" htmlFor="password" hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>Save password</Button>
      </form>
    </div>
  );
}
```

`src/app/forgot-password/actions.ts`:
```ts
"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ForgotState = { error: string | null; sent: boolean };

export async function requestReset(_prev: ForgotState, form: FormData): Promise<ForgotState> {
  const parsed = z.email().safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email.", sent: false };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data);
  return { error: null, sent: true };
}
```

`src/app/forgot-password/page.tsx`:
```tsx
"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { requestReset, type ForgotState } from "./actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestReset, { error: null, sent: false });
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form action={action} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-black">Reset your password</h1>
        <FormMessage error={state.error} success={state.sent ? "If that email has an account, a reset link is on its way." : null} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>Send reset link</Button>
        <Link href="/login" className="block text-sm font-semibold text-royal">Back to sign in</Link>
      </form>
    </div>
  );
}
```

The reset email always returns the same message so it cannot be used to discover which emails have accounts.

- [ ] **Step 8: Area layouts**

`src/app/admin/layout.tsx`:
```tsx
import { AppShell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdmin();
  return (
    <AppShell area="admin" userLabel={viewer.fullName ?? viewer.email}
      nav={[
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/clients", label: "Clients" },
        { href: "/admin/settings", label: "Settings" },
      ]}>
      {children}
    </AppShell>
  );
}
```

`src/app/portal/layout.tsx`:
```tsx
import { AppShell } from "@/components/shell";
import { requireClient } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireClient();
  return (
    <AppShell area="portal" userLabel={viewer.email}
      nav={[{ href: "/portal", label: "Overview" }, { href: "/portal/account", label: "Account" }]}>
      {children}
    </AppShell>
  );
}
```

Create placeholder pages so the build passes: `src/app/admin/page.tsx` and `src/app/portal/page.tsx` each `export default function Page() { return null; }` (replaced in Tasks 7 and 9).

- [ ] **Step 9: Typecheck, build, commit**

Run: `npx tsc --noEmit && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build`
Expected: both succeed.

```bash
git add -A && git commit -m "feat: auth, login flows, role routing and app shells

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Storage helpers and file uploader

**Files:**
- Create: `src/lib/storage.ts`, `src/components/file-uploader.tsx`
- Test: `tests/unit/storage.test.ts`

**Interfaces:**
- Produces: `BUCKET = "project-files"`, `buildStoragePath(projectId: string, fileName: string, kind: "files" | "deliverables", id?: string): string`, `signedDownloadUrl(path: string, seconds?: number): Promise<string | null>`, `createSignedUpload(path: string): Promise<{ path: string; token: string }>`; `<FileUploader projectId kind onUploaded? createUpload record />` client component that takes two server actions: `createUpload(projectId, fileName, kind) => { path, token } | { error }` and `record(input) => { error: string | null }`.

- [ ] **Step 1: Failing test**

`tests/unit/storage.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
const { buildStoragePath } = await import("@/lib/storage");

describe("buildStoragePath", () => {
  it("scopes by project and kind and sanitizes the name", () => {
    expect(buildStoragePath("p1", "My Logo (final).PNG", "deliverables", "abc"))
      .toBe("p1/deliverables/abc-my-logo-final.png");
  });
  it("cannot escape the project folder", () => {
    expect(buildStoragePath("p1", "../../etc/passwd", "files", "x")).toBe("p1/files/x-etc-passwd");
  });
  it("keeps a fallback name", () => {
    expect(buildStoragePath("p1", "///", "files", "x")).toBe("p1/files/x-file");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/storage.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/storage.ts`:
```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const BUCKET = "project-files";

export function buildStoragePath(projectId: string, fileName: string, kind: "files" | "deliverables", id: string = randomUUID()): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "file";
  return `${projectId}/${kind}/${id}-${slug}${ext ? `.${ext}` : ""}`;
}

export async function signedDownloadUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

export async function createSignedUpload(path: string): Promise<{ path: string; token: string }> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path: data.path, token: data.token };
}

export async function removeObject(path: string): Promise<void> {
  await createAdminClient().storage.from(BUCKET).remove([path]);
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/storage.test.ts` — Expected: 3 passed.

- [ ] **Step 5: Uploader component**

`src/components/file-uploader.tsx`:
```tsx
"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button, FormMessage } from "@/components/ui";

const MAX_BYTES = 50 * 1024 * 1024;

export interface UploadedFile { path: string; name: string; size: number; type: string }

export function FileUploader({
  projectId, kind, label = "Upload file", createUpload, record,
}: {
  projectId: string;
  kind: "files" | "deliverables";
  label?: string;
  createUpload: (projectId: string, fileName: string, kind: "files" | "deliverables") => Promise<{ path: string; token: string } | { error: string }>;
  record: (projectId: string, file: UploadedFile) => Promise<{ error: string | null }>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) { setError("Files must be 50 MB or smaller."); return; }
    setBusy(true); setError(null);
    try {
      const signed = await createUpload(projectId, file.name, kind);
      if ("error" in signed) throw new Error(signed.error);
      const { error: upErr } = await createBrowserSupabase().storage
        .from("project-files").uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (upErr) throw upErr;
      const res = await record(projectId, { path: signed.path, name: file.name, size: file.size, type: file.type });
      if (res.error) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input ref={input} type="file" className="sr-only" onChange={onChange} aria-label={label} />
      <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading…" : label}
      </Button>
      <FormMessage error={error} />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit` — Expected: no errors.
```bash
git add -A && git commit -m "feat: storage path helpers and signed-URL uploader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ClickUp API client, mapping, signature

**Files:**
- Create: `src/lib/clickup/types.ts`, `src/lib/clickup/client.ts`, `src/lib/clickup/mapping.ts`, `src/lib/clickup/signature.ts`
- Test: `tests/unit/clickup-mapping.test.ts`, `tests/unit/clickup-signature.test.ts`, `tests/unit/clickup-client.test.ts`

**Interfaces:**
- Produces:
  - Types `CUSpace { id: string; name: string }`, `CUList { id: string; name: string; due_date?: string | null; status?: { status: string } | null; space?: { id: string } }`, `CUTask { id: string; name: string; status: { status: string; color?: string }; due_date: string | null; url: string; date_updated: string; list: { id: string }; space?: { id: string }; custom_fields?: CUCustomField[] }`, `CUCustomField { name: string; type: string; value?: unknown }`, `CUComment { id: string; comment_text: string; user?: { username?: string | null } | null; date: string }`, `CUWebhookPayload { event: string; webhook_id: string; task_id?: string; list_id?: string; history_items?: { id?: string; date?: string }[] }`.
  - `class ClickUpClient(token: string, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>)` with `getSpaces(teamId)`, `getListsInSpace(spaceId)`, `getList(listId)`, `getTasks(listId)`, `getTask(taskId)`, `getTaskComments(taskId)`, `postTaskComment(taskId, text)`, `postListComment(listId, text)`, `createWebhook(teamId, endpoint, events)` returning `{ id: string; secret: string }`, `deleteWebhook(id)`; `class ClickUpError extends Error { status: number }`.
  - `CLIENT_VISIBLE_FIELD = "Client visible"`, `isClientVisible(task: CUTask): boolean`, `msToDate(ms: string | null | undefined): string | null`, `mapTask(task: CUTask, projectId: string): TaskInput`, `mapList(list: CUList, clientId: string): ProjectInput`, `parseClientComment(text: string): string | null`, `isDefaultClientSpace(name: string): boolean`, `webhookEventId(p: CUWebhookPayload): string`, `TaskInput`, `ProjectInput` types.
  - `verifyClickUpSignature(rawBody: string, signature: string | null, secret: string): boolean`.
  - `WEBHOOK_EVENTS` constant array.

- [ ] **Step 1: Failing mapping tests**

`tests/unit/clickup-mapping.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  isClientVisible, isDefaultClientSpace, mapList, mapTask, msToDate, parseClientComment, webhookEventId,
} from "@/lib/clickup/mapping";
import type { CUTask } from "@/lib/clickup/types";

const task = (fields?: CUTask["custom_fields"]): CUTask => ({
  id: "abc", name: " Homepage ", status: { status: "in progress", color: "#ff0" },
  due_date: "1767268800000", url: "https://app.clickup.com/t/abc", date_updated: "1767268800000",
  list: { id: "L1" }, custom_fields: fields,
});

describe("isClientVisible", () => {
  it("treats string and boolean checkbox values", () => {
    expect(isClientVisible(task([{ name: "Client visible", type: "checkbox", value: true }]))).toBe(true);
    expect(isClientVisible(task([{ name: "client visible ", type: "checkbox", value: "true" }]))).toBe(true);
    expect(isClientVisible(task([{ name: "Client visible", type: "checkbox", value: false }]))).toBe(false);
    expect(isClientVisible(task([{ name: "Client visible", type: "checkbox" }]))).toBe(false);
    expect(isClientVisible(task([{ name: "Client visible", type: "short_text", value: "true" }]))).toBe(false);
    expect(isClientVisible(task(undefined))).toBe(false);
  });
});

describe("msToDate", () => {
  it("converts ms timestamps to Eastern calendar dates", () => {
    expect(msToDate("1767268800000")).toBe("2026-01-01");
    expect(msToDate(null)).toBeNull();
    expect(msToDate("not-a-number")).toBeNull();
  });
});

describe("mapTask", () => {
  it("maps fields for upsert", () => {
    expect(mapTask(task([{ name: "Client visible", type: "checkbox", value: true }]), "P1")).toEqual({
      project_id: "P1", clickup_task_id: "abc", name: "Homepage", status: "in progress", status_color: "#ff0",
      due_date: "2026-01-01", client_visible: true, clickup_url: "https://app.clickup.com/t/abc",
      clickup_updated_at: "2026-01-01T12:00:00.000Z", deleted: false,
    });
  });
});

describe("mapList", () => {
  it("maps a list to a project", () => {
    expect(mapList({ id: "L1", name: "Website", due_date: null, status: { status: "active" } }, "C1"))
      .toEqual({ client_id: "C1", clickup_list_id: "L1", name: "Website", status: "active", due_date: null, archived: false });
  });
});

describe("parseClientComment", () => {
  it("extracts text after the #client marker", () => {
    expect(parseClientComment("#client Homepage draft is ready")).toBe("Homepage draft is ready");
    expect(parseClientComment("  #CLIENT: Launch moved to Friday")).toBe("Launch moved to Friday");
    expect(parseClientComment("#client")).toBeNull();
    expect(parseClientComment("internal note #client")).toBeNull();
    expect(parseClientComment("#clientele meeting")).toBeNull();
  });
});

describe("isDefaultClientSpace", () => {
  it("excludes the CPC space", () => {
    expect(isDefaultClientSpace("Carson Poore Consulting")).toBe(false);
    expect(isDefaultClientSpace("Blue Duck")).toBe(true);
  });
});

describe("webhookEventId", () => {
  it("is stable for the same delivery and differs per history item", () => {
    const base = { event: "taskUpdated", webhook_id: "W", task_id: "T", history_items: [{ id: "H1" }] };
    expect(webhookEventId(base)).toBe(webhookEventId({ ...base }));
    expect(webhookEventId(base)).not.toBe(webhookEventId({ ...base, history_items: [{ id: "H2" }] }));
  });
});
```

`tests/unit/clickup-signature.test.ts`:
```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyClickUpSignature } from "@/lib/clickup/signature";

const body = JSON.stringify({ event: "taskUpdated", task_id: "1" });
const sig = createHmac("sha256", "secret").update(body).digest("hex");

describe("verifyClickUpSignature", () => {
  it("accepts a correct signature", () => expect(verifyClickUpSignature(body, sig, "secret")).toBe(true));
  it("rejects a wrong secret", () => expect(verifyClickUpSignature(body, sig, "other")).toBe(false));
  it("rejects a tampered body", () => expect(verifyClickUpSignature(body + " ", sig, "secret")).toBe(false));
  it("rejects missing or malformed signatures", () => {
    expect(verifyClickUpSignature(body, null, "secret")).toBe(false);
    expect(verifyClickUpSignature(body, "zz", "secret")).toBe(false);
  });
});
```

`tests/unit/clickup-client.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { ClickUpClient, ClickUpError } from "@/lib/clickup/client";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("ClickUpClient", () => {
  it("paginates tasks until last_page", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ tasks: [{ id: "1" }], last_page: false }))
      .mockResolvedValueOnce(json({ tasks: [{ id: "2" }], last_page: true }));
    const cu = new ClickUpClient("tok", fetchImpl as unknown as typeof fetch, async () => {});
    const tasks = await cu.getTasks("L1");
    expect(tasks.map((t) => t.id)).toEqual(["1", "2"]);
    expect(fetchImpl.mock.calls[0][0]).toContain("/list/L1/task?");
    expect(fetchImpl.mock.calls[0][0]).toContain("page=0");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("tok");
  });

  it("retries after 429 then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ err: "rate" }, 429))
      .mockResolvedValueOnce(json({ spaces: [{ id: "S", name: "A" }] }));
    const cu = new ClickUpClient("tok", fetchImpl as unknown as typeof fetch, sleep);
    expect(await cu.getSpaces("T")).toEqual([{ id: "S", name: "A" }]);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("throws ClickUpError with status on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ err: "nope" }, 404));
    const cu = new ClickUpClient("tok", fetchImpl as unknown as typeof fetch, async () => {});
    await expect(cu.getTask("x")).rejects.toMatchObject({ status: 404 });
    await expect(cu.getTask("x")).rejects.toBeInstanceOf(ClickUpError);
  });

  it("combines folderless and folder lists", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ lists: [{ id: "A", name: "A" }] }))
      .mockResolvedValueOnce(json({ folders: [{ lists: [{ id: "B", name: "B" }] }] }));
    const cu = new ClickUpClient("tok", fetchImpl as unknown as typeof fetch, async () => {});
    expect((await cu.getListsInSpace("S")).map((l) => l.id)).toEqual(["A", "B"]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/clickup-*.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement types, signature, mapping, client**

`src/lib/clickup/types.ts`:
```ts
export interface CUSpace { id: string; name: string }
export interface CUList { id: string; name: string; due_date?: string | null; status?: { status: string } | null; space?: { id: string } }
export interface CUCustomField { name: string; type: string; value?: unknown }
export interface CUTask {
  id: string; name: string; status: { status: string; color?: string }; due_date: string | null;
  url: string; date_updated: string; list: { id: string }; space?: { id: string }; custom_fields?: CUCustomField[];
}
export interface CUComment { id: string; comment_text: string; user?: { username?: string | null } | null; date: string }
export interface CUWebhookPayload {
  event: string; webhook_id: string; task_id?: string; list_id?: string;
  history_items?: { id?: string; date?: string }[];
}
```

`src/lib/clickup/signature.ts`:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyClickUpSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
```

`src/lib/clickup/mapping.ts`:
```ts
import type { CUList, CUTask, CUWebhookPayload } from "./types";

export const CLIENT_VISIBLE_FIELD = "Client visible";
export const NON_CLIENT_SPACES = ["carson poore consulting"];
export const WEBHOOK_EVENTS = [
  "taskCreated", "taskUpdated", "taskDeleted", "taskMoved", "taskCommentPosted",
  "listCreated", "listUpdated", "listDeleted",
] as const;

export interface TaskInput {
  project_id: string; clickup_task_id: string; name: string; status: string; status_color: string | null;
  due_date: string | null; client_visible: boolean; clickup_url: string | null;
  clickup_updated_at: string | null; deleted: boolean;
}
export interface ProjectInput {
  client_id: string; clickup_list_id: string; name: string; status: string | null; due_date: string | null; archived: boolean;
}

export function isClientVisible(task: CUTask): boolean {
  const field = task.custom_fields?.find(
    (f) => f.type === "checkbox" && f.name.trim().toLowerCase() === CLIENT_VISIBLE_FIELD.toLowerCase(),
  );
  return field?.value === true || field?.value === "true";
}

export function msToDate(ms: string | null | undefined): string | null {
  if (!ms) return null;
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(n));
}

function msToIso(ms: string | null | undefined): string | null {
  const n = Number(ms);
  return ms && Number.isFinite(n) ? new Date(n).toISOString() : null;
}

export function mapTask(task: CUTask, projectId: string): TaskInput {
  return {
    project_id: projectId,
    clickup_task_id: task.id,
    name: task.name.trim(),
    status: task.status.status,
    status_color: task.status.color ?? null,
    due_date: msToDate(task.due_date),
    client_visible: isClientVisible(task),
    clickup_url: task.url ?? null,
    clickup_updated_at: msToIso(task.date_updated),
    deleted: false,
  };
}

export function mapList(list: CUList, clientId: string): ProjectInput {
  return {
    client_id: clientId,
    clickup_list_id: list.id,
    name: list.name.trim(),
    status: list.status?.status ?? null,
    due_date: msToDate(list.due_date),
    archived: false,
  };
}

export function parseClientComment(text: string): string | null {
  const match = /^\s*#client(?![a-z0-9_])[\s:\-–—]*/i.exec(text);
  if (!match) return null;
  const rest = text.slice(match[0].length).trim();
  return rest || null;
}

export function isDefaultClientSpace(name: string): boolean {
  return !NON_CLIENT_SPACES.includes(name.trim().toLowerCase());
}

export function webhookEventId(p: CUWebhookPayload): string {
  const h = p.history_items?.[0];
  return [p.webhook_id, p.event, p.task_id ?? p.list_id ?? "", h?.id ?? h?.date ?? ""].join(":");
}
```

Note: `msToDate("1767268800000")` is 2026-01-01T12:00Z, which is 07:00 Eastern on 2026-01-01.

`src/lib/clickup/client.ts`:
```ts
import type { CUComment, CUList, CUSpace, CUTask } from "./types";

const BASE = "https://api.clickup.com/api/v2";

export class ClickUpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ClickUpError";
  }
}

export class ClickUpClient {
  constructor(
    private token: string,
    private fetchImpl: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async req<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: this.token, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (res.status === 429 && attempt < 3) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const waitMs = Number.isFinite(reset) && reset > 0 ? Math.max(0, reset * 1000 - Date.now()) : 2 ** attempt * 1000;
      await this.sleep(Math.min(waitMs, 60_000));
      return this.req<T>(path, init, attempt + 1);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ClickUpError(res.status, `ClickUp ${init.method ?? "GET"} ${path} failed: ${res.status} ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async getSpaces(teamId: string): Promise<CUSpace[]> {
    return (await this.req<{ spaces: CUSpace[] }>(`/team/${teamId}/space?archived=false`)).spaces;
  }

  async getListsInSpace(spaceId: string): Promise<CUList[]> {
    const folderless = await this.req<{ lists: CUList[] }>(`/space/${spaceId}/list?archived=false`);
    const folders = await this.req<{ folders: { lists: CUList[] }[] }>(`/space/${spaceId}/folder?archived=false`);
    return [...folderless.lists, ...folders.folders.flatMap((f) => f.lists)];
  }

  getList(listId: string): Promise<CUList> {
    return this.req<CUList>(`/list/${listId}`);
  }

  async getTasks(listId: string): Promise<CUTask[]> {
    const all: CUTask[] = [];
    for (let page = 0; page < 100; page++) {
      const q = new URLSearchParams({ page: String(page), include_closed: "true", subtasks: "true", archived: "false" });
      const res = await this.req<{ tasks: CUTask[]; last_page?: boolean }>(`/list/${listId}/task?${q}`);
      all.push(...res.tasks);
      const done = res.last_page === true || (res.last_page === undefined && res.tasks.length < 100);
      if (done || res.tasks.length === 0) break;
    }
    return all;
  }

  getTask(taskId: string): Promise<CUTask> {
    return this.req<CUTask>(`/task/${taskId}`);
  }

  async getTaskComments(taskId: string): Promise<CUComment[]> {
    return (await this.req<{ comments: CUComment[] }>(`/task/${taskId}/comment`)).comments;
  }

  async postTaskComment(taskId: string, text: string): Promise<void> {
    await this.req(`/task/${taskId}/comment`, { method: "POST", body: JSON.stringify({ comment_text: text, notify_all: false }) });
  }

  async postListComment(listId: string, text: string): Promise<void> {
    await this.req(`/list/${listId}/comment`, { method: "POST", body: JSON.stringify({ comment_text: text, notify_all: false }) });
  }

  async createWebhook(teamId: string, endpoint: string, events: readonly string[]): Promise<{ id: string; secret: string }> {
    const res = await this.req<{ id: string; webhook: { id: string; secret: string } }>(`/team/${teamId}/webhook`, {
      method: "POST",
      body: JSON.stringify({ endpoint, events }),
    });
    return { id: res.webhook?.id ?? res.id, secret: res.webhook.secret };
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.req(`/webhook/${id}`, { method: "DELETE" });
  }
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/clickup-*.test.ts` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ClickUp client, mapping and webhook signature check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sync engine, webhook endpoint, nightly reconcile

**Files:**
- Create: `src/lib/sync/engine.ts`, `src/lib/sync/store.ts`, `src/lib/sync/webhook.ts`, `src/lib/sync/runs.ts`, `src/lib/sync/factory.ts`, `src/app/api/clickup/webhook/route.ts`, `src/app/api/cron/reconcile/route.ts`, `vercel.json`
- Test: `tests/unit/sync.test.ts`, `tests/unit/webhook.test.ts`

**Interfaces:**
- Consumes: `ClickUpClient`, `mapTask`, `mapList`, `parseClientComment`, `webhookEventId`, `verifyClickUpSignature` (Task 5); `createAdminClient` (Task 3).
- Produces:
  - `interface SyncStore { getClientSpaces(): Promise<{ clientId: string; spaceId: string }[]>; upsertProject(p: ProjectInput): Promise<string>; getProjectIdByList(listId: string): Promise<string | null>; upsertTasks(rows: TaskInput[]): Promise<void>; markTasksDeletedExcept(projectId: string, keepClickupIds: string[]): Promise<void>; markTaskDeleted(clickupTaskId: string): Promise<void>; archiveProjectsExcept(clientId: string, keepListIds: string[]): Promise<void>; archiveProjectByList(listId: string): Promise<void>; insertClickUpUpdates(rows: { project_id: string; clickup_comment_id: string; body: string; author_name: string | null; published_at: string }[]): Promise<number> }`
  - `type ClickUpApi = Pick<ClickUpClient, "getListsInSpace" | "getList" | "getTasks" | "getTask" | "getTaskComments">`
  - `reconcileAll(cu, store, opts?: { commentsSince?: Date }): Promise<SyncCounts>`, `syncTask(cu, store, taskId): Promise<void>`, `syncTaskComments(cu, store, taskId, projectId?): Promise<number>`, `syncList(cu, store, listId): Promise<void>`, `handleEvent(cu, store, payload): Promise<void>`; `SyncCounts = { projects: number; tasks: number; updates: number; errors: number }`.
  - `interface EventLog { getSecret(): Promise<string | null>; record(eventId: string, event: string, payload: unknown): Promise<boolean>; finish(eventId: string, error: string | null): Promise<void> }`; `processWebhook(raw: string, signature: string | null, deps: { log: EventLog; handle: (p: CUWebhookPayload) => Promise<void> }): Promise<{ status: number; body: string }>`.
  - `withSyncRun<T extends SyncCounts | void>(kind: "webhook" | "nightly" | "manual", fn: () => Promise<T>): Promise<T>`.
  - `getSyncDeps(): { cu: ClickUpClient; store: SyncStore }`; `getWebhookSettings(): Promise<{ id: string; secret: string } | null>`.

- [ ] **Step 1: Failing sync engine tests**

`tests/unit/sync.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { handleEvent, reconcileAll, syncTask, type ClickUpApi, type SyncStore } from "@/lib/sync/engine";
import type { CUComment, CUList, CUTask } from "@/lib/clickup/types";
import type { ProjectInput, TaskInput } from "@/lib/clickup/mapping";

function fakeStore(spaces: { clientId: string; spaceId: string }[]) {
  const projects = new Map<string, ProjectInput & { id: string }>();
  const tasks = new Map<string, TaskInput>();
  const updates = new Map<string, string>();
  const store: SyncStore = {
    getClientSpaces: async () => spaces,
    upsertProject: async (p) => {
      const id = projects.get(p.clickup_list_id)?.id ?? `proj-${p.clickup_list_id}`;
      projects.set(p.clickup_list_id, { ...p, id });
      return id;
    },
    getProjectIdByList: async (listId) => projects.get(listId)?.id ?? null,
    upsertTasks: async (rows) => rows.forEach((r) => tasks.set(r.clickup_task_id, r)),
    markTasksDeletedExcept: async (projectId, keep) => {
      for (const t of tasks.values()) if (t.project_id === projectId && !keep.includes(t.clickup_task_id)) t.deleted = true;
    },
    markTaskDeleted: async (id) => { const t = tasks.get(id); if (t) t.deleted = true; },
    archiveProjectsExcept: async (clientId, keep) => {
      for (const p of projects.values()) if (p.client_id === clientId && !keep.includes(p.clickup_list_id)) p.archived = true;
    },
    archiveProjectByList: async (listId) => { const p = projects.get(listId); if (p) p.archived = true; },
    insertClickUpUpdates: async (rows) => {
      let n = 0;
      for (const r of rows) if (!updates.has(r.clickup_comment_id)) { updates.set(r.clickup_comment_id, r.body); n++; }
      return n;
    },
  };
  return { store, projects, tasks, updates };
}

const mkTask = (id: string, listId: string, spaceId: string, visible = true, updated = Date.now()): CUTask => ({
  id, name: `Task ${id}`, status: { status: "open" }, due_date: null, url: `u/${id}`, date_updated: String(updated),
  list: { id: listId }, space: { id: spaceId },
  custom_fields: [{ name: "Client visible", type: "checkbox", value: visible }],
});

function fakeCu(data: { lists: Record<string, CUList[]>; tasks: Record<string, CUTask[]>; comments?: Record<string, CUComment[]> }): ClickUpApi {
  const allTasks = Object.values(data.tasks).flat();
  return {
    getListsInSpace: async (spaceId) => data.lists[spaceId] ?? [],
    getList: async (listId) => {
      const found = Object.entries(data.lists).flatMap(([space, ls]) => ls.map((l) => ({ ...l, space: { id: space } }))).find((l) => l.id === listId);
      if (!found) throw Object.assign(new Error("nf"), { status: 404 });
      return found;
    },
    getTasks: async (listId) => data.tasks[listId] ?? [],
    getTask: async (id) => {
      const t = allTasks.find((x) => x.id === id);
      if (!t) throw Object.assign(new Error("nf"), { status: 404 });
      return t;
    },
    getTaskComments: async (id) => data.comments?.[id] ?? [],
  };
}

describe("reconcileAll", () => {
  it("creates projects and tasks and soft-deletes vanished ones", async () => {
    const { store, projects, tasks } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    tasks.set("gone", { project_id: "proj-L1", clickup_task_id: "gone", name: "x", status: "open", status_color: null, due_date: null, client_visible: true, clickup_url: null, clickup_updated_at: null, deleted: false });
    const cu = fakeCu({ lists: { S1: [{ id: "L1", name: "Website" }] }, tasks: { L1: [mkTask("t1", "L1", "S1")] } });
    const counts = await reconcileAll(cu, store);
    expect(projects.get("L1")).toMatchObject({ id: "proj-L1", client_id: "C1", name: "Website" });
    expect(tasks.get("t1")).toMatchObject({ project_id: "proj-L1", client_visible: true, deleted: false });
    expect(tasks.get("gone")?.deleted).toBe(true);
    expect(counts).toMatchObject({ projects: 1, tasks: 1, errors: 0 });
  });

  it("imports #client comments for recently updated tasks only", async () => {
    const { store, updates } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    const cu = fakeCu({
      lists: { S1: [{ id: "L1", name: "Website" }] },
      tasks: { L1: [mkTask("new", "L1", "S1", true, Date.now()), mkTask("old", "L1", "S1", true, Date.parse("2020-01-01"))] },
      comments: {
        new: [{ id: "c1", comment_text: "#client Draft ready", date: String(Date.now()) }, { id: "c2", comment_text: "internal", date: String(Date.now()) }],
        old: [{ id: "c3", comment_text: "#client Old news", date: "1577836800000" }],
      },
    });
    await reconcileAll(cu, store, { commentsSince: new Date(Date.now() - 48 * 3600_000) });
    expect([...updates.entries()]).toEqual([["c1", "Draft ready"]]);
  });

  it("keeps going when one space fails and counts the error", async () => {
    const { store } = fakeStore([{ clientId: "C1", spaceId: "BAD" }, { clientId: "C2", spaceId: "S2" }]);
    const cu = fakeCu({ lists: { S2: [{ id: "L2", name: "B" }] }, tasks: { L2: [] } });
    cu.getListsInSpace = async (id) => { if (id === "BAD") throw new Error("boom"); return [{ id: "L2", name: "B" }]; };
    const counts = await reconcileAll(cu, store);
    expect(counts.errors).toBe(1);
    expect(counts.projects).toBe(1);
  });
});

describe("syncTask", () => {
  it("upserts a task in a known project", async () => {
    const { store, tasks } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    await store.upsertProject({ client_id: "C1", clickup_list_id: "L1", name: "W", status: null, due_date: null, archived: false });
    await syncTask(fakeCu({ lists: { S1: [{ id: "L1", name: "W" }] }, tasks: { L1: [mkTask("t1", "L1", "S1", false)] } }), store, "t1");
    expect(tasks.get("t1")?.client_visible).toBe(false);
  });

  it("creates the project when a task lands in a new list of a client space", async () => {
    const { store, projects, tasks } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    await syncTask(fakeCu({ lists: { S1: [{ id: "L9", name: "New" }] }, tasks: { L9: [mkTask("t9", "L9", "S1")] } }), store, "t9");
    expect(projects.get("L9")?.client_id).toBe("C1");
    expect(tasks.get("t9")?.project_id).toBe("proj-L9");
  });

  it("hides task moved to a non-client space", async () => {
    const { store, tasks } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    await store.upsertProject({ client_id: "C1", clickup_list_id: "L1", name: "W", status: null, due_date: null, archived: false });
    await store.upsertTasks([{ project_id: "proj-L1", clickup_task_id: "t1", name: "x", status: "open", status_color: null, due_date: null, client_visible: true, clickup_url: null, clickup_updated_at: null, deleted: false }]);
    await syncTask(fakeCu({ lists: { CPC: [{ id: "LX", name: "Admin" }] }, tasks: { LX: [mkTask("t1", "LX", "CPC")] } }), store, "t1");
    expect(tasks.get("t1")?.deleted).toBe(true);
  });

  it("marks a task deleted when ClickUp returns 404", async () => {
    const { store, tasks } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    await store.upsertTasks([{ project_id: "p", clickup_task_id: "t1", name: "x", status: "open", status_color: null, due_date: null, client_visible: true, clickup_url: null, clickup_updated_at: null, deleted: false }]);
    await syncTask(fakeCu({ lists: {}, tasks: {} }), store, "t1");
    expect(tasks.get("t1")?.deleted).toBe(true);
  });
});

describe("handleEvent", () => {
  it("routes taskDeleted, listDeleted and taskCommentPosted", async () => {
    const { store, tasks, projects, updates } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    const cu = fakeCu({
      lists: { S1: [{ id: "L1", name: "W" }] },
      tasks: { L1: [mkTask("t1", "L1", "S1")] },
      comments: { t1: [{ id: "c1", comment_text: "#client Hi", date: "1" }] },
    });
    await handleEvent(cu, store, { event: "taskCreated", webhook_id: "w", task_id: "t1" });
    await handleEvent(cu, store, { event: "taskCommentPosted", webhook_id: "w", task_id: "t1" });
    expect(updates.get("c1")).toBe("Hi");
    await handleEvent(cu, store, { event: "taskDeleted", webhook_id: "w", task_id: "t1" });
    expect(tasks.get("t1")?.deleted).toBe(true);
    await handleEvent(cu, store, { event: "listDeleted", webhook_id: "w", list_id: "L1" });
    expect(projects.get("L1")?.archived).toBe(true);
  });
});
```

`tests/unit/webhook.test.ts`:
```ts
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { processWebhook, type EventLog } from "@/lib/sync/webhook";

const payload = { event: "taskUpdated", webhook_id: "W", task_id: "T", history_items: [{ id: "H" }] };
const raw = JSON.stringify(payload);
const sign = (body: string) => createHmac("sha256", "sec").update(body).digest("hex");

function memoryLog(): EventLog & { finished: Map<string, string | null> } {
  const seen = new Set<string>();
  const finished = new Map<string, string | null>();
  return {
    finished,
    getSecret: async () => "sec",
    record: async (id) => { if (seen.has(id)) return false; seen.add(id); return true; },
    finish: async (id, err) => { finished.set(id, err); },
  };
}

describe("processWebhook", () => {
  it("rejects bad signature", async () => {
    const handle = vi.fn();
    const res = await processWebhook(raw, sign("other"), { log: memoryLog(), handle });
    expect(res.status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });

  it("rejects when no secret is configured", async () => {
    const log = memoryLog();
    log.getSecret = async () => null;
    const res = await processWebhook(raw, sign(raw), { log, handle: vi.fn() });
    expect(res.status).toBe(401);
  });

  it("ignores duplicate deliveries", async () => {
    const handle = vi.fn(async () => {});
    const log = memoryLog();
    await processWebhook(raw, sign(raw), { log, handle });
    const second = await processWebhook(raw, sign(raw), { log, handle });
    expect(handle).toHaveBeenCalledOnce();
    expect(second).toEqual({ status: 200, body: "duplicate" });
  });

  it("records handler errors and still returns 200", async () => {
    const log = memoryLog();
    const res = await processWebhook(raw, sign(raw), { log, handle: async () => { throw new Error("db down"); } });
    expect(res.status).toBe(200);
    expect([...log.finished.values()]).toEqual(["db down"]);
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await processWebhook("not json", sign("not json"), { log: memoryLog(), handle: vi.fn() });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/sync.test.ts tests/unit/webhook.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the engine**

`src/lib/sync/engine.ts`:
```ts
import type { ClickUpClient } from "@/lib/clickup/client";
import { mapList, mapTask, parseClientComment, type ProjectInput, type TaskInput } from "@/lib/clickup/mapping";
import type { CUWebhookPayload } from "@/lib/clickup/types";

export type ClickUpApi = Pick<ClickUpClient, "getListsInSpace" | "getList" | "getTasks" | "getTask" | "getTaskComments">;

export interface SyncStore {
  getClientSpaces(): Promise<{ clientId: string; spaceId: string }[]>;
  upsertProject(p: ProjectInput): Promise<string>;
  getProjectIdByList(listId: string): Promise<string | null>;
  upsertTasks(rows: TaskInput[]): Promise<void>;
  markTasksDeletedExcept(projectId: string, keepClickupIds: string[]): Promise<void>;
  markTaskDeleted(clickupTaskId: string): Promise<void>;
  archiveProjectsExcept(clientId: string, keepListIds: string[]): Promise<void>;
  archiveProjectByList(listId: string): Promise<void>;
  insertClickUpUpdates(rows: { project_id: string; clickup_comment_id: string; body: string; author_name: string | null; published_at: string }[]): Promise<number>;
}

export interface SyncCounts { projects: number; tasks: number; updates: number; errors: number }

const isNotFound = (e: unknown) => typeof e === "object" && e !== null && (e as { status?: number }).status === 404;

function msToIso(ms: string): string {
  const n = Number(ms);
  return Number.isFinite(n) ? new Date(n).toISOString() : new Date().toISOString();
}

export async function syncTaskComments(cu: ClickUpApi, store: SyncStore, taskId: string, projectId?: string): Promise<number> {
  const pid = projectId ?? (await store.getProjectIdByList((await cu.getTask(taskId)).list.id));
  if (!pid) return 0;
  const comments = await cu.getTaskComments(taskId);
  const rows = comments.flatMap((c) => {
    const body = parseClientComment(c.comment_text ?? "");
    return body
      ? [{ project_id: pid, clickup_comment_id: c.id, body, author_name: c.user?.username ?? null, published_at: msToIso(c.date) }]
      : [];
  });
  return rows.length ? store.insertClickUpUpdates(rows) : 0;
}

export async function reconcileAll(cu: ClickUpApi, store: SyncStore, opts: { commentsSince?: Date } = {}): Promise<SyncCounts> {
  const counts: SyncCounts = { projects: 0, tasks: 0, updates: 0, errors: 0 };
  for (const { clientId, spaceId } of await store.getClientSpaces()) {
    try {
      const lists = await cu.getListsInSpace(spaceId);
      for (const list of lists) {
        const projectId = await store.upsertProject(mapList(list, clientId));
        counts.projects++;
        const tasks = await cu.getTasks(list.id);
        await store.upsertTasks(tasks.map((t) => mapTask(t, projectId)));
        await store.markTasksDeletedExcept(projectId, tasks.map((t) => t.id));
        counts.tasks += tasks.length;
        if (opts.commentsSince) {
          const since = opts.commentsSince.getTime();
          for (const t of tasks.filter((t) => Number(t.date_updated) >= since)) {
            counts.updates += await syncTaskComments(cu, store, t.id, projectId);
          }
        }
      }
      await store.archiveProjectsExcept(clientId, lists.map((l) => l.id));
    } catch (err) {
      counts.errors++;
      console.error(`Reconcile failed for space ${spaceId}`, err);
    }
  }
  return counts;
}

async function projectForList(cu: ClickUpApi, store: SyncStore, listId: string, spaceId?: string): Promise<string | null> {
  const existing = await store.getProjectIdByList(listId);
  const spaces = await store.getClientSpaces();
  const list = await cu.getList(listId);
  const space = spaceId ?? list.space?.id;
  const client = spaces.find((s) => s.spaceId === space);
  if (!client) {
    if (existing) await store.archiveProjectByList(listId);
    return null;
  }
  return store.upsertProject(mapList(list, client.clientId));
}

export async function syncTask(cu: ClickUpApi, store: SyncStore, taskId: string): Promise<void> {
  let task;
  try {
    task = await cu.getTask(taskId);
  } catch (e) {
    if (isNotFound(e)) return store.markTaskDeleted(taskId);
    throw e;
  }
  const projectId = await projectForList(cu, store, task.list.id, task.space?.id);
  if (!projectId) return store.markTaskDeleted(taskId);
  await store.upsertTasks([mapTask(task, projectId)]);
}

export async function syncList(cu: ClickUpApi, store: SyncStore, listId: string): Promise<void> {
  try {
    await projectForList(cu, store, listId);
  } catch (e) {
    if (isNotFound(e)) return store.archiveProjectByList(listId);
    throw e;
  }
}

export async function handleEvent(cu: ClickUpApi, store: SyncStore, p: CUWebhookPayload): Promise<void> {
  switch (p.event) {
    case "taskCreated":
    case "taskUpdated":
    case "taskMoved":
      if (p.task_id) await syncTask(cu, store, p.task_id);
      return;
    case "taskDeleted":
      if (p.task_id) await store.markTaskDeleted(p.task_id);
      return;
    case "taskCommentPosted":
      if (p.task_id) await syncTaskComments(cu, store, p.task_id);
      return;
    case "listCreated":
    case "listUpdated":
      if (p.list_id) await syncList(cu, store, p.list_id);
      return;
    case "listDeleted":
      if (p.list_id) await store.archiveProjectByList(p.list_id);
      return;
    default:
      return;
  }
}
```

`src/lib/sync/webhook.ts`:
```ts
import { verifyClickUpSignature } from "@/lib/clickup/signature";
import { webhookEventId } from "@/lib/clickup/mapping";
import type { CUWebhookPayload } from "@/lib/clickup/types";

export interface EventLog {
  getSecret(): Promise<string | null>;
  record(eventId: string, event: string, payload: unknown): Promise<boolean>;
  finish(eventId: string, error: string | null): Promise<void>;
}

export async function processWebhook(
  raw: string,
  signature: string | null,
  deps: { log: EventLog; handle: (p: CUWebhookPayload) => Promise<void> },
): Promise<{ status: number; body: string }> {
  const secret = await deps.log.getSecret();
  if (!secret || !verifyClickUpSignature(raw, signature, secret)) return { status: 401, body: "invalid signature" };

  let payload: CUWebhookPayload;
  try {
    payload = JSON.parse(raw) as CUWebhookPayload;
  } catch {
    return { status: 400, body: "invalid json" };
  }

  const eventId = webhookEventId(payload);
  if (!(await deps.log.record(eventId, payload.event, payload))) return { status: 200, body: "duplicate" };

  try {
    await deps.handle(payload);
    await deps.log.finish(eventId, null);
  } catch (err) {
    await deps.log.finish(eventId, err instanceof Error ? err.message : String(err));
  }
  return { status: 200, body: "ok" };
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/sync.test.ts tests/unit/webhook.test.ts` — Expected: all pass.

- [ ] **Step 5: Supabase store, run logger, factory**

`src/lib/sync/store.ts`:
```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncStore } from "./engine";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function supabaseSyncStore(db: SupabaseClient): SyncStore {
  return {
    async getClientSpaces() {
      const rows = check(await db.from("clients").select("id, clickup_space_id").eq("is_active", true).not("clickup_space_id", "is", null));
      return (rows ?? []).map((r) => ({ clientId: r.id as string, spaceId: r.clickup_space_id as string }));
    },
    async upsertProject(p) {
      const row = check(await db.from("projects").upsert(p, { onConflict: "clickup_list_id" }).select("id").single());
      return row.id as string;
    },
    async getProjectIdByList(listId) {
      const row = check(await db.from("projects").select("id").eq("clickup_list_id", listId).maybeSingle());
      return (row?.id as string | undefined) ?? null;
    },
    async upsertTasks(rows) {
      for (let i = 0; i < rows.length; i += 500) {
        check(await db.from("tasks").upsert(rows.slice(i, i + 500), { onConflict: "clickup_task_id" }));
      }
    },
    async markTasksDeletedExcept(projectId, keep) {
      let q = db.from("tasks").update({ deleted: true }).eq("project_id", projectId).eq("deleted", false);
      if (keep.length) q = q.not("clickup_task_id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
      check(await q);
    },
    async markTaskDeleted(id) {
      check(await db.from("tasks").update({ deleted: true }).eq("clickup_task_id", id));
    },
    async archiveProjectsExcept(clientId, keep) {
      let q = db.from("projects").update({ archived: true }).eq("client_id", clientId).not("clickup_list_id", "is", null);
      if (keep.length) q = q.not("clickup_list_id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
      check(await q);
    },
    async archiveProjectByList(listId) {
      check(await db.from("projects").update({ archived: true }).eq("clickup_list_id", listId));
    },
    async insertClickUpUpdates(rows) {
      const inserted = check(await db.from("updates")
        .upsert(rows.map((r) => ({ ...r, source: "clickup" })), { onConflict: "clickup_comment_id", ignoreDuplicates: true })
        .select("id"));
      return inserted?.length ?? 0;
    },
  };
}
```

`src/lib/sync/runs.ts`:
```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SyncCounts } from "./engine";

export async function withSyncRun<T extends SyncCounts | void>(kind: "webhook" | "nightly" | "manual", fn: () => Promise<T>): Promise<T> {
  const db = createAdminClient();
  const { data: run } = await db.from("sync_runs").insert({ kind }).select("id").single();
  try {
    const result = await fn();
    const ok = !result || result.errors === 0;
    await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok, counts: result ?? {} }).eq("id", run?.id);
    return result;
  } catch (err) {
    await db.from("sync_runs").update({
      finished_at: new Date().toISOString(), ok: false, error: err instanceof Error ? err.message : String(err),
    }).eq("id", run?.id);
    throw err;
  }
}
```

`src/lib/sync/factory.ts`:
```ts
import "server-only";
import { ClickUpClient } from "@/lib/clickup/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { supabaseSyncStore } from "./store";

export function getSyncDeps() {
  return { cu: new ClickUpClient(serverEnv().CLICKUP_API_TOKEN), store: supabaseSyncStore(createAdminClient()) };
}

export async function getWebhookSettings(): Promise<{ id: string; secret: string } | null> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "clickup_webhook").maybeSingle();
  return (data?.value as { id: string; secret: string } | undefined) ?? null;
}
```

- [ ] **Step 6: Routes and cron config**

`src/app/api/clickup/webhook/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleEvent } from "@/lib/sync/engine";
import { getSyncDeps, getWebhookSettings } from "@/lib/sync/factory";
import { processWebhook } from "@/lib/sync/webhook";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const db = createAdminClient();
  const { cu, store } = getSyncDeps();
  const result = await processWebhook(raw, request.headers.get("x-signature"), {
    log: {
      getSecret: async () => (await getWebhookSettings())?.secret ?? null,
      record: async (eventId, event, payload) => {
        const { data, error } = await db.from("clickup_events")
          .upsert({ event_id: eventId, event, payload }, { onConflict: "event_id", ignoreDuplicates: true })
          .select("id");
        if (error) throw new Error(error.message);
        return (data?.length ?? 0) > 0;
      },
      finish: async (eventId, error) => {
        await db.from("clickup_events").update({ processed_at: new Date().toISOString(), error }).eq("event_id", eventId);
      },
    },
    handle: (payload) => handleEvent(cu, store, payload),
  });
  return new NextResponse(result.body, { status: result.status });
}
```

`src/app/api/cron/reconcile/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { reconcileAll } from "@/lib/sync/engine";
import { getSyncDeps } from "@/lib/sync/factory";
import { withSyncRun } from "@/lib/sync/runs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${serverEnv().CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const { cu, store } = getSyncDeps();
  const counts = await withSyncRun("nightly", () =>
    reconcileAll(cu, store, { commentsSince: new Date(Date.now() - 48 * 3600_000) }));
  return NextResponse.json(counts);
}
```

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/reconcile", "schedule": "0 7 * * *" },
    { "path": "/api/cron/digest", "schedule": "0 12 * * 1" }
  ]
}
```
Vercel cron runs in UTC: 07:00 UTC is 03:00 EDT / 02:00 EST; 12:00 UTC Monday is 08:00 EDT / 07:00 EST. The digest route (Task 10) additionally checks the Eastern hour so DST does not matter for the digest.

- [ ] **Step 7: Typecheck, test, commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass.

```bash
git add -A && git commit -m "feat: ClickUp sync engine, webhook endpoint and nightly reconcile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Admin dashboard, clients, settings

**Files:**
- Create: `src/app/admin/page.tsx` (replace placeholder), `src/app/admin/clients/page.tsx`, `src/app/admin/clients/[id]/page.tsx`, `src/app/admin/settings/page.tsx`, `src/app/admin/actions.ts`, `src/app/admin/settings/space-toggle.tsx`
- Test: `tests/unit/admin-actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 3), `getSyncDeps`, `withSyncRun`, `reconcileAll`, `getWebhookSettings` (Task 6), `WEBHOOK_EVENTS`, `isDefaultClientSpace` (Task 5).
- Produces server actions in `src/app/admin/actions.ts`: `updateClient(clientId: string, form: FormData)`, `inviteClient(clientId: string): Promise<ActionResult>`, `importSpaces(): Promise<ActionResult>`, `setSpaceIsClient(spaceId: string, name: string, isClient: boolean): Promise<ActionResult>`, `connectWebhook(): Promise<ActionResult>`, `syncNow(): Promise<ActionResult>`; `type ActionResult = { error: string | null; message?: string }`; helper `clientInviteSchema` (Zod) and `parseClientForm(form: FormData)`.

- [ ] **Step 1: Failing test for form parsing**

`tests/unit/admin-actions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseClientForm } from "@/app/admin/client-form";

const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };

describe("parseClientForm", () => {
  it("accepts valid input and blanks to null", () => {
    expect(parseClientForm(fd({ name: " Blue Duck ", contact_name: "", contact_email: "ann@blueduck.com", quickbooks_invoices_url: "" })))
      .toEqual({ ok: true, data: { name: "Blue Duck", contact_name: null, contact_email: "ann@blueduck.com", quickbooks_invoices_url: null } });
  });
  it("rejects a bad email and a non-https invoice link", () => {
    const res = parseClientForm(fd({ name: "X", contact_email: "nope", quickbooks_invoices_url: "javascript:alert(1)" }));
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/admin-actions.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement form parser (pure module, no server-only)**

`src/app/admin/client-form.ts`:
```ts
import { z } from "zod";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v);

const schema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  contact_name: z.preprocess(blankToNull, z.string().nullable()),
  contact_email: z.preprocess(blankToNull, z.email("Enter a valid email.").nullable()),
  quickbooks_invoices_url: z.preprocess(blankToNull, z.url({ protocol: /^https$/, error: "Use an https:// link." }).nullable()),
});

export type ClientFormData = z.infer<typeof schema>;

export function parseClientForm(form: FormData): { ok: true; data: ClientFormData } | { ok: false; error: string } {
  const res = schema.safeParse({
    name: form.get("name") ?? "",
    contact_name: form.get("contact_name") ?? "",
    contact_email: form.get("contact_email") ?? "",
    quickbooks_invoices_url: form.get("quickbooks_invoices_url") ?? "",
  });
  return res.success ? { ok: true, data: res.data } : { ok: false, error: res.error.issues[0].message };
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/admin-actions.test.ts` — Expected: 2 passed.

- [ ] **Step 5: Server actions**

`src/app/admin/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isDefaultClientSpace, WEBHOOK_EVENTS } from "@/lib/clickup/mapping";
import { reconcileAll } from "@/lib/sync/engine";
import { getSyncDeps, getWebhookSettings } from "@/lib/sync/factory";
import { withSyncRun } from "@/lib/sync/runs";
import { parseClientForm } from "./client-form";

export type ActionResult = { error: string | null; message?: string };

export async function updateClient(clientId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseClientForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update(parsed.data).eq("id", clientId);
  if (error) return { error: "Couldn't save the client." };
  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null, message: "Saved." };
}

export async function inviteClient(clientId: string): Promise<ActionResult> {
  await requireAdmin();
  const db = createAdminClient();
  const { data: client } = await db.from("clients").select("id, name, contact_name, contact_email, portal_user_id").eq("id", clientId).single();
  if (!client?.contact_email) return { error: "Add a contact email before inviting." };
  const redirectTo = `${serverEnv().APP_URL}/auth/confirm`;

  if (client.portal_user_id) {
    const { error } = await db.auth.resetPasswordForEmail(client.contact_email, { redirectTo });
    return error ? { error: "Couldn't resend the invite." } : { error: null, message: "Sign-in link sent again." };
  }

  const { data, error } = await db.auth.admin.inviteUserByEmail(client.contact_email, { redirectTo, data: { client_id: client.id } });
  if (error || !data.user) return { error: error?.message.includes("already") ? "That email already has an account. Use a different contact email." : "Couldn't send the invite." };

  const { error: pErr } = await db.from("profiles").insert({
    user_id: data.user.id, role: "client", client_id: client.id, email: client.contact_email, full_name: client.contact_name,
  });
  if (pErr) {
    await db.auth.admin.deleteUser(data.user.id);
    return { error: "Couldn't create the portal login." };
  }
  await db.from("clients").update({ portal_user_id: data.user.id }).eq("id", client.id);
  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null, message: "Invite sent." };
}

export async function importSpaces(): Promise<ActionResult> {
  await requireAdmin();
  const { cu } = getSyncDeps();
  const spaces = await cu.getSpaces(serverEnv().CLICKUP_TEAM_ID);
  const db = createAdminClient();
  const rows = spaces.filter((s) => isDefaultClientSpace(s.name)).map((s) => ({ name: s.name, clickup_space_id: s.id, is_active: true }));
  const { error } = await db.from("clients").upsert(rows, { onConflict: "clickup_space_id", ignoreDuplicates: true });
  if (error) return { error: "Couldn't import spaces." };
  revalidatePath("/admin/settings");
  return { error: null, message: `Imported ${rows.length} client spaces.` };
}

export async function setSpaceIsClient(spaceId: string, name: string, isClient: boolean): Promise<ActionResult> {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from("clients")
    .upsert({ clickup_space_id: spaceId, name, is_active: isClient }, { onConflict: "clickup_space_id" });
  if (error) return { error: "Couldn't update that space." };
  revalidatePath("/admin/settings");
  return { error: null };
}

export async function connectWebhook(): Promise<ActionResult> {
  await requireAdmin();
  const env = serverEnv();
  const { cu } = getSyncDeps();
  const existing = await getWebhookSettings();
  if (existing) await cu.deleteWebhook(existing.id).catch(() => undefined);
  const hook = await cu.createWebhook(env.CLICKUP_TEAM_ID, `${env.APP_URL}/api/clickup/webhook`, WEBHOOK_EVENTS);
  const { error } = await createAdminClient().from("app_settings")
    .upsert({ key: "clickup_webhook", value: hook, updated_at: new Date().toISOString() });
  if (error) return { error: "Webhook created but couldn't be saved. Try again." };
  revalidatePath("/admin/settings");
  return { error: null, message: "ClickUp is now sending live updates." };
}

export async function syncNow(): Promise<ActionResult> {
  await requireAdmin();
  const { cu, store } = getSyncDeps();
  try {
    const counts = await withSyncRun("manual", () => reconcileAll(cu, store, { commentsSince: new Date(Date.now() - 7 * 86400_000) }));
    revalidatePath("/admin", "layout");
    return counts.errors
      ? { error: `Synced with ${counts.errors} error(s). See sync history.` }
      : { error: null, message: `Synced ${counts.projects} projects and ${counts.tasks} tasks.` };
  } catch {
    return { error: "Sync failed. See sync history." };
  }
}
```

Note: `updateClient` is bound per client in the page with `updateClient.bind(null, client.id)` and used with `useActionState`.

- [ ] **Step 6: Pages**

`src/app/admin/page.tsx`:
```tsx
import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const supabase = await createClient();
  const [awaiting, decided, requests, lastRun] = await Promise.all([
    supabase.from("deliverables").select("id, title, published_at, project:projects(id, name, client:clients(name))")
      .eq("status", "awaiting_approval").order("published_at", { ascending: true }),
    supabase.from("deliverables").select("id, title, status, decided_at, client_feedback, project:projects(id, name, client:clients(name))")
      .in("status", ["approved", "changes_requested"]).order("decided_at", { ascending: false }).limit(8),
    supabase.from("requests").select("id, kind, body, created_at, project_id, client:clients(id, name)")
      .eq("status", "open").order("created_at", { ascending: false }),
    supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const run = lastRun.data;

  return (
    <>
      <PageHeader eyebrow="Carson Poore Consulting" title="Dashboard" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Client requests <span className="text-muted">({requests.data?.length ?? 0})</span></h2>
            {requests.data?.length ? (
              <ul className="divide-y divide-line">
                {requests.data.map((r) => {
                  const client = r.client as unknown as { id: string; name: string } | null;
                  return (
                    <li key={r.id} className="py-3">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{client?.name} · {r.kind}</p>
                      <p className="mt-1 whitespace-pre-line">{r.body}</p>
                      {r.project_id ? <Link className="text-sm font-semibold text-royal" href={`/admin/projects/${r.project_id}`}>Open project</Link> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState title="No open requests" />}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Waiting on clients</h2>
            {awaiting.data?.length ? (
              <ul className="divide-y divide-line">
                {awaiting.data.map((d) => {
                  const project = d.project as unknown as { id: string; name: string; client: { name: string } };
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <Link href={`/admin/projects/${project.id}`} className="font-semibold hover:text-royal">{d.title}</Link>
                        <p className="text-sm text-muted">{project.client.name} · {project.name} · sent {formatDate(d.published_at)}</p>
                      </div>
                      <StatusPill status="awaiting_approval" />
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState title="Nothing waiting on clients" />}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="bg-navy text-offwhite border-navy">
            <p className="text-xs font-semibold uppercase tracking-widest text-offwhite/60">ClickUp sync</p>
            <p className="mt-2 text-2xl font-black">
              {run ? (run.ok ? "Healthy" : run.finished_at ? "Needs attention" : "Running") : "Not run yet"}
            </p>
            <p className="mt-1 text-sm text-offwhite/70">{run ? `Last ${run.kind} sync ${formatDate(run.started_at)}` : "Connect ClickUp in Settings."}</p>
            {run?.error ? <p className="mt-2 text-sm text-gold">{run.error}</p> : null}
            <Link href="/admin/settings" className="mt-4 inline-block text-sm font-semibold text-gold">Sync settings</Link>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Recent decisions</h2>
            {decided.data?.length ? (
              <ul className="space-y-3">
                {decided.data.map((d) => {
                  const project = d.project as unknown as { id: string; name: string; client: { name: string } };
                  return (
                    <li key={d.id}>
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/admin/projects/${project.id}`} className="font-semibold">{d.title}</Link>
                        <StatusPill status={d.status} />
                      </div>
                      <p className="text-sm text-muted">{project.client.name} · {formatDate(d.decided_at)}</p>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState title="No decisions yet" />}
          </Card>
        </div>
      </div>
    </>
  );
}
```

`src/app/admin/clients/page.tsx`:
```tsx
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients").select("id, name, is_active, portal_user_id, projects(count)")
    .eq("is_active", true).order("name");

  return (
    <>
      <PageHeader eyebrow="Clients" title="Everyone you're working with" />
      {clients?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/admin/clients/${c.id}`}>
              <Card className="h-full transition-colors hover:border-royal">
                <p className="text-lg font-bold">{c.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {(c.projects as unknown as { count: number }[])[0]?.count ?? 0} projects · {c.portal_user_id ? "Portal invited" : "Not invited"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      ) : <EmptyState title="No clients yet" body="Import your ClickUp spaces in Settings." />}
    </>
  );
}
```

`src/app/admin/clients/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClientForm, InviteButton } from "./client-forms";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();
  const { data: projects } = await supabase.from("projects").select("id, name, status, due_date, archived")
    .eq("client_id", id).order("archived").order("name");

  let portalStatus = "Not invited";
  if (client.portal_user_id) {
    const { data } = await createAdminClient().auth.admin.getUserById(client.portal_user_id);
    portalStatus = data.user?.last_sign_in_at ? `Active · last sign-in ${formatDate(data.user.last_sign_in_at)}` : "Invited, hasn't signed in";
  }

  return (
    <>
      <PageHeader eyebrow="Client" title={client.name} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="mb-4 text-lg font-bold">Projects</h2>
          {projects?.length ? (
            <ul className="divide-y divide-line">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <Link href={`/admin/projects/${p.id}`} className={`font-semibold hover:text-royal ${p.archived ? "text-muted line-through" : ""}`}>{p.name}</Link>
                  <span className="text-sm text-muted">{p.due_date ? `Due ${formatDate(p.due_date)}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No projects" body="Projects appear when lists exist in this client's ClickUp space." />}
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-bold">Portal access</h2>
            <p className="mt-1 text-sm text-muted">{portalStatus}</p>
            <div className="mt-4"><InviteButton clientId={client.id} invited={Boolean(client.portal_user_id)} /></div>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Details</h2>
            <ClientForm client={client} />
          </Card>
        </div>
      </div>
    </>
  );
}
```

`src/app/admin/clients/[id]/client-forms.tsx`:
```tsx
"use client";
import { useActionState, useTransition, useState } from "react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { inviteClient, updateClient, type ActionResult } from "../../actions";
import type { ClientRow } from "@/lib/types";

export function ClientForm({ client }: { client: ClientRow }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(updateClient.bind(null, client.id), { error: null });
  return (
    <form action={action} className="space-y-4">
      <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={client.name} required /></Field>
      <Field label="Main contact" htmlFor="contact_name"><Input id="contact_name" name="contact_name" defaultValue={client.contact_name ?? ""} /></Field>
      <Field label="Contact email" htmlFor="contact_email" hint="The portal invite goes here.">
        <Input id="contact_email" name="contact_email" type="email" defaultValue={client.contact_email ?? ""} />
      </Field>
      <Field label="QuickBooks invoices link" htmlFor="quickbooks_invoices_url">
        <Input id="quickbooks_invoices_url" name="quickbooks_invoices_url" type="url" defaultValue={client.quickbooks_invoices_url ?? ""} />
      </Field>
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" disabled={pending}>Save</Button>
    </form>
  );
}

export function InviteButton({ clientId, invited }: { clientId: string; invited: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-2">
      <Button type="button" disabled={pending} onClick={() => start(async () => setResult(await inviteClient(clientId)))}>
        {invited ? "Resend sign-in link" : "Send portal invite"}
      </Button>
      <FormMessage error={result?.error} success={result?.message} />
    </div>
  );
}
```

`src/app/admin/settings/page.tsx`:
```tsx
import { Card, EmptyState, PageHeader, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getSyncDeps, getWebhookSettings } from "@/lib/sync/factory";
import { serverEnv } from "@/lib/env";
import { isDefaultClientSpace } from "@/lib/clickup/mapping";
import { ActionButton, SpaceToggle } from "./space-toggle";
import { connectWebhook, importSpaces, syncNow } from "../actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: clients }, { data: runs }, webhook] = await Promise.all([
    supabase.from("clients").select("clickup_space_id, is_active").not("clickup_space_id", "is", null),
    supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(10),
    getWebhookSettings(),
  ]);
  let spaces: { id: string; name: string }[] = [];
  let clickupError: string | null = null;
  try {
    spaces = await getSyncDeps().cu.getSpaces(serverEnv().CLICKUP_TEAM_ID);
  } catch {
    clickupError = "Couldn't reach ClickUp. Check the API token.";
  }
  const state = new Map((clients ?? []).map((c) => [c.clickup_space_id as string, c.is_active as boolean]));

  return (
    <>
      <PageHeader eyebrow="Settings" title="ClickUp connection" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Live updates</h2>
          <p className="mt-1 text-sm text-muted">{webhook ? "Connected. ClickUp sends changes as they happen." : "Not connected yet."}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton action={connectWebhook} label={webhook ? "Reconnect webhook" : "Connect webhook"} />
            <ActionButton action={syncNow} label="Sync now" variant="secondary" />
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Which spaces are clients?</h2>
          {clickupError ? <p className="mt-2 text-sm text-danger">{clickupError}</p> : null}
          {state.size === 0 && spaces.length ? (
            <div className="mt-4"><ActionButton action={importSpaces} label="Import client spaces" /></div>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {spaces.map((s) => (
                <li key={s.id} className="py-2">
                  <SpaceToggle spaceId={s.id} name={s.name} checked={state.get(s.id) ?? (state.size === 0 && isDefaultClientSpace(s.name))} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold">Sync history</h2>
          {runs?.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-muted"><tr><th className="py-2">When</th><th>Type</th><th>Result</th><th>Details</th></tr></thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2">{new Date(r.started_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</td>
                    <td className="capitalize">{r.kind}</td>
                    <td className={r.ok ? "text-ok" : "text-danger"}>{r.ok ? "OK" : r.finished_at ? "Failed" : "Running"}</td>
                    <td className="text-muted">{r.error ?? Object.entries(r.counts ?? {}).map(([k, v]) => `${v} ${k}`).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState title="No syncs yet" />}
        </Card>
      </div>
    </>
  );
}
```

`src/app/admin/settings/space-toggle.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { Button, FormMessage } from "@/components/ui";
import { setSpaceIsClient, type ActionResult } from "../actions";

export function SpaceToggle({ spaceId, name, checked }: { spaceId: string; name: string; checked: boolean }) {
  const [value, setValue] = useState(checked);
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="font-semibold">{name}</span>
      <input type="checkbox" className="size-5 accent-royal" checked={value} disabled={pending}
        onChange={(e) => { const next = e.target.checked; setValue(next); start(async () => { const r = await setSpaceIsClient(spaceId, name, next); if (r.error) setValue(!next); }); }} />
    </label>
  );
}

export function ActionButton({ action, label, variant = "primary" }: { action: () => Promise<ActionResult>; label: string; variant?: "primary" | "secondary" }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-2">
      <Button type="button" variant={variant} disabled={pending} onClick={() => start(async () => setResult(await action()))}>
        {pending ? "Working…" : label}
      </Button>
      <FormMessage error={result?.error} success={result?.message} />
    </div>
  );
}
```

- [ ] **Step 7: Typecheck, test, commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: clean.
```bash
git add -A && git commit -m "feat: admin dashboard, clients, invites and ClickUp settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Admin project page — deliverables, updates, files, requests

**Files:**
- Create: `src/app/admin/projects/[id]/page.tsx`, `src/app/admin/projects/[id]/forms.tsx`, `src/app/admin/project-actions.ts`, `src/app/admin/deliverable-form.ts`
- Test: `tests/unit/deliverable-form.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `buildStoragePath`, `createSignedUpload`, `removeObject`, `FileUploader` (Tasks 3, 4); `notifyClientDeliverablePublished(deliverableId)` (Task 10 — call it here; Task 10 implements it. Until then add a stub file `src/lib/email/notify.ts` exporting `export async function notifyClientDeliverablePublished(_id: string): Promise<void> {}` so this task compiles).
- Produces server actions in `src/app/admin/project-actions.ts`: `createDeliverable(projectId, prev, form)`, `publishDeliverable(id)`, `deleteDeliverable(id)`, `postUpdate(projectId, prev, form)`, `deleteUpdate(id)`, `createAdminUpload(projectId, fileName, kind)`, `recordProjectFile(projectId, file)`, `attachDeliverableFile(deliverableId, file)`, `deleteFile(id)`, `setRequestStatus(id, status)`; pure `parseDeliverableForm(form)`.

- [ ] **Step 1: Failing test**

`tests/unit/deliverable-form.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseDeliverableForm } from "@/app/admin/deliverable-form";

const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };

describe("parseDeliverableForm", () => {
  it("requires a title", () => {
    expect(parseDeliverableForm(fd({ title: "  " })).ok).toBe(false);
  });
  it("normalizes optional fields", () => {
    expect(parseDeliverableForm(fd({ title: "Logo", description: "", link_url: "https://figma.com/x", clickup_task_id: "" })))
      .toEqual({ ok: true, data: { title: "Logo", description: null, link_url: "https://figma.com/x", clickup_task_id: null } });
  });
  it("rejects non-http links", () => {
    expect(parseDeliverableForm(fd({ title: "x", link_url: "javascript:alert(1)" })).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/deliverable-form.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement parser**

`src/app/admin/deliverable-form.ts`:
```ts
import { z } from "zod";

const blank = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : null);

const schema = z.object({
  title: z.string().trim().min(1, "Give the deliverable a title."),
  description: z.preprocess(blank, z.string().nullable()),
  link_url: z.preprocess(blank, z.url({ protocol: /^https?$/, error: "Links must start with http:// or https://." }).nullable()),
  clickup_task_id: z.preprocess(blank, z.string().nullable()),
});

export type DeliverableFormData = z.infer<typeof schema>;

export function parseDeliverableForm(form: FormData): { ok: true; data: DeliverableFormData } | { ok: false; error: string } {
  const res = schema.safeParse({
    title: form.get("title") ?? "",
    description: form.get("description"),
    link_url: form.get("link_url"),
    clickup_task_id: form.get("clickup_task_id"),
  });
  return res.success ? { ok: true, data: res.data } : { ok: false, error: res.error.issues[0].message };
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/deliverable-form.test.ts` — Expected: 3 passed.

- [ ] **Step 5: Actions**

`src/app/admin/project-actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildStoragePath, createSignedUpload, removeObject } from "@/lib/storage";
import { notifyClientDeliverablePublished } from "@/lib/email/notify";
import { parseDeliverableForm } from "./deliverable-form";
import type { ActionResult } from "./actions";

const refresh = (projectId: string) => revalidatePath(`/admin/projects/${projectId}`);

export async function createDeliverable(projectId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseDeliverableForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("deliverables").insert({ project_id: projectId, ...parsed.data });
  if (error) return { error: "Couldn't create the deliverable." };
  refresh(projectId);
  return { error: null, message: "Draft created. Add a file if needed, then send it for approval." };
}

export async function publishDeliverable(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliverables")
    .update({ status: "awaiting_approval", published_at: new Date().toISOString(), client_feedback: null, decided_at: null, decided_by: null })
    .eq("id", id).in("status", ["draft", "changes_requested"]).select("project_id, file_path, link_url").single();
  if (error || !data) return { error: "Couldn't send it. It may already be with the client." };
  await notifyClientDeliverablePublished(id);
  refresh(data.project_id);
  return { error: null, message: "Sent to the client for approval." };
}

export async function deleteDeliverable(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("deliverables").delete().eq("id", id).eq("status", "draft").select("project_id, file_path").maybeSingle();
  if (!data) return { error: "Only drafts can be deleted." };
  if (data.file_path) await removeObject(data.file_path);
  refresh(data.project_id);
  return { error: null };
}

const updateSchema = z.object({ body: z.string().trim().min(1, "Write something first.").max(5000) });

export async function postUpdate(projectId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const parsed = updateSchema.safeParse({ body: form.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("updates").insert({
    project_id: projectId, body: parsed.data.body, source: "os", author_name: viewer.fullName ?? "Carson Poore",
  });
  if (error) return { error: "Couldn't post the update." };
  refresh(projectId);
  return { error: null, message: "Posted." };
}

export async function deleteUpdate(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("updates").delete().eq("id", id).select("project_id").maybeSingle();
  if (data) refresh(data.project_id);
  return { error: null };
}

export async function createAdminUpload(projectId: string, fileName: string, kind: "files" | "deliverables") {
  await requireAdmin();
  try {
    return await createSignedUpload(buildStoragePath(projectId, fileName, kind));
  } catch {
    return { error: "Couldn't start the upload." };
  }
}

export interface UploadedFileInput { path: string; name: string; size: number; type: string }

function pathBelongs(projectId: string, path: string, kind: "files" | "deliverables") {
  return path.startsWith(`${projectId}/${kind}/`) && !path.includes("..");
}

export async function recordProjectFile(projectId: string, file: UploadedFileInput): Promise<{ error: string | null }> {
  const viewer = await requireAdmin();
  if (!pathBelongs(projectId, file.path, "files")) return { error: "Invalid upload." };
  const supabase = await createClient();
  const { error } = await supabase.from("files").insert({
    project_id: projectId, storage_path: file.path, name: file.name, size_bytes: file.size, mime_type: file.type || null, uploaded_by: viewer.userId,
  });
  refresh(projectId);
  return { error: error ? "Uploaded, but couldn't save the file record." : null };
}

export async function attachDeliverableFile(deliverableId: string, projectId: string, file: UploadedFileInput): Promise<{ error: string | null }> {
  await requireAdmin();
  if (!pathBelongs(projectId, file.path, "deliverables")) return { error: "Invalid upload." };
  const supabase = await createClient();
  const { data: old } = await supabase.from("deliverables").select("file_path").eq("id", deliverableId).single();
  const { error } = await supabase.from("deliverables").update({ file_path: file.path }).eq("id", deliverableId).eq("project_id", projectId);
  if (!error && old?.file_path) await removeObject(old.file_path);
  refresh(projectId);
  return { error: error ? "Couldn't attach the file." : null };
}

export async function deleteFile(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("files").delete().eq("id", id).select("project_id, storage_path").maybeSingle();
  if (data) {
    await removeObject(data.storage_path);
    refresh(data.project_id);
  }
  return { error: null };
}

export async function setRequestStatus(id: string, status: "open" | "done"): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("requests").update({ status }).eq("id", id).select("project_id").maybeSingle();
  revalidatePath("/admin");
  if (data?.project_id) refresh(data.project_id);
  return { error: null };
}
```

`FileUploader.record` signature is `(projectId, file)`; for deliverables pass `record={attachDeliverableFile.bind(null, deliverable.id)}` which yields `(projectId, file)`.

- [ ] **Step 6: Page and client forms**

`src/app/admin/projects/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { DeliverableRow, FileRow, RequestRow, TaskRow, UpdateRow } from "@/lib/types";
import { DeliverableCard, NewDeliverableForm, ProjectFiles, RequestRowActions, UpdateForm, DeleteUpdateButton } from "./forms";

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("*, client:clients(id, name)").eq("id", id).maybeSingle();
  if (!project) notFound();
  const client = project.client as { id: string; name: string };

  const [tasks, deliverables, updates, files, requests] = await Promise.all([
    supabase.from("tasks").select("*").eq("project_id", id).eq("deleted", false).order("status").order("due_date", { nullsFirst: false }),
    supabase.from("deliverables").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("updates").select("*").eq("project_id", id).order("published_at", { ascending: false }).limit(30),
    supabase.from("files").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("requests").select("*").eq("project_id", id).order("created_at", { ascending: false }),
  ]);
  const taskRows = (tasks.data ?? []) as TaskRow[];

  return (
    <>
      <p className="mb-2 text-sm"><Link className="font-semibold text-royal" href={`/admin/clients/${client.id}`}>{client.name}</Link></p>
      <PageHeader eyebrow="Project" title={project.name} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Deliverables</h2>
            <NewDeliverableForm projectId={id} tasks={taskRows.map((t) => ({ id: t.clickup_task_id, name: t.name }))} />
            <div className="mt-6 space-y-4">
              {(deliverables.data as DeliverableRow[] | null)?.length
                ? (deliverables.data as DeliverableRow[]).map((d) => <DeliverableCard key={d.id} deliverable={d} />)
                : <EmptyState title="No deliverables yet" />}
            </div>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Updates</h2>
            <UpdateForm projectId={id} />
            <ul className="mt-6 space-y-4">
              {(updates.data as UpdateRow[] | null)?.map((u) => (
                <li key={u.id} className="border-l-2 border-gold pl-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                    {formatDate(u.published_at)} · {u.source === "clickup" ? "From ClickUp" : u.author_name}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{u.body}</p>
                  <DeleteUpdateButton id={u.id} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Client requests</h2>
            {(requests.data as RequestRow[] | null)?.length ? (
              <ul className="divide-y divide-line">
                {(requests.data as RequestRow[]).map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-center justify-between"><StatusPill status={r.status} /><span className="text-xs text-muted">{formatDate(r.created_at)}</span></div>
                    <p className="mt-2 whitespace-pre-line">{r.body}</p>
                    <RequestRowActions id={r.id} status={r.status} />
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No requests" />}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Files</h2>
            <ProjectFiles projectId={id} files={(files.data ?? []) as FileRow[]} />
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">ClickUp tasks</h2>
            <ul className="space-y-2 text-sm">
              {taskRows.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <a href={t.clickup_url ?? "#"} target="_blank" rel="noreferrer" className="hover:text-royal">{t.name}</a>
                  <span className="flex items-center gap-2">
                    {t.client_visible ? <span className="text-xs font-semibold text-ok">Visible</span> : <span className="text-xs text-muted">Internal</span>}
                    <StatusPill status={t.status} color={t.status_color} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
```

`src/app/admin/projects/[id]/forms.tsx`:
```tsx
"use client";
import { useActionState, useState, useTransition } from "react";
import { Button, Field, FormMessage, Input, StatusPill, Textarea } from "@/components/ui";
import { FileUploader } from "@/components/file-uploader";
import type { DeliverableRow, FileRow } from "@/lib/types";
import type { ActionResult } from "../../actions";
import {
  attachDeliverableFile, createAdminUpload, createDeliverable, deleteDeliverable, deleteFile, deleteUpdate,
  postUpdate, publishDeliverable, recordProjectFile, setRequestStatus,
} from "../../project-actions";

export function NewDeliverableForm({ projectId, tasks }: { projectId: string; tasks: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createDeliverable.bind(null, projectId), { error: null });
  return (
    <details className="rounded-lg border border-line p-4">
      <summary className="cursor-pointer font-semibold text-royal">New deliverable</summary>
      <form action={action} className="mt-4 space-y-4">
        <Field label="Title" htmlFor="title"><Input id="title" name="title" required /></Field>
        <Field label="Description" htmlFor="description"><Textarea id="description" name="description" /></Field>
        <Field label="Link (optional)" htmlFor="link_url" hint="Figma, Google Doc, staging site…"><Input id="link_url" name="link_url" type="url" /></Field>
        <Field label="Linked ClickUp task (optional)" htmlFor="clickup_task_id" hint="The client's decision is posted to this task as a comment.">
          <select id="clickup_task_id" name="clickup_task_id" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <option value="">None — post to the project list</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <FormMessage error={state.error} success={state.message} />
        <Button type="submit" disabled={pending}>Create draft</Button>
      </form>
    </details>
  );
}

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return { pending, result, run: (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn())) };
}

export function DeliverableCard({ deliverable: d }: { deliverable: DeliverableRow }) {
  const { pending, result, run } = useAction();
  const editable = d.status === "draft" || d.status === "changes_requested";
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">{d.title}</p>
        <StatusPill status={d.status} />
      </div>
      {d.description ? <p className="mt-2 whitespace-pre-line text-sm text-muted">{d.description}</p> : null}
      <p className="mt-2 text-sm">
        {d.file_path ? "File attached" : "No file"}{d.link_url ? <> · <a className="font-semibold text-royal" href={d.link_url} target="_blank" rel="noreferrer">Link</a></> : null}
      </p>
      {d.status === "changes_requested" && d.client_feedback ? (
        <blockquote className="mt-3 border-l-2 border-gold pl-3 text-sm whitespace-pre-line">{d.client_feedback}</blockquote>
      ) : null}
      {editable ? (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <FileUploader projectId={d.project_id} kind="deliverables" label={d.file_path ? "Replace file" : "Attach file"}
            createUpload={createAdminUpload} record={attachDeliverableFile.bind(null, d.id)} />
          <Button type="button" disabled={pending || (!d.file_path && !d.link_url)} onClick={() => run(() => publishDeliverable(d.id))}>
            {d.status === "draft" ? "Send for approval" : "Send revised version"}
          </Button>
          {d.status === "draft" ? <Button type="button" variant="danger" disabled={pending} onClick={() => run(() => deleteDeliverable(d.id))}>Delete</Button> : null}
        </div>
      ) : null}
      <div className="mt-2"><FormMessage error={result?.error} success={result?.message} /></div>
    </div>
  );
}

export function UpdateForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(postUpdate.bind(null, projectId), { error: null });
  return (
    <form action={action} className="space-y-3">
      <Textarea name="body" aria-label="Update for the client" placeholder="What should the client know this week?" required />
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" disabled={pending}>Post update</Button>
    </form>
  );
}

export function DeleteUpdateButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return <button type="button" className="mt-1 text-xs font-semibold text-muted hover:text-danger" disabled={pending} onClick={() => run(() => deleteUpdate(id))}>Delete</button>;
}

export function ProjectFiles({ projectId, files }: { projectId: string; files: FileRow[] }) {
  const { pending, run } = useAction();
  return (
    <div className="space-y-4">
      <FileUploader projectId={projectId} kind="files" createUpload={createAdminUpload} record={recordProjectFile} />
      <ul className="divide-y divide-line text-sm">
        {files.map((f) => (
          <li key={f.id} className="flex items-center justify-between py-2">
            <span>{f.name}</span>
            <button type="button" className="text-xs font-semibold text-muted hover:text-danger" disabled={pending} onClick={() => run(() => deleteFile(f.id))}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RequestRowActions({ id, status }: { id: string; status: "open" | "done" }) {
  const { pending, run } = useAction();
  return (
    <button type="button" className="mt-2 text-sm font-semibold text-royal" disabled={pending}
      onClick={() => run(() => setRequestStatus(id, status === "open" ? "done" : "open"))}>
      {status === "open" ? "Mark done" : "Reopen"}
    </button>
  );
}
```

- [ ] **Step 7: Typecheck, test, commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: clean.
```bash
git add -A && git commit -m "feat: admin project workspace for deliverables, updates, files and requests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client portal

**Files:**
- Create: `src/app/portal/page.tsx` (replace placeholder), `src/app/portal/projects/[id]/page.tsx`, `src/app/portal/deliverables/[id]/page.tsx`, `src/app/portal/deliverables/[id]/decision-form.tsx`, `src/app/portal/projects/[id]/request-form.tsx`, `src/app/portal/account/page.tsx`, `src/app/portal/actions.ts`, `src/app/portal/decision.ts`
- Test: `tests/unit/portal-decision.test.ts`

**Interfaces:**
- Consumes: `requireClient`, `signedDownloadUrl`, UI kit; `notifyAdminDecision(deliverableId)` and `notifyAdminRequest(requestId)` and `postDecisionToClickUp(deliverableId)` from `src/lib/email/notify.ts` (stubs added now, implemented in Task 10 — extend the stub file with `export async function notifyAdminDecision(_id: string) {}`, `export async function notifyAdminRequest(_id: string) {}`, `export async function postDecisionToClickUp(_id: string) {}`).
- Produces: `decideDeliverable(deliverableId, prev, form)`, `submitRequest(prev, form)`, `fileDownloadUrl(fileId)`, pure `parseDecision(form)` and `decisionErrorMessage(code: string): string`.

- [ ] **Step 1: Failing test**

`tests/unit/portal-decision.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { decisionErrorMessage, parseDecision } from "@/app/portal/decision";

const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };

describe("parseDecision", () => {
  it("accepts approval without feedback", () => {
    expect(parseDecision(fd({ decision: "approved" }))).toEqual({ ok: true, decision: "approved", feedback: null });
  });
  it("requires feedback for changes", () => {
    expect(parseDecision(fd({ decision: "changes_requested", feedback: "  " }))).toEqual({ ok: false, error: "Tell us what to change." });
  });
  it("rejects unknown decisions", () => {
    expect(parseDecision(fd({ decision: "draft" })).ok).toBe(false);
  });
});

describe("decisionErrorMessage", () => {
  it("maps database errors to friendly text", () => {
    expect(decisionErrorMessage("not_awaiting_approval")).toMatch(/already/);
    expect(decisionErrorMessage("whatever")).toMatch(/try again/i);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-decision.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

`src/app/portal/decision.ts`:
```ts
export type Decision = "approved" | "changes_requested";

export function parseDecision(form: FormData): { ok: true; decision: Decision; feedback: string | null } | { ok: false; error: string } {
  const decision = form.get("decision");
  if (decision !== "approved" && decision !== "changes_requested") return { ok: false, error: "Choose approve or request changes." };
  const raw = String(form.get("feedback") ?? "").trim();
  if (decision === "changes_requested" && !raw) return { ok: false, error: "Tell us what to change." };
  if (raw.length > 5000) return { ok: false, error: "Keep feedback under 5,000 characters." };
  return { ok: true, decision, feedback: raw || null };
}

export function decisionErrorMessage(message: string): string {
  if (message.includes("not_awaiting_approval")) return "This deliverable has already been decided.";
  if (message.includes("feedback_required")) return "Tell us what to change.";
  if (message.includes("not_found")) return "We couldn't find that deliverable.";
  return "Something went wrong. Please try again.";
}
```

- [ ] **Step 4: Run** `npx vitest run tests/unit/portal-decision.test.ts` — Expected: 4 passed.

- [ ] **Step 5: Actions**

`src/app/portal/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedDownloadUrl } from "@/lib/storage";
import { notifyAdminDecision, notifyAdminRequest, postDecisionToClickUp } from "@/lib/email/notify";
import { decisionErrorMessage, parseDecision } from "./decision";

export type PortalResult = { error: string | null; message?: string };

export async function decideDeliverable(deliverableId: string, _prev: PortalResult, form: FormData): Promise<PortalResult> {
  await requireClient();
  const parsed = parseDecision(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_deliverable", { p_id: deliverableId, p_decision: parsed.decision, p_feedback: parsed.feedback });
  if (error) return { error: decisionErrorMessage(error.message) };
  await Promise.allSettled([postDecisionToClickUp(deliverableId), notifyAdminDecision(deliverableId)]);
  revalidatePath(`/portal/deliverables/${deliverableId}`);
  revalidatePath("/portal");
  return { error: null, message: parsed.decision === "approved" ? "Approved. Thank you!" : "Got it. We'll make those changes." };
}

const requestSchema = z.object({
  kind: z.enum(["comment", "request"]),
  body: z.string().trim().min(1, "Write a message first.").max(5000, "Keep it under 5,000 characters."),
  project_id: z.uuid().nullable(),
  deliverable_id: z.uuid().nullable(),
});

export async function submitRequest(_prev: PortalResult, form: FormData): Promise<PortalResult> {
  const viewer = await requireClient();
  const parsed = requestSchema.safeParse({
    kind: form.get("kind"),
    body: form.get("body"),
    project_id: form.get("project_id") || null,
    deliverable_id: form.get("deliverable_id") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("requests")
    .insert({ ...parsed.data, client_id: viewer.clientId, created_by: viewer.userId }).select("id").single();
  if (error || !data) return { error: "Couldn't send that. Please try again." };
  await notifyAdminRequest(data.id).catch(() => undefined);
  if (parsed.data.project_id) revalidatePath(`/portal/projects/${parsed.data.project_id}`);
  return { error: null, message: "Sent. Carson will follow up." };
}

export async function fileDownloadUrl(fileId: string): Promise<string | null> {
  await requireClient();
  const supabase = await createClient();
  const { data } = await supabase.from("files").select("storage_path").eq("id", fileId).maybeSingle();
  return data ? signedDownloadUrl(data.storage_path, 300) : null;
}
```

- [ ] **Step 6: Pages**

`src/app/portal/page.tsx`:
```tsx
import Link from "next/link";
import { Card, EmptyState, LinkButton, PageHeader, formatDate } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Overview" };

export default async function PortalHome() {
  const viewer = await requireClient();
  const supabase = await createClient();
  const [{ data: client }, { data: projects }, { data: awaiting }, { data: updates }] = await Promise.all([
    supabase.from("clients").select("name, quickbooks_invoices_url").eq("id", viewer.clientId).single(),
    supabase.from("projects").select("id, name, status, due_date").order("name"),
    supabase.from("deliverables").select("id, title, project_id, published_at").eq("status", "awaiting_approval").order("published_at"),
    supabase.from("updates").select("id, body, published_at, project:projects(name)").order("published_at", { ascending: false }).limit(5),
  ]);
  const awaitingByProject = new Map<string, number>();
  awaiting?.forEach((d) => awaitingByProject.set(d.project_id, (awaitingByProject.get(d.project_id) ?? 0) + 1));

  return (
    <>
      <PageHeader eyebrow="Client portal" title={client?.name ?? "Welcome"}
        actions={client?.quickbooks_invoices_url
          ? <LinkButton variant="secondary" href={client.quickbooks_invoices_url} target="_blank" rel="noreferrer">View invoices</LinkButton>
          : undefined} />

      {awaiting?.length ? (
        <section aria-labelledby="needs-you" className="relative mb-8 overflow-hidden rounded-xl bg-navy p-6 text-offwhite">
          <p id="needs-you" className="text-xs font-semibold uppercase tracking-widest text-gold">Needs your review</p>
          <ul className="mt-3 space-y-2">
            {awaiting.map((d) => (
              <li key={d.id}>
                <Link href={`/portal/deliverables/${d.id}`} className="text-xl font-bold hover:text-gold">{d.title} →</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="projects-h">
          <h2 id="projects-h" className="mb-4 text-lg font-bold">Projects</h2>
          {projects?.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((p, i) => (
                <Link key={p.id} href={`/portal/projects/${p.id}`} className={i === 0 ? "sm:col-span-2" : ""}>
                  <Card className="h-full transition-colors hover:border-royal">
                    <p className={i === 0 ? "text-2xl font-black" : "text-lg font-bold"}>{p.name}</p>
                    <p className="mt-2 text-sm text-muted">
                      {p.status ? `${p.status} · ` : ""}{p.due_date ? `Due ${formatDate(p.due_date)}` : "No due date"}
                    </p>
                    {awaitingByProject.get(p.id) ? (
                      <p className="mt-3 text-sm font-semibold text-royal">{awaitingByProject.get(p.id)} awaiting your approval</p>
                    ) : null}
                  </Card>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No active projects" body="Your projects will appear here once work begins." />}
        </section>
        <section aria-labelledby="updates-h">
          <h2 id="updates-h" className="mb-4 text-lg font-bold">Latest updates</h2>
          {updates?.length ? (
            <ul className="space-y-4">
              {updates.map((u) => (
                <li key={u.id} className="border-l-2 border-gold pl-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                    {formatDate(u.published_at)} · {(u.project as unknown as { name: string } | null)?.name}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{u.body}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No updates yet" />}
        </section>
      </div>
    </>
  );
}
```

`src/app/portal/projects/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { DeliverableRow, FileRow, TaskRow, UpdateRow } from "@/lib/types";
import { FileLink, RequestForm } from "./request-form";

export default async function PortalProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id, name, status, due_date").eq("id", id).maybeSingle();
  if (!project) notFound();

  const [tasks, deliverables, updates, files] = await Promise.all([
    supabase.from("tasks").select("*").eq("project_id", id).order("due_date", { nullsFirst: false }),
    supabase.from("deliverables").select("*").eq("project_id", id).order("published_at", { ascending: false }),
    supabase.from("updates").select("*").eq("project_id", id).order("published_at", { ascending: false }),
    supabase.from("files").select("*").eq("project_id", id).order("created_at", { ascending: false }),
  ]);
  const taskRows = (tasks.data ?? []) as TaskRow[];
  const byStatus = Map.groupBy(taskRows, (t) => t.status);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/portal" className="font-semibold text-royal">← Overview</Link></p>
      <PageHeader eyebrow={project.due_date ? `Due ${formatDate(project.due_date)}` : "Project"} title={project.name} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Deliverables</h2>
            {(deliverables.data as DeliverableRow[] | null)?.length ? (
              <ul className="divide-y divide-line">
                {(deliverables.data as DeliverableRow[]).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                    <Link href={`/portal/deliverables/${d.id}`} className="font-semibold hover:text-royal">{d.title}</Link>
                    <StatusPill status={d.status} />
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No deliverables yet" />}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Progress</h2>
            {taskRows.length ? (
              <div className="space-y-5">
                {[...byStatus.entries()].map(([status, list]) => (
                  <div key={status}>
                    <StatusPill status={status} color={list[0].status_color} />
                    <ul className="mt-2 space-y-1">
                      {list.map((t) => (
                        <li key={t.id} className="flex justify-between gap-4 text-sm">
                          <span>{t.name}</span>
                          <span className="text-muted">{t.due_date ? formatDate(t.due_date) : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No shared tasks yet" />}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Send a request or comment</h2>
            <RequestForm projectId={id} />
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Updates</h2>
            {(updates.data as UpdateRow[] | null)?.length ? (
              <ul className="space-y-4">
                {(updates.data as UpdateRow[]).map((u) => (
                  <li key={u.id} className="border-l-2 border-gold pl-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted">{formatDate(u.published_at)}</p>
                    <p className="mt-1 whitespace-pre-line">{u.body}</p>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No updates yet" />}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Files</h2>
            {(files.data as FileRow[] | null)?.length ? (
              <ul className="space-y-2">{(files.data as FileRow[]).map((f) => <li key={f.id}><FileLink id={f.id} name={f.name} /></li>)}</ul>
            ) : <EmptyState title="No files yet" />}
          </Card>
        </div>
      </div>
    </>
  );
}
```

`src/app/portal/projects/[id]/request-form.tsx`:
```tsx
"use client";
import { useActionState, useTransition } from "react";
import { Button, FormMessage, Textarea } from "@/components/ui";
import { fileDownloadUrl, submitRequest, type PortalResult } from "../../actions";

export function RequestForm({ projectId, deliverableId }: { projectId: string; deliverableId?: string }) {
  const [state, action, pending] = useActionState<PortalResult, FormData>(submitRequest, { error: null });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      {deliverableId ? <input type="hidden" name="deliverable_id" value={deliverableId} /> : null}
      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">Type</legend>
        <label className="flex items-center gap-2"><input type="radio" name="kind" value="request" defaultChecked className="accent-royal" /> New request</label>
        <label className="flex items-center gap-2"><input type="radio" name="kind" value="comment" className="accent-royal" /> Comment</label>
      </fieldset>
      <Textarea name="body" aria-label="Your message" placeholder="What do you need?" required />
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send"}</Button>
    </form>
  );
}

export function FileLink({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="text-left font-semibold text-royal hover:underline"
      onClick={() => start(async () => { const url = await fileDownloadUrl(id); if (url) window.open(url, "_blank", "noopener"); })}>
      {pending ? "Preparing…" : name}
    </button>
  );
}
```

`src/app/portal/deliverables/[id]/page.tsx`:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { signedDownloadUrl } from "@/lib/storage";
import type { DeliverableRow } from "@/lib/types";
import { DecisionForm } from "./decision-form";

export default async function PortalDeliverable({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("deliverables").select("*, project:projects(id, name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const d = data as DeliverableRow & { project: { id: string; name: string } };
  const fileUrl = d.file_path ? await signedDownloadUrl(d.file_path, 3600) : null;
  const isImage = d.file_path ? /\.(png|jpe?g|gif|webp|svg)$/i.test(d.file_path) : false;
  const isPdf = d.file_path ? /\.pdf$/i.test(d.file_path) : false;

  return (
    <>
      <p className="mb-2 text-sm"><Link href={`/portal/projects/${d.project.id}`} className="font-semibold text-royal">← {d.project.name}</Link></p>
      <PageHeader eyebrow="Deliverable" title={d.title} actions={<StatusPill status={d.status} />} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="space-y-4">
          {d.description ? <p className="whitespace-pre-line">{d.description}</p> : null}
          {fileUrl && isImage ? <img src={fileUrl} alt={d.title} className="w-full rounded-lg border border-line" /> : null}
          {fileUrl && isPdf ? <iframe src={fileUrl} title={d.title} className="h-[70vh] w-full rounded-lg border border-line" /> : null}
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            {fileUrl ? <a href={fileUrl} target="_blank" rel="noreferrer" className="text-royal">Download file</a> : null}
            {d.link_url ? <a href={d.link_url} target="_blank" rel="noreferrer" className="text-royal">Open link</a> : null}
          </div>
        </Card>
        <Card>
          {d.status === "awaiting_approval" ? (
            <DecisionForm deliverableId={d.id} />
          ) : (
            <div>
              <p className="font-bold">{d.status === "approved" ? "You approved this" : "You requested changes"}</p>
              <p className="text-sm text-muted">{formatDate(d.decided_at)}</p>
              {d.client_feedback ? <blockquote className="mt-3 border-l-2 border-gold pl-3 whitespace-pre-line">{d.client_feedback}</blockquote> : null}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
```

`src/app/portal/deliverables/[id]/decision-form.tsx`:
```tsx
"use client";
import { useActionState, useState } from "react";
import { Button, Field, FormMessage, Textarea } from "@/components/ui";
import { decideDeliverable, type PortalResult } from "../../actions";

export function DecisionForm({ deliverableId }: { deliverableId: string }) {
  const [state, action, pending] = useActionState<PortalResult, FormData>(decideDeliverable.bind(null, deliverableId), { error: null });
  const [mode, setMode] = useState<"approve" | "changes">("approve");
  if (state.message) return <FormMessage success={state.message} />;
  return (
    <form action={action} className="space-y-4">
      <p className="font-bold">Ready for your review</p>
      {mode === "changes" ? (
        <Field label="What should change?" htmlFor="feedback">
          <Textarea id="feedback" name="feedback" required autoFocus />
        </Field>
      ) : (
        <Field label="Notes (optional)" htmlFor="feedback"><Textarea id="feedback" name="feedback" rows={2} /></Field>
      )}
      <FormMessage error={state.error} />
      <div className="flex flex-wrap gap-3">
        {mode === "approve" ? (
          <>
            <Button type="submit" name="decision" value="approved" disabled={pending}>Approve</Button>
            <Button type="button" variant="secondary" onClick={() => setMode("changes")}>Request changes</Button>
          </>
        ) : (
          <>
            <Button type="submit" name="decision" value="changes_requested" disabled={pending}>Send change request</Button>
            <Button type="button" variant="secondary" onClick={() => setMode("approve")}>Cancel</Button>
          </>
        )}
      </div>
    </form>
  );
}
```

`src/app/portal/account/page.tsx`:
```tsx
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const viewer = await requireClient();
  return (
    <>
      <PageHeader eyebrow="Account" title="Your account" />
      <Card className="max-w-lg space-y-4">
        <p><span className="text-sm text-muted">Signed in as</span><br /><span className="font-semibold">{viewer.email}</span></p>
        <LinkButton variant="secondary" href="/set-password">Change password</LinkButton>
      </Card>
    </>
  );
}
```

- [ ] **Step 7: Typecheck, test, commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: clean. (`Map.groupBy` needs `lib: es2024`; if tsc complains, change `"es2023"` to `"es2024"` in `tsconfig.json`.)
```bash
git add -A && git commit -m "feat: client portal with approvals, requests and files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Email notifications, ClickUp write-back, weekly digest

**Files:**
- Create: `src/lib/email/send.ts`, `src/lib/email/templates.ts`, `src/lib/email/digest.ts`, `src/app/api/cron/digest/route.ts`
- Modify: `src/lib/email/notify.ts` (replace stubs)
- Test: `tests/unit/email-templates.test.ts`, `tests/unit/digest.test.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `serverEnv`, `ClickUpClient`, `withSyncRun`-style logging to `sync_runs` on write-back failure.
- Produces:
  - `escapeHtml(s: string): string`, `renderEmail({ preheader, heading, bodyHtml, cta?: { label, url } }): { html: string; text: string }`, `adminDecisionEmail(...)`, `adminRequestEmail(...)`, `clientPublishedEmail(...)`, `digestEmail(content: DigestContent, appUrl: string)`.
  - `sendEmail({ to, subject, html, text }): Promise<boolean>`.
  - `interface DigestContent { clientName: string; updates: { project: string; body: string; date: string }[]; awaiting: { id: string; title: string; project: string }[]; statusChanges: { project: string; task: string; status: string }[]; dueSoon: { project: string; task: string; due: string }[] }`, `isDigestEmpty(c: DigestContent): boolean`, `weekStartEastern(now: Date): string`, `easternHour(now: Date): number`, `loadDigest(clientId: string, now: Date): Promise<DigestContent>`.
  - `notifyClientDeliverablePublished(id)`, `notifyAdminDecision(id)`, `notifyAdminRequest(id)`, `postDecisionToClickUp(id)`.

- [ ] **Step 1: Failing tests**

`tests/unit/email-templates.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { adminDecisionEmail, adminRequestEmail, digestEmail, escapeHtml } from "@/lib/email/templates";

const evil = `<script>alert(1)</script><img src=x onerror=alert(2)>`;

describe("email templates", () => {
  it("escapes client text", () => {
    const a = adminDecisionEmail({ clientName: evil, title: evil, decision: "changes_requested", feedback: evil, url: "https://os.x/admin" });
    const b = adminRequestEmail({ clientName: "A", kind: "request", body: evil, projectName: evil, url: "https://os.x/admin" });
    for (const html of [a.html, b.html]) {
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;script&gt;");
    }
  });

  it("escapeHtml covers quotes and ampersands", () => {
    expect(escapeHtml(`"&'<>`)).toBe("&quot;&amp;&#39;&lt;&gt;");
  });

  it("digest lists each section that has content", () => {
    const { html, text } = digestEmail({
      clientName: "Blue Duck",
      updates: [{ project: "Site", body: "Launched staging", date: "2026-10-05" }],
      awaiting: [{ id: "d1", title: "Homepage", project: "Site" }],
      statusChanges: [],
      dueSoon: [{ project: "Site", task: "Copy", due: "2026-10-14" }],
    }, "https://os.x");
    expect(html).toContain("Launched staging");
    expect(html).toContain("https://os.x/portal/deliverables/d1");
    expect(html).not.toContain("Status changes");
    expect(text).toContain("Homepage");
  });
});
```

`tests/unit/digest.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { easternHour, isDigestEmpty, weekStartEastern } from "@/lib/email/digest";

describe("digest helpers", () => {
  it("finds the Monday of the Eastern week", () => {
    expect(weekStartEastern(new Date("2026-10-12T12:00:00Z"))).toBe("2026-10-12");
    expect(weekStartEastern(new Date("2026-10-15T03:00:00Z"))).toBe("2026-10-12");
    expect(weekStartEastern(new Date("2026-10-12T02:00:00Z"))).toBe("2026-10-05");
  });
  it("reads the Eastern hour across DST", () => {
    expect(easternHour(new Date("2026-10-12T12:00:00Z"))).toBe(8);
    expect(easternHour(new Date("2026-12-07T13:00:00Z"))).toBe(8);
  });
  it("detects empty digests", () => {
    expect(isDigestEmpty({ clientName: "x", updates: [], awaiting: [], statusChanges: [], dueSoon: [] })).toBe(true);
    expect(isDigestEmpty({ clientName: "x", updates: [], awaiting: [{ id: "1", title: "t", project: "p" }], statusChanges: [], dueSoon: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/email-templates.test.ts tests/unit/digest.test.ts` — Expected: FAIL.

- [ ] **Step 3: Templates**

`src/lib/email/templates.ts`:
```ts
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const nl2br = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");

export function renderEmail({ preheader, heading, bodyHtml, bodyText, cta }: {
  preheader: string; heading: string; bodyHtml: string; bodyText: string; cta?: { label: string; url: string };
}): { html: string; text: string } {
  const button = cta
    ? `<p style="margin:28px 0 0"><a href="${escapeHtml(cta.url)}" style="background:#1e4fd8;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f8f7f4;font-family:Figtree,Helvetica,Arial,sans-serif;color:#0b1b33">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:#0b1b33;padding:24px 28px;border-radius:12px 12px 0 0">
<p style="margin:0;color:#f8f7f4;font-weight:900;letter-spacing:.08em;font-size:13px">CARSON POORE CONSULTING</p>
<div style="width:56px;height:3px;background:#e0a030;margin-top:12px"></div>
<h1 style="margin:16px 0 0;color:#ffffff;font-size:26px;line-height:1.2;font-weight:900">${escapeHtml(heading)}</h1>
</td></tr>
<tr><td style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px;font-size:16px;line-height:1.6;color:#2d3748">${bodyHtml}${button}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${heading}\n\n${bodyText}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}\n\nCarson Poore Consulting`;
  return { html, text };
}

export function adminDecisionEmail(i: { clientName: string; title: string; decision: "approved" | "changes_requested"; feedback: string | null; url: string }) {
  const verb = i.decision === "approved" ? "approved" : "requested changes on";
  const feedbackHtml = i.feedback ? `<blockquote style="margin:16px 0 0;border-left:3px solid #e0a030;padding-left:12px">${nl2br(i.feedback)}</blockquote>` : "";
  return {
    subject: `${i.clientName} ${verb} "${i.title}"`,
    ...renderEmail({
      preheader: `${i.clientName} ${verb} ${i.title}`,
      heading: i.decision === "approved" ? "Deliverable approved" : "Changes requested",
      bodyHtml: `<p style="margin:0"><strong>${escapeHtml(i.clientName)}</strong> ${verb} <strong>${escapeHtml(i.title)}</strong>.</p>${feedbackHtml}`,
      bodyText: `${i.clientName} ${verb} "${i.title}".${i.feedback ? `\n\n${i.feedback}` : ""}`,
      cta: { label: "Open project", url: i.url },
    }),
  };
}

export function adminRequestEmail(i: { clientName: string; kind: "comment" | "request"; body: string; projectName: string | null; url: string }) {
  const label = i.kind === "request" ? "New request" : "New comment";
  return {
    subject: `${label} from ${i.clientName}`,
    ...renderEmail({
      preheader: i.body.slice(0, 90),
      heading: label,
      bodyHtml: `<p style="margin:0 0 12px;color:#4a5568;font-size:14px">${escapeHtml(i.clientName)}${i.projectName ? ` · ${escapeHtml(i.projectName)}` : ""}</p><p style="margin:0">${nl2br(i.body)}</p>`,
      bodyText: `${i.clientName}${i.projectName ? ` · ${i.projectName}` : ""}\n\n${i.body}`,
      cta: { label: "Open dashboard", url: i.url },
    }),
  };
}

export function clientPublishedEmail(i: { title: string; projectName: string; url: string }) {
  return {
    subject: `Ready for your review: ${i.title}`,
    ...renderEmail({
      preheader: `${i.title} is ready for your review.`,
      heading: "Ready for your review",
      bodyHtml: `<p style="margin:0"><strong>${escapeHtml(i.title)}</strong> for ${escapeHtml(i.projectName)} is ready. Take a look and approve it or tell us what to change.</p>`,
      bodyText: `${i.title} for ${i.projectName} is ready. Approve it or tell us what to change.`,
      cta: { label: "Review it", url: i.url },
    }),
  };
}

export interface DigestContent {
  clientName: string;
  updates: { project: string; body: string; date: string }[];
  awaiting: { id: string; title: string; project: string }[];
  statusChanges: { project: string; task: string; status: string }[];
  dueSoon: { project: string; task: string; due: string }[];
}

function section<T>(title: string, items: T[], html: (t: T) => string, text: (t: T) => string) {
  if (!items.length) return { html: "", text: "" };
  return {
    html: `<h2 style="margin:24px 0 8px;font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:#0b1b33">${escapeHtml(title)}</h2><ul style="margin:0;padding-left:20px">${items.map((i) => `<li style="margin:6px 0">${html(i)}</li>`).join("")}</ul>`,
    text: `\n${title}\n${items.map((i) => `- ${text(i)}`).join("\n")}\n`,
  };
}

export function digestEmail(c: DigestContent, appUrl: string) {
  const parts = [
    section("Waiting on you", c.awaiting,
      (a) => `<a href="${escapeHtml(`${appUrl}/portal/deliverables/${a.id}`)}" style="color:#1e4fd8;font-weight:700">${escapeHtml(a.title)}</a> · ${escapeHtml(a.project)}`,
      (a) => `${a.title} (${a.project}): ${appUrl}/portal/deliverables/${a.id}`),
    section("Updates", c.updates, (u) => `<strong>${escapeHtml(u.project)}:</strong> ${nl2br(u.body)}`, (u) => `${u.project}: ${u.body}`),
    section("Status changes", c.statusChanges, (s) => `${escapeHtml(s.task)} → <strong>${escapeHtml(s.status)}</strong> · ${escapeHtml(s.project)}`, (s) => `${s.task} → ${s.status} (${s.project})`),
    section("Coming up", c.dueSoon, (d) => `${escapeHtml(d.task)} · due ${escapeHtml(d.due)} · ${escapeHtml(d.project)}`, (d) => `${d.task}, due ${d.due} (${d.project})`),
  ];
  return {
    subject: `Your week with Carson Poore Consulting`,
    ...renderEmail({
      preheader: c.awaiting.length ? `${c.awaiting.length} item(s) waiting on your review.` : "Here's where your projects stand.",
      heading: `This week, ${c.clientName}`,
      bodyHtml: parts.map((p) => p.html).join(""),
      bodyText: parts.map((p) => p.text).join(""),
      cta: { label: "Open your portal", url: `${appUrl}/portal` },
    }),
  };
}
```

- [ ] **Step 4: Digest helpers, sender, notify**

`src/lib/email/digest.ts`:
```ts
import type { DigestContent } from "./templates";

export function isDigestEmpty(c: DigestContent): boolean {
  return !c.updates.length && !c.awaiting.length && !c.statusChanges.length && !c.dueSoon.length;
}

function easternParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), h: Number(get("hour")), wd: get("weekday") };
}

export function easternHour(now: Date): number {
  return easternParts(now).h;
}

export function weekStartEastern(now: Date): string {
  const { y, m, d, wd } = easternParts(now);
  const offset = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
  const date = new Date(Date.UTC(y, m - 1, d - offset));
  return date.toISOString().slice(0, 10);
}
```

Add the database loader to a separate server-only file so the pure helpers stay testable — `src/lib/email/digest-loader.ts`:
```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DigestContent } from "./templates";

export async function loadDigest(clientId: string, clientName: string, now: Date): Promise<DigestContent> {
  const db = createAdminClient();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const today = now.toISOString().slice(0, 10);
  const inAWeek = new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 10);

  const { data: projects } = await db.from("projects").select("id, name").eq("client_id", clientId).eq("archived", false);
  const ids = (projects ?? []).map((p) => p.id);
  const name = new Map((projects ?? []).map((p) => [p.id, p.name as string]));
  if (!ids.length) return { clientName, updates: [], awaiting: [], statusChanges: [], dueSoon: [] };

  const [updates, awaiting, changed, due] = await Promise.all([
    db.from("updates").select("project_id, body, published_at").in("project_id", ids).gte("published_at", weekAgo).lte("published_at", now.toISOString()).order("published_at"),
    db.from("deliverables").select("id, title, project_id").in("project_id", ids).eq("status", "awaiting_approval"),
    db.from("tasks").select("project_id, name, status").in("project_id", ids).eq("client_visible", true).eq("deleted", false).gte("status_changed_at", weekAgo),
    db.from("tasks").select("project_id, name, due_date").in("project_id", ids).eq("client_visible", true).eq("deleted", false).gte("due_date", today).lte("due_date", inAWeek).order("due_date"),
  ]);

  return {
    clientName,
    updates: (updates.data ?? []).map((u) => ({ project: name.get(u.project_id)!, body: u.body, date: u.published_at })),
    awaiting: (awaiting.data ?? []).map((d) => ({ id: d.id, title: d.title, project: name.get(d.project_id)! })),
    statusChanges: (changed.data ?? []).map((t) => ({ project: name.get(t.project_id)!, task: t.name, status: t.status })),
    dueSoon: (due.data ?? []).map((t) => ({ project: name.get(t.project_id)!, task: t.name, due: t.due_date })),
  };
}
```

`src/lib/email/send.ts`:
```ts
import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";

let resend: Resend | undefined;

export async function sendEmail(msg: { to: string | string[]; subject: string; html: string; text: string }): Promise<boolean> {
  const env = serverEnv();
  resend ??= new Resend(env.RESEND_API_KEY);
  try {
    const { error } = await resend.emails.send({ from: env.EMAIL_FROM, ...msg });
    if (error) console.error("Email send failed", error);
    return !error;
  } catch (err) {
    console.error("Email send threw", err);
    return false;
  }
}
```

`src/lib/email/notify.ts` (replaces the stubs):
```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { ClickUpClient } from "@/lib/clickup/client";
import { sendEmail } from "./send";
import { adminDecisionEmail, adminRequestEmail, clientPublishedEmail } from "./templates";

async function loadDeliverable(id: string) {
  const { data } = await createAdminClient().from("deliverables")
    .select("id, title, status, client_feedback, clickup_task_id, project:projects(id, name, clickup_list_id, client:clients(id, name, contact_email, portal_user_id))")
    .eq("id", id).single();
  return data as unknown as {
    id: string; title: string; status: "approved" | "changes_requested" | "awaiting_approval" | "draft";
    client_feedback: string | null; clickup_task_id: string | null;
    project: { id: string; name: string; clickup_list_id: string | null; client: { id: string; name: string; contact_email: string | null; portal_user_id: string | null } };
  } | null;
}

export async function notifyClientDeliverablePublished(id: string): Promise<void> {
  const d = await loadDeliverable(id);
  if (!d?.project.client.contact_email || !d.project.client.portal_user_id) return;
  const email = clientPublishedEmail({ title: d.title, projectName: d.project.name, url: `${serverEnv().APP_URL}/portal/deliverables/${d.id}` });
  await sendEmail({ to: d.project.client.contact_email, ...email });
}

export async function notifyAdminDecision(id: string): Promise<void> {
  const d = await loadDeliverable(id);
  if (!d || (d.status !== "approved" && d.status !== "changes_requested")) return;
  const env = serverEnv();
  const email = adminDecisionEmail({
    clientName: d.project.client.name, title: d.title, decision: d.status, feedback: d.client_feedback,
    url: `${env.APP_URL}/admin/projects/${d.project.id}`,
  });
  await sendEmail({ to: env.ADMIN_EMAILS, ...email });
}

export async function notifyAdminRequest(id: string): Promise<void> {
  const { data } = await createAdminClient().from("requests")
    .select("kind, body, project:projects(id, name), client:clients(name)").eq("id", id).single();
  if (!data) return;
  const env = serverEnv();
  const project = data.project as unknown as { id: string; name: string } | null;
  const email = adminRequestEmail({
    clientName: (data.client as unknown as { name: string }).name, kind: data.kind, body: data.body,
    projectName: project?.name ?? null, url: `${env.APP_URL}${project ? `/admin/projects/${project.id}` : "/admin"}`,
  });
  await sendEmail({ to: env.ADMIN_EMAILS, ...email });
}

export async function postDecisionToClickUp(id: string): Promise<void> {
  const d = await loadDeliverable(id);
  if (!d || (d.status !== "approved" && d.status !== "changes_requested")) return;
  const text = d.status === "approved"
    ? `Client approved "${d.title}" in the CPC portal.`
    : `Client requested changes on "${d.title}" in the CPC portal:\n\n${d.client_feedback ?? ""}`;
  const cu = new ClickUpClient(serverEnv().CLICKUP_API_TOKEN);
  try {
    if (d.clickup_task_id) await cu.postTaskComment(d.clickup_task_id, text);
    else if (d.project.clickup_list_id) await cu.postListComment(d.project.clickup_list_id, text);
  } catch (err) {
    await createAdminClient().from("sync_runs").insert({
      kind: "webhook", finished_at: new Date().toISOString(), ok: false,
      error: `Couldn't post decision on "${d.title}" to ClickUp: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
```

`src/app/api/cron/digest/route.ts`:
```ts
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { easternHour, isDigestEmpty, weekStartEastern } from "@/lib/email/digest";
import { loadDigest } from "@/lib/email/digest-loader";
import { digestEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const env = serverEnv();
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return new NextResponse("unauthorized", { status: 401 });
  const now = new Date();
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && easternHour(now) < 7) return NextResponse.json({ skipped: "too early" });

  const db = createAdminClient();
  const week = weekStartEastern(now);
  const { data: clients } = await db.from("clients").select("id, name, contact_email").eq("is_active", true).not("portal_user_id", "is", null);
  const result = { sent: 0, empty: 0, already: 0, failed: 0 };

  for (const c of clients ?? []) {
    if (!c.contact_email) continue;
    const { data: claimed } = await db.from("digest_sends")
      .upsert({ client_id: c.id, week_start: week }, { onConflict: "client_id,week_start", ignoreDuplicates: true }).select("id");
    if (!claimed?.length) { result.already++; continue; }
    const content = await loadDigest(c.id, c.name, now);
    if (isDigestEmpty(content)) { result.empty++; continue; }
    const ok = await sendEmail({ to: c.contact_email, ...digestEmail(content, env.APP_URL) });
    if (ok) result.sent++;
    else {
      result.failed++;
      await db.from("digest_sends").delete().eq("client_id", c.id).eq("week_start", week);
    }
  }
  return NextResponse.json(result);
}
```

The digest claims the week row before sending so overlapping cron runs never double-send; a failed send releases the claim so a manual re-run (`?force=1` with the cron secret) can retry.

- [ ] **Step 5: Run** `npx vitest run` — Expected: all pass.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit` — Expected: clean.
```bash
git add -A && git commit -m "feat: email notifications, ClickUp decision comments and weekly digest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end tests, accessibility, deploy checklist

**Files:**
- Create: `playwright.config.ts`, `e2e/seed.ts`, `e2e/portal.spec.ts`, `README.md`

**Interfaces:**
- Consumes: the full app. E2E runs only when `E2E_BASE_URL`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are set (a Vercel preview pointed at the real Supabase project). Without them the suite is skipped, not failed.
- Produces: `npm run test:e2e`, `seedE2E(): Promise<{ deliverableId: string; projectId: string }>`.

- [ ] **Step 1: Config and seed**

`playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL, trace: "retain-on-failure" },
});
```

`e2e/seed.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

export const e2eEnabled = Boolean(
  process.env.E2E_BASE_URL && process.env.E2E_CLIENT_EMAIL && process.env.E2E_CLIENT_PASSWORD &&
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export async function seedE2E(): Promise<{ projectId: string; deliverableId: string }> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const email = process.env.E2E_CLIENT_EMAIL!;
  const password = process.env.E2E_CLIENT_PASSWORD!;

  const { data: client } = await db.from("clients").upsert({ name: "E2E Test Client", clickup_space_id: "e2e-space", contact_email: email }, { onConflict: "clickup_space_id" }).select("id").single();
  let userId: string;
  const { data: created } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.user) userId = created.user.id;
  else {
    const { data: list } = await db.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)!.id;
    await db.auth.admin.updateUserById(userId, { password });
  }
  await db.from("profiles").upsert({ user_id: userId, role: "client", client_id: client!.id, email });
  await db.from("clients").update({ portal_user_id: userId }).eq("id", client!.id);
  const { data: project } = await db.from("projects").upsert({ client_id: client!.id, clickup_list_id: "e2e-list", name: "E2E Project" }, { onConflict: "clickup_list_id" }).select("id").single();
  const { data: d } = await db.from("deliverables").insert({
    project_id: project!.id, title: `E2E deliverable ${Date.now()}`, link_url: "https://example.com",
    status: "awaiting_approval", published_at: new Date().toISOString(),
  }).select("id").single();
  return { projectId: project!.id, deliverableId: d!.id };
}
```

- [ ] **Step 2: Specs**

`e2e/portal.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eEnabled, seedE2E } from "./seed";

test.skip(!e2eEnabled, "Set E2E_* env vars to run against a deployed preview.");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_CLIENT_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_CLIENT_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/portal");
}

test("client approves a deliverable", async ({ page }) => {
  const { deliverableId } = await seedE2E();
  await login(page);
  await page.goto(`/portal/deliverables/${deliverableId}`);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved. Thank you!")).toBeVisible();
});

test("client must explain requested changes", async ({ page }) => {
  const { deliverableId } = await seedE2E();
  await login(page);
  await page.goto(`/portal/deliverables/${deliverableId}`);
  await page.getByRole("button", { name: "Request changes" }).click();
  await page.getByLabel("What should change?").fill("Make the logo larger.");
  await page.getByRole("button", { name: "Send change request" }).click();
  await expect(page.getByText("Got it. We'll make those changes.")).toBeVisible();
});

test("client submits a request", async ({ page }) => {
  const { projectId } = await seedE2E();
  await login(page);
  await page.goto(`/portal/projects/${projectId}`);
  await page.getByLabel("Your message").fill("Can we add a pricing page?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Sent. Carson will follow up.")).toBeVisible();
});

test("client cannot open the admin area", async ({ page }) => {
  await seedE2E();
  await login(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/portal$/);
});

test("portal pages have no serious accessibility violations", async ({ page }) => {
  const { projectId, deliverableId } = await seedE2E();
  await login(page);
  for (const path of ["/portal", `/portal/projects/${projectId}`, `/portal/deliverables/${deliverableId}`]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"), path).toEqual([]);
  }
});

test("login page is accessible", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
```

- [ ] **Step 3: Verify the suite skips cleanly**

Run: `npx playwright install chromium && npx playwright test`
Expected: all tests skipped (no E2E env), exit code 0.

- [ ] **Step 4: README with deploy checklist**

`README.md`:
````markdown
# CPC OS

Carson Poore Consulting's operating system: client portal on top of ClickUp. Release 1 spec: `docs/superpowers/specs/2026-10-09-cpc-os-release-1-design.md`.

## Develop

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
npm test                     # unit + database access tests (PGlite, no Docker needed)
npm run test:e2e             # needs E2E_* env, see e2e/seed.ts
```

## Go-live checklist

1. **Supabase project** `uzmbzvnswhhdtsmdbelg`
   - SQL editor: run `supabase/migrations/0001_schema.sql`, then `0002_access.sql`.
   - Auth → Providers: enable Google (client ID/secret from Google Cloud, redirect `https://uzmbzvnswhhdtsmdbelg.supabase.co/auth/v1/callback`). Enable Email; turn **off** "Allow new users to sign up".
   - Auth → URL configuration: Site URL `https://os.carsonpoore.com`; redirect URLs `https://os.carsonpoore.com/**` and the Vercel preview domain.
   - Auth → Email templates: in **Invite user** and **Reset password**, set the link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (invite) and `...&type=recovery` (reset). Brand the copy.
   - Auth → SMTP: use Resend SMTP so auth emails come from `carsonpoore.com`.
2. **ClickUp**: create a workspace-level checkbox custom field named `Client visible`. Create a personal API token.
3. **Resend**: verify `carsonpoore.com`; create an API key.
4. **Vercel** (existing project): set every variable in `.env.example` for Production and Preview. Add domain `os.carsonpoore.com`. Crons come from `vercel.json`.
5. Deploy the `cpc-os-rebuild` branch as a preview, sign in with Google, then in **Settings**: Import client spaces → Connect webhook → Sync now.
6. Add a contact email to one client, send the portal invite to yourself, and walk the flow.
7. Merge to `main` only after step 6 works. Merging replaces the old time tracker in production.
````

- [ ] **Step 5: Full verification and commit**

Run: `npx tsc --noEmit && npx vitest run && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build`
Expected: typecheck clean, all tests pass, build succeeds.

```bash
git add -A && git commit -m "test: e2e portal flows, accessibility checks and go-live checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
