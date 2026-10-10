# Release 2, round 3 — design

Approved in chat 2026-10-10. Out of scope: invoicing, payments, rates. QuickBooks stays system of record.
"This month" = calendar month in America/New_York (`monthRange`).

## 1. Portal hours (migration 0007)
- `clients.show_hours_in_portal boolean not null default false`.
- `public.portal_hours(p_client_id uuid, p_month date)` — `security definer`, `stable`, `set search_path = public`.
  Returns `(project_id uuid null, label text, minutes int)`: one row per non-archived project with time that month,
  ordered by minutes desc; plus one row `(null, 'Other work', n)` for unassigned + archived-project time, if any.
- Guard: zero rows unless `is_admin()` or (`auth_client_id() = p_client_id` and toggle on).
- `revoke all ... from public, anon; grant execute ... to authenticated`. `time_entries` policies unchanged (admin-only).
- Admin client page: toggle checkbox via admin-checked server action.
- Portal home: "Hours this month" card (rows + total) only when rows exist. Preview portal uses the same loader/component.
- RLS tests (PGlite): client cannot select `time_entries`; toggle off → empty; on → own totals only;
  cross-client → empty; archived/unassigned → "Other work"; anon cannot execute; admin sees any client.

## 2. Invoicing CSV export
- `src/lib/csv.ts` `toCsv(rows)`: UTF-8 BOM, CRLF, every field quoted, `"` doubled,
  cells starting with `= + - @ \t \r` prefixed with `'`.
- Entries CSV: date, client, QuickBooks customer (if linked), project, hours (2 dp), note.
- Summary CSV: client, QuickBooks customer, project, hours; client subtotal rows.
- `GET /admin/reports/hours/export?month=YYYY-MM&kind=entries|summary`, admin-gated, attachment
  `hours-YYYY-MM-<kind>.csv`. Buttons on the Hours report.

## 3. Week view
- `?view=clients|weeks` tabs on Hours report.
- `weekColumns(month)`: Monday-start weeks touching the month, clipped to it; edge columns flagged partial
  and labeled e.g. "Oct 1–5 · partial". `hoursByClientWeek(entries)` → grid with row and column totals.

## 4. Time page
- Inline edit per row (`updateTimeEntry` action, same `parseTimeEntryForm`).
- Quick-pick hours: 0.25, 0.5, 1, 2.
- Last client/project in localStorage after a successful add (try/catch guarded).
- Filter list by `?client=`.

## 5. Hours report polish
- Share bar per client (width %, plus text %). Projects in `<details>`. Empty month → link to `/admin/time?month=…`.

## 6. Dashboard
- "This month" card: total hours, top 3 clients, link to report.

## 7. Mobile
- Tables scroll inside an `overflow-x-auto` wrapper; Time form stacks below `sm`. Verified at 375px: no page-level horizontal scroll.

## Testing / process
- Unit (vitest): csv, weekColumns, hoursByClientWeek, portal hours shaping. DB: RLS tests above.
- `npm run typecheck`, `npm test`, `npm run build` green. Ask before applying 0007 to production and before deploying.
