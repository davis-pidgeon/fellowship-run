# Dev Workflow & Environments

This is a small app for the maintainer and friends — "prod" just means "the live
app my friends use," not a high-stakes production system. Claude owns the whole
pipeline (stage **and** prod); the human approves promotions to prod.

## Environments

| Env | Supabase | Vercel | Notes |
|-----|----------|--------|-------|
| **Stage** | `plnfdfszuzomoumowasz` (`https://plnfdfszuzomoumowasz.supabase.co`) | Preview deploys + local `vercel dev` | Claude applies schema, seeds data, validates freely — no approval needed |
| **Prod** | `qdwuzvztnzxtouowjmjx` | `fellowship-run` (`fellowship-run.vercel.app`, Production) | Real friend data (≈9 users). Claude executes changes here too, but only **after the human approves** |

Both databases share one set of migration files as the source of truth, so they
stay in lockstep.

## Tooling

- **Supabase MCP** (`.mcp.json`, gitignored) configures **two** servers:
  `supabase-stage` and `supabase-prod`. Claude uses `mcp__supabase-stage__*`
  freely and `mcp__supabase-prod__*` only on an approved prod promotion.
  - MCP config loads at Claude Code **startup** — after editing `.mcp.json`,
    **restart Claude Code** (or `/mcp` reconnect) for both servers to connect.
- **Vercel** (CLI, logged in as `davis-pidgeon` / team `fellowship81`): repo
  linked to `fellowship-run` (`.vercel/`, gitignored). Claude runs deploys.
  - Production env vars point at **prod** Supabase (set 21d ago).
  - `CRON_SECRET` still needs adding to prod (`vercel env add CRON_SECRET production`).
- **Local env** (`.env.local`, gitignored): pulled from prod Vercel env (Strava
  creds + secrets reused), then repointed at the **stage** DB with
  `localhost:3000` redirects and a generated `CRON_SECRET`. The only value the
  human must fill is `SUPABASE_SERVICE_ROLE_KEY` for the **stage** project
  (Supabase dashboard → stage project → Settings → API).
- `.mcp.json`, `.env.local`, `.vercel/` are all gitignored.

## Running locally

```bash
vercel dev            # frontend + /api on http://localhost:3000, against the STAGE DB
npm test              # full Vitest suite
```

Strava OAuth locally needs the Strava app's Authorization Callback Domain to
include `localhost` (redirects use `http://localhost:3000`).

## Per-change pipeline (Claude drives all of it)

1. **Branch + code**, with any schema change written as a numbered file in
   `supabase/migrations/` (the source of truth applied to both DBs).
2. **Stage (no approval):** apply the migration to stage
   (`mcp__supabase-stage__apply_migration`), seed data
   (`mcp__supabase-stage__execute_sql`, reusable SQL in `scripts/`), run
   `npm test`, and validate the real flow in `vercel dev` (or a Preview deploy).
3. **Approval gate:** Claude summarizes what changed and exactly what the prod
   promotion will run.
4. **Prod (after approval — Claude executes):**
   - apply the same migration via `mcp__supabase-prod__apply_migration`,
   - `vercel env add …` for any new vars,
   - `vercel --prod` to deploy,
   - verify.

Claude never promotes to prod without an explicit "go." Everything on stage is
free-running.

## Current change: global-rankings

- Stage: `weekly_awards` migration applied by the human. Claude will confirm it,
  seed weekly-winner test data, and validate locally.
- Prod promotion (pending approval): apply `0006_weekly_awards.sql`, add
  `CRON_SECRET`, deploy `--prod`. (Prod also has a pre-existing RLS-disabled
  `backup_users_legacy_fellowship_20260720` table to drop or lock down.)
