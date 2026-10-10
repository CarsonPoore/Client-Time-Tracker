# Carson Poore Consulting OS — Release 1 design

Date: 2026-10-09
Status: Draft for review
Branch: `cpc-os-rebuild`

## Purpose

An operating system for Carson Poore Consulting (CPC) that cuts admin time, gives clients a polished branded portal, and grows into running a 2-3 person team. ClickUp stays the place where work is done. The OS is the client-facing and business layer on top of it, and later gains a Claude connector so Carson can work with it from chat.

Release 1 ships the foundation and the client portal, targeted for this week.

## Roadmap

| Release | Scope |
|---|---|
| 1 | Foundation (auth, roles, clients, projects) and client portal backed by ClickUp |
| 2 | Time tracking: manual entries, 15-minute rounding, fixed activity types, per-client rates, retainer hour banks, 90% budget alert, period locking, reports (hours by client and project, profitability, effective hourly rate), PDF and QuickBooks export, expenses, hour totals in portal |
| 3 | Pipeline/CRM: editable stages, deal value and win probability, activity log (notes, calls, emails, meetings, follow-ups), Gmail sync, website lead intake (contact, lead magnets, discovery call booking, pathway quiz), email alerts and digest, proposals, won lead creates client and sends portal invite |
| 4 | Claude MCP connector, team logins with timesheet approval, contractors |

Each release gets its own spec and plan. This document covers Release 1 only.

## Decisions carried from requirements

- Users in Release 1: Carson (admin) and clients. Team role exists in the schema but is disabled.
- ClickUp owns projects and tasks. The OS displays them and does not write tasks back.
- Mapping: ClickUp space = client, ClickUp list = project.
- Client visibility: a ClickUp checkbox custom field named `Client visible`. Unchecked or missing means hidden.
- Deliverables are created in the OS, not ClickUp.
- Updates feed: updates written in the OS plus ClickUp comments starting with `#client`.
- Client login: email and password, invite only, one login per client.
- Admin login: Google, restricted to an allowlisted email.
- Invoicing is not built. Each client has a QuickBooks invoices link shown in the portal.
- Theme follows system light/dark. Visual design uses the `carson-poore-consulting-brand` skill.
- Supabase: existing project `uzmbzvnswhhdtsmdbelg` (see Open items). Start with a clean schema; no data migration.

## 1. Stack and hosting

- Next.js 15, App Router, TypeScript, Tailwind CSS. Exact pinned dependency versions.
- Supabase: Postgres, Auth, Storage. Server-side auth with `@supabase/ssr`.
- Vercel, existing project, domain `os.carsonpoore.com`.
- Resend for transactional email.
- Vercel Cron for nightly ClickUp reconcile and the weekly digest.
- Route groups: `/login`, `/admin/*` (admin only), `/portal/*` (client only), `/api/*`.

Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `CLICKUP_API_TOKEN`, `CLICKUP_TEAM_ID`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, `APP_URL`.

## 2. Auth and roles

Roles: `admin`, `team` (disabled in Release 1), `client`.

- Admin: Google OAuth. On first login, a profile with role `admin` is created only if the email is in `ADMIN_EMAILS`. Any other Google login is signed out and shown "No access".
- Client: public sign-up is disabled in Supabase. Admin clicks "Send portal invite" on a client; the server creates the auth user via the service role and Supabase sends the invite email. The client sets a password from the link. The profile is created with role `client` and the client's `client_id`.
- One client login per client: `clients.portal_user_id` is unique.
- Middleware redirects by role: admin to `/admin`, client to `/portal`, unauthenticated to `/login`.
- Users cannot change their own role or `client_id` (enforced by RLS and a trigger).
- Password reset uses Supabase's built-in flow.

## 3. Data model

All tables have `id uuid primary key`, `created_at`, `updated_at`.

- `profiles`: `user_id` (auth.users), `role`, `client_id` (nullable), `full_name`, `email`.
- `clients`: `name`, `clickup_space_id` (unique, nullable), `is_active`, `contact_name`, `contact_email`, `quickbooks_invoices_url`, `portal_user_id` (unique, nullable).
- `projects`: `client_id`, `clickup_list_id` (unique), `name`, `status`, `due_date`, `archived`.
- `tasks`: `project_id`, `clickup_task_id` (unique), `name`, `status`, `status_color`, `due_date`, `client_visible`, `clickup_url`, `clickup_updated_at`, `deleted`.
- `deliverables`: `project_id`, `title`, `description`, `file_path` (nullable), `link_url` (nullable), `clickup_task_id` (nullable), `status` (`draft`, `awaiting_approval`, `approved`, `changes_requested`), `client_feedback`, `decided_at`, `decided_by`.
- `updates`: `project_id`, `body`, `source` (`os`, `clickup`), `clickup_comment_id` (unique, nullable), `author_name`, `published_at`.
- `files`: `project_id`, `storage_path`, `name`, `size_bytes`, `mime_type`, `uploaded_by`.
- `requests`: `client_id`, `project_id` (nullable), `deliverable_id` (nullable), `kind` (`comment`, `request`), `body`, `status` (`open`, `done`), `created_by`.
- `clickup_events`: `event_id` (unique), `received_at`, `processed_at`, `error` — idempotency log for webhooks.
- `sync_runs`: `kind` (`webhook`, `nightly`, `manual`), `started_at`, `finished_at`, `ok`, `counts` (jsonb), `error`.
- `digest_sends`: `client_id`, `week_start`, `sent_at` — prevents double sends.
- `app_settings`: `key` (unique), `value` (jsonb) — admin-only; holds the ClickUp webhook id and secret.

### Row-level security

- Admin: full access to everything.
- Client:
  - Reads only rows belonging to their `client_id` (via project).
  - Reads `tasks` only where `client_visible = true and deleted = false`.
  - Reads `deliverables` only where `status <> 'draft'`.
  - Reads `updates` only where `published_at is not null`.
  - Inserts `requests` for their own client only, with `created_by = auth.uid()`.
  - Changes deliverable status only through RPC `decide_deliverable(id, decision, feedback)`, which allows `awaiting_approval` → `approved` or `changes_requested`, requires feedback for changes, and stamps `decided_at` and `decided_by`.
  - No access to `clickup_events`, `sync_runs`, `digest_sends`, `app_settings`, or other clients.
- Storage bucket `project-files` is private. Clients get signed URLs only for files in their own projects.

## 4. ClickUp sync

ClickUp is read-only to the OS except for posting comments.

- Clients: Settings lists all ClickUp spaces with a toggle "Is a client". Default on for every space except `Carson Poore Consulting`. Turning a space on creates or reactivates a `clients` row.
- Projects: each list in a client space upserts a `projects` row.
- Tasks: upserted by `clickup_task_id`. `client_visible` comes from the `Client visible` checkbox custom field. Deleted tasks are soft-deleted.
- Comments: task comments whose text starts with `#client` (case-insensitive, after trimming) become `updates` with the marker stripped, `source = 'clickup'`, published immediately.
- Webhook: `POST /api/clickup/webhook` for `taskCreated`, `taskUpdated`, `taskDeleted`, `taskMoved`, `taskCommentPosted`, `listCreated`, `listUpdated`, `listDeleted`. Verifies the `X-Signature` HMAC with the webhook secret stored in `app_settings`. Records the event in `clickup_events`; already-seen events return 200 without reprocessing. The handler re-fetches the task or list from the ClickUp API rather than trusting the payload.
- Webhook registration: an admin action "Connect ClickUp webhook" creates the webhook via the ClickUp API and stores its id and secret in `app_settings`.
- Nightly reconcile at 03:00 Eastern: full pull of client spaces, lists and tasks; fixes drift and anything missed.
- Manual: "Sync now" button runs the same reconcile.
- Rate limits: ClickUp allows 100 requests per minute per token on lower plans. The reconcile batches requests and backs off on 429.
- Write-back: when a client approves or requests changes, the OS posts a comment to the deliverable's linked ClickUp task, or to the project's list if none is linked. Format: `Client approved "<title>"` or `Client requested changes on "<title>": <feedback>`. Failure to post does not block the client's decision; it is logged to `sync_runs`.

## 5. Portal

- Home `/portal`: client name, active projects as cards (status, due date, count of deliverables awaiting approval), latest 5 updates, "View invoices" button when a QuickBooks link exists.
- Project `/portal/projects/[id]`: visible tasks grouped by status with due dates, deliverables, updates feed, files list, and a form to submit a request or comment.
- Deliverable `/portal/deliverables/[id]`: title, description, file preview (images and PDFs inline) or link, status. Buttons: Approve, Request changes. Request changes opens a required feedback field. Once decided, shows the decision and date.
- Account: change password, sign out.
- Empty states for no projects, no deliverables, no updates.

## 6. Admin

- Dashboard `/admin`: deliverables awaiting client decision, recently decided deliverables, open client requests, last sync time and status with any errors.
- Clients `/admin/clients`: list with project counts and portal status (not invited, invited, active).
- Client `/admin/clients/[id]`: edit contact and QuickBooks link, send or resend portal invite, projects list.
- Project `/admin/projects/[id]`: all tasks (visible and hidden, marked), create and edit deliverables (upload file or link, optional ClickUp task), publish to client, post updates, upload files, see and close requests.
- Settings `/admin/settings`: ClickUp connection status, webhook connect, Sync now, choose which spaces are clients, sync history.

## 7. Email

Sent with Resend from `EMAIL_FROM`, branded templates.

- To admin, immediately: client approved a deliverable, requested changes, or submitted a request or comment.
- To client, when a deliverable is published for approval: one email with a link.
- Weekly digest to each client with an active portal login, Mondays 08:00 Eastern. Includes updates published in the last 7 days, deliverables awaiting their approval, visible tasks that changed status in the last 7 days, and visible tasks due in the next 7 days. Skipped when all sections are empty. `digest_sends` prevents duplicates.
- Portal invite and password reset emails come from Supabase Auth, using CPC-branded templates.

## 8. Error handling

- The portal reads only from the OS database, so a ClickUp outage does not affect it.
- Webhook processing errors are stored on the `clickup_events` row and the endpoint still returns 200 to stop ClickUp retry storms; the nightly reconcile repairs the data.
- Sync failures appear on the admin dashboard.
- Email failures are logged and do not block the triggering action.
- Cron endpoints require `CRON_SECRET`.
- Server actions validate input with Zod and return user-facing errors.

## 9. Testing

- RLS: SQL tests run against a local Supabase (Supabase CLI) for admin, client A, client B, and anonymous. Covers cross-client isolation, hidden tasks, draft deliverables, the `decide_deliverable` RPC, and role self-promotion.
- Unit (Vitest): ClickUp mapping (space, list, task, custom field), `#client` parsing, webhook signature check, digest content builder.
- End-to-end (Playwright): admin login (mocked OAuth or test session), client login, client approves a deliverable, client requests changes, client submits a request.
- Accessibility check of portal pages (axe).

## 10. Look and feel

Built with the `carson-poore-consulting-brand` skill (colors, Figtree type, voice). Light and dark themes follow the system setting. Responsive down to phone width. Portal copy follows the `carson-poore-consulting-voice` skill.

## Out of scope for Release 1

Time tracking and hour totals, pipeline/CRM, invoicing and payments, Claude connector, team logins, contractors, two-way ClickUp sync, multiple logins per client.

## Open items

1. Supabase project `uzmbzvnswhhdtsmdbelg` is not in the Supabase account connected to Claude. Either add it to that account, or Carson applies migrations by pasting SQL into its SQL editor.
2. Carson creates a workspace-level checkbox custom field named `Client visible` in ClickUp.
3. Carson provides a ClickUp API token, a Resend account and verified sending domain, and Google OAuth credentials in Supabase.
4. DNS: add `os.carsonpoore.com` to the Vercel project.
5. Merging `cpc-os-rebuild` into `main` replaces the live app. This happens only after Release 1 is tested.
