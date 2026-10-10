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
   - Auth → Email templates: in **Invite user** and **Reset password**, set the link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (invite) and `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` (reset). The Invite template must use `type=invite` and the Reset Password template must use `type=recovery`. "Resend sign-in link" in the OS sends the recovery email. Brand the copy.
   - Auth → SMTP: use Resend SMTP so auth emails come from `carsonpoore.com`.
   - Storage: set the `project-files` bucket file size limit to 50 MB (Storage settings).
2. **ClickUp**: create a workspace-level checkbox custom field named `Client visible`. Create a personal API token.
3. **Resend**: verify `carsonpoore.com`; create an API key.
4. **Vercel** (existing project): set every variable in `.env.example` for Production and Preview. Add domain `os.carsonpoore.com`. Crons come from `vercel.json`. Use Node 22 or 24 (Project Settings → Node.js Version). The reconcile cron runs at 03:00 EDT / 02:00 EST and the digest on Mondays at 08:00 EDT / 07:00 EST.
5. Deploy the `cpc-os-rebuild` branch as a preview, sign in with Google, then in **Settings**: Import client spaces → Connect webhook → Sync now.
6. After connecting the webhook, post a test approval and confirm the decision comment appears in ClickUp (listing comments may require an assignee on the task).
7. Add a contact email to one client, send the portal invite to yourself, and walk the flow.
8. Merge to `main` only after step 7 works. Merging replaces the old time tracker in production.
