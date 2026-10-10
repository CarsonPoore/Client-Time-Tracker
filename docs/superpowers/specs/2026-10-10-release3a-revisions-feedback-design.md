# Release 3a — Revisions, Feedback Threads, Activity

Part of Release 3 (client collaboration). Sub-releases: **3a** revisions + feedback threads + activity timeline; **3b** proposals; **3c** chat (Realtime, unread counts, delayed email). Each gets its own spec → plan → build → deploy.

## Goal

Clients and admin collaborate on deliverables in the portal: numbered versions, a comment thread per version (with attachments and optional image pin-points), approval tied to a specific version, an optional soft revision limit, and a per-client activity timeline for admin.

Out of scope (all of Release 3): payments, rates, invoicing, e-signature, pushing to QuickBooks. Out of scope for 3a: instant emails, Realtime, proposals, chat.

## Decisions

| Topic | Decision |
|---|---|
| Version storage | New `deliverable_versions` table; `deliverables` points at the current version |
| Revision limit | Soft: requests allowed past the limit, shown as "Over limit (4 of 3)" and flagged to admin |
| Comments vs. decisions | Separate. Comment on any visible version anytime; Approve/Request changes are buttons; the required change note is stored as a `decision` comment |
| Attachments | Clients may upload to `project-files/<project_id>/comments/<comment_id>/…`; 25 MB cap; type allowlist; not listed in project Files |
| Activity | `client_activity` table filled by triggers; admin-only |

## Data model (migration `0008_revisions.sql`)

### `deliverable_versions`
- `id uuid pk`, `deliverable_id uuid not null → deliverables on delete cascade`
- `number int not null`, `unique (deliverable_id, number)`
- `file_path text`, `link_url text`, `notes text`
- `status deliverable_status not null default 'draft'`
- `published_at`, `decided_at timestamptz`, `decided_by uuid → auth.users`
- `created_by uuid → auth.users`, `created_at`, `updated_at`
- Index on `deliverable_id`.

### `deliverables` changes
- Add `current_version_id uuid → deliverable_versions` (nullable during backfill and for drafts with no version yet).
- Add `revision_limit int check (revision_limit is null or revision_limit > 0)`.
- Keep `status`; it is a mirror of the current version's status, maintained by trigger on `deliverable_versions` and on changes to `current_version_id`. Existing consumers (dashboard, digest, ClickUp sync, portal lists) keep reading it.
- After backfill, drop `file_path`, `link_url`, `client_feedback`, `decided_at`, `decided_by` and the `changes_need_feedback` constraint. All code reading them moves to the current version.

### `deliverable_comments`
- `id uuid pk`, `version_id uuid not null → deliverable_versions on delete cascade`
- `author_id uuid → auth.users on delete set null`, `author_role text not null check in ('client','admin')`
- `body text not null check (btrim(body) <> '')`
- `kind text not null default 'comment' check in ('comment','decision')`
- `pin_x numeric`, `pin_y numeric`: both null or both set, each between 0 and 100
- `created_at`. No edits (no update grant for clients; admin only).
- Index on `version_id, created_at`.

### `comment_attachments`
- `id uuid pk`, `comment_id uuid not null → deliverable_comments on delete cascade`
- `storage_path text not null unique`, `name text not null`, `size_bytes bigint check (size_bytes <= 26214400)`, `mime_type text`, `created_at`.

### `client_activity`
- `id uuid pk`, `client_id uuid not null → clients on delete cascade`
- `type text not null` (3a values: `version_published`, `version_approved`, `changes_requested`, `comment_added`)
- `ref_table text not null`, `ref_id uuid not null`, `actor_id uuid`, `summary text not null`, `created_at`
- Index on `(client_id, created_at desc)`.
- Written only by security-definer trigger functions. 3b/3c add their own types and triggers.

### Backfill (in the same migration)
For each existing deliverable:
1. Insert v1 with the deliverable's `file_path`, `link_url`, `status`, `published_at`, `decided_at`, `decided_by`, `created_at`.
2. Set `current_version_id` to v1.
3. If `client_feedback` is non-empty, insert a `decision` comment on v1: `author_id = decided_by`, `author_role = 'client'`, `created_at = coalesce(decided_at, updated_at)`.
4. Insert matching `client_activity` rows (published, decision, feedback) with the original timestamps.

Activity triggers are created after the backfill so they do not double-insert.

## RPCs (security definer, `search_path = public`, revoked from `public, anon`)

- **`decide_version(p_version_id, p_decision, p_note)`**, for clients. Locks the version `for update`. Raises:
  - `not_found` if the version is missing, a draft, or another client's
  - `not_current_version`
  - `not_awaiting_approval`
  - `invalid_decision`
  - `feedback_required` (changes requested with a blank note)

  On success it sets the status and decision fields. If there is a note, it inserts a `decision` comment authored by the caller.
- **`publish_version(p_deliverable_id, p_file_path, p_link_url, p_notes)`**, admin only. Inserts version `max(number)+1` as `awaiting_approval` with `published_at = now()` and sets `current_version_id`. Raises `not_found` and `forbidden`.
- **`decide_deliverable(...)`** becomes a wrapper around `decide_version` on the current version, kept for compatibility and removed in 3b.

Revision label: `revision = current version number`. The text is "Revision n of limit", or "Over limit (n of limit)" once `n > limit`, or "Revision n" when there is no limit. This is a pure TypeScript helper.

## RLS

- `admin_all` on every new table.
- `deliverable_versions` client select: `status <> 'draft'` and the parent deliverable's project belongs to `auth_client_id()`.
- `deliverable_comments`:
  - client select when the version is visible to them per the rule above
  - client insert with check: the version is visible, `author_id = auth.uid()`, `author_role = 'client'`, `kind = 'comment'`
- `comment_attachments`:
  - client select when the parent comment is visible
  - client insert when the parent comment's `author_id = auth.uid()` and `storage_path` starts with `<project_id>/comments/<comment_id>/`
- `client_activity`: admin only.
- Storage (`project-files`):
  - client insert when the path is `<project_id>/comments/<comment_id>/<file>`, the project belongs to `auth_client_id()`, and the comment belongs to `auth.uid()`
  - client select on the same paths for visible comments
  - mime type is checked in the server action against an allowlist: images, PDF, doc/docx, xls/xlsx, ppt/pptx, txt, csv, zip

## UI

### Admin: `/admin/deliverables/[id]` (linked from the project page)
- Header: title, status, revision label (amber when over the limit), editable revision limit.
- `VersionTabs` for v1…vn.
- "Upload new version" is shown prominently when the current version has changes requested, and is otherwise in a ⋯ menu. It takes a file or link plus notes and calls `publish_version`.
- `CommentThread` and `CommentComposer` for the selected version, with attachments.
- `PinLayer` on image versions: clicking adds a pin and opens the composer with the pin attached. Pins are numbered dots linked to their thread items.

### Client portal deliverable view
- The current version is shown large. `DecisionBar` (Approve / Request changes) appears only while it is awaiting approval, and the note is required for changes.
- Thread, composer and pins as on the admin page.
- An "Earlier versions" list, with each older version's thread. Commenting is allowed; decisions are not.
- Approval is shown as "Approved v{n} on {date} by {name}".

### Preview portal
The same client components with `readOnly`: no composers, pins or decision buttons, and all content rendered.

### Admin client page
An Activity card shows the latest 50 items with "Load more" (keyset on `created_at`). Each item has an icon, a summary, a relative time, and a link to its target.

### Email digest
Adds "New comments" and "New version awaiting approval" sections. There are no instant emails in 3a.

### Components
`src/components/deliverables/`: `VersionTabs`, `CommentThread`, `CommentComposer`, `PinLayer`, `DecisionBar`. Data loads through the existing portal loader pattern, which keeps filtering out draft versions.

## Error handling
- RPC error codes are mapped to plain messages in server actions.
- Attachments: the file is uploaded to storage, then the row is inserted. If the insert fails, the storage object is removed.
- Concurrent decisions: the row lock means the second caller gets `not_awaiting_approval`.

## Testing
- **PGlite RLS** for each new table and storage path:
  - own client, other client, anon, draft version hidden
  - forged `kind = 'decision'`, forged `author_id`, pin outside 0–100, a comment on another client's version, an attachment on someone else's comment
- **RPC:**
  - `decide_version` (each error code, decision comment written, status mirrored to `deliverables`)
  - `publish_version` (numbering, current pointer, non-admin rejected)
  - the `decide_deliverable` wrapper
- **Backfill fixture:** a deliverable with feedback, an approved one, a draft, and one with a link only.
- **Activity:** one row per event type, with no duplicates from the backfill.
- **Unit:** revision label, pin coordinate math, portal loader hides draft versions.
- `npm run typecheck`, `npm test` and `npm run build` are green.

## Rollout
1. Back up the `deliverables` table in production.
2. Ask before applying `0008` to production.
3. Ask before deploying.
4. Verify on production: an existing deliverable shows as v1 with its migrated feedback comment, and Preview renders read-only.
