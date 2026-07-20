# Deploy Guide — Multiple Fellowships branch → Production

> **For a fresh Claude session:** read this file top to bottom before doing anything. It is the source of truth for shipping the `mulitiple-fellowships-impl` branch to production. Do the steps **in order** — the migration ordering is load-bearing. Steps marked **[USER]** must be done by the human (production database, Strava settings, secrets — Claude cannot and must not touch these). Steps marked **[CLAUDE]** are git/deploy actions Claude can run once the user gives the go-ahead.

## What's shipping

The `mulitiple-fellowships-impl` branch (worktree: `.worktrees/mulitiple-fellowships-impl`) adds:
- Multiple fellowships per user (join table, per-fellowship start date + allowed activity types + optional dedicated Strava app), an admin screen, a fellowship switcher, and a Global "ghost" view.
- Per-fellowship stats/sayings/achievements/collections.
- Per-activity-type mileage **multipliers** (e.g. Run ×2.5, Ride ×0.1) with an admin edit UI. Multiplier scales journey total / longest / average; **pace stays on real distance**.
- "Most common activity" is computed server-side but intentionally **not** shown on the player card.
- Middle-earth globe icon for the Global toggle.

## Environment facts

- **Repo remote:** `github.com/davis-pidgeon/fellowship-run` (git auth via `gh auth setup-git` if push fails with "could not read Username").
- **Feature branch:** `mulitiple-fellowships-impl` (pushed to origin). Production branch: `main`.
- **Hosting:** Vercel project `fellowship-run` → auto-deploys `main` to production at `https://fellowship-run.vercel.app`. **Merging/pushing to `main` triggers the production deploy.**
- **Prod database:** Supabase project ref **`qdwuzvztnzxtouowjmjx`** (`https://qdwuzvztnzxtouowjmjx.supabase.co`). Migrations run in the Supabase **SQL editor** (there is no local Postgres; this is how `0001` was applied).
- **Migrations to apply:** `supabase/migrations/0002` … `0005` (0001 is already on prod). They have **only been rehearsed on a fresh throwaway test DB (`plnfdfszuzomoumowasz`), not on a copy of real prod data** — hence the snapshot step below is important.

## ⚠️ Two things that break prod if skipped

1. **[USER] Revert the Strava callback domain.** During local testing it was changed to `localhost`. Before real users sign in, set it back on <https://www.strava.com/settings/api> → *Authorization Callback Domain* → **`fellowship-run.vercel.app`**. (The Strava app is client id `262532`. Prod Vercel env vars already hold the correct prod redirect URI; only Strava's dashboard setting needs reverting.)
2. **[USER] Snapshot the prod database first.** Supabase → project `qdwuzvztnzxtouowjmjx` → Database → Backups → take a manual backup. This is the rollback safety net.

## Deploy sequence (do in this exact order)

### Phase 1 — pre-deploy migrations (additive; safe while the OLD code is still live)

- [x] **[USER]** Run `supabase/migrations/0002_multiple_fellowships.sql` in the prod SQL editor.
- [x] **[USER]** Run the two manual follow-ups from `0002`'s trailing comments:
  - If the deployed `JOURNEY_START_DATE` env var ≠ `2026-07-01`: `update fellowship set start_date = '<that value>' where id = (select id from fellowship order by created_at limit 1);`
  - Make yourself admin: `update users set is_admin = true where id = '<your user id>';` (find your id in the `users` table).
  - Sanity check: `select count(*) from fellowship_members;` should equal `select count(*) from users;`
- [x] **[USER]** Run `supabase/migrations/0005_activity_multipliers.sql` (additive column, default `{}` → ×1.0).
- [x] **[USER]** Verify the `0004` prerequisite: confirm `users.opened_quests` and `users.notified_achievements` are **`jsonb`** on prod (they exist already from the notes/achievements features). Run: `select data_type from information_schema.columns where table_schema='public' and table_name='users' and column_name in ('opened_quests','notified_achievements');` — **confirmed `jsonb` on prod; no pre-step needed.**
  - If they are `ARRAY`/`text[]` instead of `jsonb`, first run the two `alter … type jsonb using to_jsonb(...)` lines from the header comment of `0004_per_fellowship_collections.sql`.

> Why not `0004`/`0003` yet: `0004` reshapes `opened_quests`/`notified_achievements` into a per-fellowship object shape that the OLD code can't read (it expects flat arrays), and `0003` drops `users.fellowship_id`/`total_miles` that the OLD code still needs. Both must wait until the new code is live.

### Phase 2 — deploy the code

- [x] **[CLAUDE]** Open the PR: `mulitiple-fellowships-impl` → `main` (e.g. `gh pr create --base main --head mulitiple-fellowships-impl`). Confirm the branch is green (`npx tsc -b --noEmit && npm test`). — merged as PR #1, `main` @ `51bf5b2`.
- [x] **[CLAUDE]** After the user confirms Phase 1 migrations are in, merge the PR to `main` and push. Vercel auto-deploys `main` to production. Wait for the deploy to succeed.
  - ⚠️ **Auto-deploy did NOT fire** for the merge (no deployment appeared ~30 min after `51bf5b2` landed; no GitHub checks either). Deployed **manually** instead: `vercel --prod` from a clean worktree pinned to `51bf5b2` → `dpl_3B9W46yptSphGrtQeF2L8SkC7HBQ`, READY, aliased to `fellowship-run.vercel.app`. **Investigate the GitHub→Vercel auto-deploy wiring before the next ship.**

### Phase 3 — post-deploy migrations (run immediately after the deploy is live)

- [x] **[USER]** Run `supabase/migrations/0004_per_fellowship_collections.sql` (reshapes collections; the now-live new code reads them correctly). — run via Supabase MCP; verified all 6 users now object-shaped, 0 array leftovers.
- [x] **[USER]** Run `supabase/migrations/0003_drop_legacy_fellowship_columns.sql` (drops the legacy `users.fellowship_id` / `total_miles`). — snapshotted the dropped data into table `backup_users_legacy_fellowship_20260720` (6/6 rows) first, then dropped both columns; verified gone.

### Phase 4 — verify

- [ ] Load <https://fellowship-run.vercel.app>, sign in, confirm existing members still see their mileage and position.
- [ ] Confirm the admin screen is reachable (gear → ⚔ Admin) and can create/edit a fellowship + set multipliers.
- [ ] Confirm the Global (🌐) view shows ghosts and player cards open.
- [ ] A first-time sign-in works (proves the Strava callback domain revert took).

## Rollback

- **Code:** in Vercel, promote the previous production deployment (instant revert). Or revert the merge commit on `main` and push.
- **Data:** to undo `0003` specifically, restore the two dropped columns from the snapshot table `backup_users_legacy_fellowship_20260720` (holds `id` + old `fellowship_id` / `total_miles` for all users). A full-DB Supabase dashboard backup was *not* taken (MCP has no full-backup tool); take one from the dashboard if you want a whole-DB restore point. Safe to `drop table backup_users_legacy_fellowship_20260720` once prod is confirmed healthy.

## Known non-blocking notes (from the code reviews — no action required)

- `isValidMultipliers` doesn't reject unknown activity-type keys (harmless — only real sport types are ever looked up).
- Global-view ghosts use an N+1 query pattern (fine at current roster sizes).
- `AdminFellowshipsPanel.buildMultipliers()` is implicitly typed `any` (runtime values are correct numbers).

## Current state (update this when things change)

_Last updated: 2026-07-19 (evening)._

**DEPLOYED & MIGRATED.** `main` @ `51bf5b2` is live in production (`fellowship-run.vercel.app`, deployment `dpl_3B9W46yptSphGrtQeF2L8SkC7HBQ`). All migrations `0002`–`0005` are applied and verified on prod (`qdwuzvztnzxtouowjmjx`). Prod returns HTTP 200.

Note: the deploy was **manual** (`vercel --prod`) — GitHub→Vercel auto-deploy did not fire on the merge. Also note local `main` had to be fast-forwarded to `origin/main` (the PR merge only landed on the remote).

**Still outstanding (deferred — pick up later):**
- ⚠️ **[USER] Revert the Strava callback domain** to `fellowship-run.vercel.app` at <https://www.strava.com/settings/api> (still on `localhost` from local testing). **First-time sign-ins fail until this is done.**
- **[USER] Phase 4 human verification** (existing members' mileage; admin screen; Global 🌐 view; a fresh sign-in). Not yet performed.
- **Investigate why auto-deploy didn't trigger** so future pushes to `main` deploy on their own.
- Optional cleanup once healthy: `drop table backup_users_legacy_fellowship_20260720;`
