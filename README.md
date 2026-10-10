# CPC OS

Carson Poore Consulting's operating system: client portal on top of ClickUp. Release 1 spec: `docs/superpowers/specs/2026-10-09-cpc-os-release-1-design.md`.

## Develop

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
npm test                     # unit + database access tests (PGlite, no Docker needed)
npm run test:e2e             # needs E2E_* env, see E2E below
```

## Go-live checklist

1. **Supabase project** `cpc-os` (`sunhynwcliuxkrebamfp`, Copperleaf Marketing org, us-east-2)
   - Migrations `0001`–`0004` in `supabase/migrations/` are already applied (2026-10-10). New migrations go in the same folder and run in order; any new table needs `revoke all on <table> from anon;` because Supabase grants anon by default.
   - API keys: Project Settings → API. Use the project URL, the anon (or publishable) key and the service_role key for the env vars below.
   - Google Cloud: configure the OAuth consent screen, then create an OAuth client whose authorized redirect URI is the Supabase callback `https://sunhynwcliuxkrebamfp.supabase.co/auth/v1/callback`.
   - Auth → Providers: enable Google with that client ID/secret. Enable Email. **Leave "Allow new users to sign up" ON for now** (see step 6).
   - Auth → URL configuration: Site URL `https://os.carsonpoore.com`; redirect URLs `https://os.carsonpoore.com/**` and a preview wildcard such as `https://*-<team>.vercel.app/**`.
   - Auth → Email templates: set the **Invite user** link to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite` and the **Reset password** link to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`. The OS passes `APP_URL/auth/confirm` as the redirect, so `{{ .RedirectTo }}` makes links work on the preview as well as production (do not use `{{ .SiteURL }}`). Invite must use `type=invite`, Reset Password must use `type=recovery`. "Resend sign-in link" in the OS sends the recovery email. Brand the copy.
   - Auth → SMTP: use Resend SMTP so auth emails come from `carsonpoore.com`.
   - Storage: set the `project-files` bucket file size limit to 50 MB (Storage settings).
2. **ClickUp**: create a workspace-level checkbox custom field named `Client visible`. Create a personal API token.
3. **Resend**: verify `carsonpoore.com`; create an API key.
4. **Vercel** (existing project): set every variable in `.env.example` for Production and Preview. Generate `CRON_SECRET` with `openssl rand -hex 32`. In Preview, set `APP_URL` to the preview domain. Add domain `os.carsonpoore.com` and, at the DNS registrar, a CNAME `os` → `cname.vercel-dns.com`. Use Node 22 or 24 (Project Settings → Node.js Version). The cron routes set `maxDuration = 300`, which needs Vercel Pro or Fluid compute; on Hobby without Fluid compute, lower it to 60 in `src/app/api/cron/reconcile/route.ts` and `src/app/api/cron/digest/route.ts`. Crons come from `vercel.json`: reconcile runs 03:00 EDT / 02:00 EST, digest Mondays 08:00 EDT / 07:00 EST.
5. Deploy the `cpc-os-rebuild` branch as a preview. Sign in with Google once; this creates your admin profile. Then in **Settings**: Import client spaces → Connect webhook → Sync now. Note: the preview's Vercel Deployment Protection blocks ClickUp webhooks. Either skip "Connect webhook" on the preview ("Sync now" works without it) or use the protection bypass.
6. **Now** turn off public sign-ups: Supabase → Authentication → Sign In / Providers → User Signups → disable "Allow new users to sign up". This is a global setting (not on the Email provider) and it also blocks OAuth sign-ups, so it must come after your first Google sign-in.
7. Add a contact email to one client, send the portal invite to yourself, and walk the flow as the client.
8. Post a test approval from the client portal and confirm the decision comment appears in ClickUp (listing comments may require an assignee on the task).
9. Merge to `main` only after steps 7 and 8 work. Merging replaces the old time tracker in production.
10. **After merging:** on `os.carsonpoore.com` go to Settings and click **Reconnect webhook** so ClickUp posts to production (the preview webhook points at the preview URL).

### Revoking access

- **Remove an admin:** delete their email from `ADMIN_EMAILS`. That blocks the app, and their profile (and with it all database access) is removed automatically on their next visit.
- **Cut a client's portal access:** delete their auth user in Supabase → Authentication → Users. Turning off "Is a client" stops syncing but does not revoke portal access in Release 1.

## E2E

`npm run test:e2e` runs against a deployed preview and writes to the real Supabase project using the service role. Required env: `E2E_BASE_URL`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`. Without them the suite is skipped.

- `E2E_CLIENT_EMAIL` must contain `+e2e@` (for example `carsonpoore+e2e@gmail.com`); the seed refuses anything else, and refuses a user whose existing profile is not the E2E client.
- The seed creates an inactive "E2E Test Client" with no ClickUp space, so the admin list, digest and reconcile ignore it. Teardown (`test.afterAll`) deletes that client, its data and the E2E auth user.
- Each run sends a few admin notification emails (approvals, change requests, requests).
- If the preview has Vercel deployment protection, the tests need Vercel's protection bypass for automation (set up a bypass secret and pass it as the `x-vercel-protection-bypass` header).
