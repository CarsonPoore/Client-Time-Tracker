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

1. **Supabase project** `uzmbzvnswhhdtsmdbelg`
   - SQL editor: run `supabase/migrations/0001_schema.sql`, then `0002_access.sql`.
   - Google Cloud: configure the OAuth consent screen, then create an OAuth client whose authorized redirect URI is the Supabase callback `https://uzmbzvnswhhdtsmdbelg.supabase.co/auth/v1/callback`.
   - Auth → Providers: enable Google with that client ID/secret. Enable Email. **Leave "Allow new users to sign up" ON for now** (see step 6).
   - Auth → URL configuration: Site URL `https://os.carsonpoore.com`; redirect URLs `https://os.carsonpoore.com/**` and a preview wildcard such as `https://*-<team>.vercel.app/**`.
   - Auth → Email templates: set the **Invite user** link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` and the **Reset password** link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. Invite must use `type=invite`, Reset Password must use `type=recovery`. "Resend sign-in link" in the OS sends the recovery email. Brand the copy.
   - Auth → SMTP: use Resend SMTP so auth emails come from `carsonpoore.com`.
   - Storage: set the `project-files` bucket file size limit to 50 MB (Storage settings).
2. **ClickUp**: create a workspace-level checkbox custom field named `Client visible`. Create a personal API token.
3. **Resend**: verify `carsonpoore.com`; create an API key.
4. **Vercel** (existing project): set every variable in `.env.example` for Production and Preview. Generate `CRON_SECRET` with `openssl rand -hex 32`. In Preview, set `APP_URL` to the preview domain. Add domain `os.carsonpoore.com` and, at the DNS registrar, a CNAME `os` → `cname.vercel-dns.com`. Use Node 22 or 24 (Project Settings → Node.js Version). Crons come from `vercel.json`: reconcile runs 03:00 EDT / 02:00 EST, digest Mondays 08:00 EDT / 07:00 EST.
5. Deploy the `cpc-os-rebuild` branch as a preview. Sign in with Google once; this creates your admin profile. Then in **Settings**: Import client spaces → Connect webhook → Sync now.
6. **Now** turn off public sign-ups: Supabase → Authentication → Sign In / Providers → User Signups → disable "Allow new users to sign up". This is a global setting (not on the Email provider) and it also blocks OAuth sign-ups, so it must come after your first Google sign-in.
7. Add a contact email to one client, send the portal invite to yourself, and walk the flow as the client.
8. Post a test approval from the client portal and confirm the decision comment appears in ClickUp (listing comments may require an assignee on the task).
9. Merge to `main` only after steps 7 and 8 work. Merging replaces the old time tracker in production.

## E2E

`npm run test:e2e` runs against a deployed preview and writes to the real Supabase project using the service role. Required env: `E2E_BASE_URL`, `E2E_CLIENT_EMAIL`, `E2E_CLIENT_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`. Without them the suite is skipped.

- `E2E_CLIENT_EMAIL` must contain `+e2e@` (for example `carsonpoore+e2e@gmail.com`); the seed refuses anything else, and refuses a user whose existing profile is not the E2E client.
- The seed creates an inactive "E2E Test Client" with no ClickUp space, so the admin list, digest and reconcile ignore it. Teardown (`test.afterAll`) deletes that client, its data and the E2E auth user.
- Each run sends a few admin notification emails (approvals, change requests, requests).
- If the preview has Vercel deployment protection, the tests need Vercel's protection bypass for automation (set up a bypass secret and pass it as the `x-vercel-protection-bypass` header).
