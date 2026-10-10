# Release 2 round 3 Implementation Plan

> Execution: native (user asked for a swift run). Spec: docs/superpowers/specs/2026-10-10-release2-round3-design.md

**Goal:** Week view, CSV export, opt-in portal hours, Time/report/dashboard/mobile polish.
**Architecture:** Pure helpers in `src/lib/time.ts` + `src/lib/csv.ts` (unit-tested); migration 0007 adds the
toggle and `portal_hours()` security-definer function (PGlite RLS-tested); pages consume helpers.

## Global Constraints
- No rates/amounts anywhere. Month = America/New_York calendar month. Ask before prod migration/deploy.

## Review Focus
1. CSV cell starting with `=`, `+`, `-`, `@`, tab, CR → prefixed `'`; embedded quotes/newlines stay in one cell.
2. Month starting Sunday / ending Monday → 1-day partial week columns, labeled partial.
3. Client toggles portal hours off → portal card disappears immediately (function returns no rows).
4. Client A calls `portal_hours(B)` → empty, even when B's toggle is on.
5. Editing an entry to a project of another client → friendly 23514 error.

## Tasks
1. `csv.ts` toCsv + tests; `entryCsvRows`/`summaryCsvRows` in time.ts + tests.
2. `weekColumns`, `hoursByClientWeek` in time.ts + tests.
3. Migration 0007 + RLS tests; `portal_hours` loader in portal-data.ts + test.
4. Export route; report tabs, share bars, `<details>`, empty link, export buttons.
5. Time page: edit action + inline form, quick picks, localStorage, client filter.
6. Client toggle action/UI; portal + preview hours card; dashboard card.
7. Mobile check at 375px; typecheck/test/build; commit.
