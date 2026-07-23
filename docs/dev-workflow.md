# Dev Workflow & Environments

How changes flow from local → test → prod for this project, and the division of
labor between Claude and the human. Every prod/outward action stops for explicit
human approval.

## Environments

| Env | Supabase | Vercel | Who operates it |
|-----|----------|--------|-----------------|
| **Local / test** | Test project `plnfdfszuzomoumowasz` (`https://plnfdfszuzomoumowasz.supabase.co`) | none — runs via `vercel dev` on the machine | **Claude** applies schema, seeds data, validates |
| **Prod** | Prod project `qdwuzvztnzxtouowjmjx` | `fellowship-run` (`fellowship-run.vercel.app`) | **Human runs every prod step**, after approving Claude's prepared commands |

There is intentionally **no deployed test environment** — "test" means local
`vercel dev` against the test Supabase project.

## Tooling setup (one-time)

- **Supabase MCP:** `.mcp.json` (gitignored, local-only) configures a **single**
  server `supabase-test` pointed at the test project. Claude has **no** prod DB
  connection by design, so it can never write to prod.
  - MCP config loads at Claude Code **startup**. After editing `.mcp.json`,
    **restart Claude Code** (or reconnect via `/mcp`) for the change to take
    effect — it does not hot-swap mid-session.
- **Vercel:** repo is linked to `fellowship81/fellowship-run` (`.vercel/`,
  gitignored). Local API runs via `vercel dev`.
- **Local env:** `.env.local` (gitignored) holds **test** DB creds + generated
  local secrets. Three values must be filled by the human (Claude can't read
  them): `SUPABASE_SERVICE_ROLE_KEY` (test project), `STRAVA_CLIENT_ID`,
  `STRAVA_CLIENT_SECRET` (and mirror the client id into `VITE_STRAVA_CLIENT_ID`).
- `.mcp.json`, `.env.local`, `.vercel/` are all gitignored — never committed.

## Running locally

```bash
vercel dev            # serves frontend + /api functions on http://localhost:3000
npm test              # full Vitest suite (pure logic, API helpers, components)
```

`vercel dev` reads `.env.local`, so the local API talks to the **test** DB.
Strava OAuth locally requires the Strava app's Authorization Callback Domain to
include `localhost`; redirect URIs in `.env.local` use `http://localhost:3000`.

## Per-change workflow

1. **Branch + code.** New branch off `main`; write code and, for any schema
   change, a numbered migration file in `supabase/migrations/` (the source of
   truth — the same file is later applied to prod).
2. **Apply to TEST.** Claude applies the migration to the test DB via
   `mcp__supabase-test__apply_migration` and seeds any needed data via
   `mcp__supabase-test__execute_sql` (reusable seed SQL lives in `scripts/`).
3. **Validate locally.** `npm test` green, then drive the real flow in
   `vercel dev` against the test DB. Confirm behavior end-to-end.
4. **Human approval gate.** Claude summarizes what's ready and what the prod
   rollout will do.
5. **PROD rollout (human runs, after approval).** Claude produces exact,
   copy-paste steps; the human executes them:
   - **Schema:** paste the migration SQL into the prod project's Supabase SQL
     editor (or `supabase db push` if the CLI is set up).
   - **Vercel env:** `vercel env add <NAME> production` for any new vars.
   - **Deploy:** `vercel --prod`.

## Prod handoff format

When a change is validated on test, Claude hands over a **PROD ROLLOUT** block:
- the exact migration SQL to run on prod,
- each `vercel env add …` command with which value/environment,
- the deploy command,
- anything to verify after.

Claude never executes these against prod — the human does.

## Current change: global-rankings (in progress)

Outstanding prod steps for when this ships (do NOT run until approved):
- Apply `supabase/migrations/0006_weekly_awards.sql` to **prod**.
- `vercel env add CRON_SECRET production` (generate with `openssl rand -hex 32`).
- Deploy `vercel --prod`.
- (Optional cleanup) the prod `backup_users_legacy_fellowship_20260720` table has
  RLS disabled — decide whether to drop it or enable RLS.
