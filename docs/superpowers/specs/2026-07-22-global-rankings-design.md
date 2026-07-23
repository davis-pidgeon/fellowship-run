# Global Rankings, Fellowship Cards & Trophies — Design Spec

**Date:** 2026-07-22
**Branch:** `global-rankings`
**Status:** Approved design

## Summary

A focused improvement to the **global view** of the LOTR running app, plus a new
trophy/collectible system. Fellowships pool members' Strava miles to race a map
route toward Mount Doom; the global view compares fellowships against each other.

This spec covers five interlocking pieces:

1. A **global ranking panel** that ranks fellowships (not members).
2. A **fellowship card** — the fellowship-level analog of the player card — with
   trophies and a members grid.
3. A **map-click fix** so ghosts (other fellowships' runners) are selectable in
   global view.
4. **Weekly winners** — fellowship-of-the-week (global) and member-of-the-week
   (per fellowship), locked at week's end by a cron job.
5. A **backpack restructure** into a unified, filterable inventory that holds
   postcards, letters, badges, and future collectables.

## Current architecture (context)

- **Fellowship view** (`MeResponse` via `GET /api/me`): members pooled toward the
  route; `StatsPanel` shows a member leaderboard; tapping a member opens
  `ProfileDetail` (full-screen tabbed player card).
- **Global view** (`GlobalResponse` via `GET /api/me?view=global`): returns
  `ghosts[]` — one per (user, fellowship) membership with that member's miles
  toward that fellowship. `MapView` renders my fellowship as full members plus
  everyone else as faded ghosts (Dashboard filters my own fellowship out of the
  ghost list).
- **Backpack** (`Passport`): a single scrolling "Your Journey" book — landmark
  postcards (scene + lore) and note-thread sections (letters + story). Opened
  quests are per-fellowship (`opened_quests` JSON sliced by fellowship id).
- **Milestone badges** (`milestone_awards` table): fellowship crosses a landmark
  → celebration modal. This is the existing "lands reached" data source.
- **Miles model:** `shared/fellowship-sync.ts` — `memberTotal`,
  `activitiesForFellowship`, `multiplierFor`. Activities carry `run_date`,
  `distance_miles`, `sport_type`, `moving_seconds`.

## Definitions

- **Week:** ISO-style calendar week, **Monday 00:00 → Sunday 23:59:59 UTC**.
  A single `weekStart(date)` helper (UTC Monday) is the one source of truth,
  used for winner-locking, "this week" rankings, and "last-week" member miles.
- **Completed week:** a week whose Sunday is strictly in the past.
- **This week / current week:** the in-progress week.
- **Last week:** the most recently *completed* week.
- **Week miles for X:** sum of fellowship-scoped, multiplier-applied miles for
  activities whose `run_date` falls in that week. Reuses `multiplierFor` /
  `activitiesForFellowship` so filters and multipliers stay consistent.

## 1. Global ranking panel (Option C)

In global view, the bottom-left panel is a **fellowship** ranking, not a member
leaderboard. Implemented as a **new `GlobalRankingPanel` component**; Dashboard
renders `StatsPanel` in fellowship view and `GlobalRankingPanel` in global view
(keeps each component focused rather than overloading `StatsPanel`).

**Collapsed (default):**
- Metric toggle: **Pooled miles** / **Per-capita average**.
- **Top 3 all-time** fellowships for the selected metric.
- **Top 3 this-week** fellowships (miles added this week) below.
- Your fellowship row highlighted; 👑 on the current progress leader (see §4).
- "See full rankings ⤢" button.

**Expanded:**
- Pane animates open (~380ms, `cubic-bezier(.22,.9,.28,1)` on width/height/inset)
  to take over most (not all) of the screen — margins preserved.
- Shows **all** fellowships in two scrollable columns (All-time / This week) for
  the selected metric. Tapping the header ⤢ collapses it back.

**Data:** the global response returns lean per-fellowship ranking rows (see
§API). Panel does no heavy per-member work.

## 2. Fellowship card

A full-screen modal (`FellowshipCard`), the fellowship-level analog of
`ProfileDetail`. Opened by:
- Tapping a fellowship row in `GlobalRankingPanel`, or
- The **bottom-left 🏆 shortcut button** (user-supplied icon) — opens *your*
  current fellowship's card. Sits opposite the existing 🌐 globe button.

**Header:** fellowship name (colored), standing line — 👑 if currently #1 by
progress, miles-to-Mount-Doom, member count.

**Tab: Trophies**
- **Crown standing** (lit 👑 only if #1 globally by progress).
- **Weekly Victories** shelf: one badge per week won, newest first. Pooled-win
  and per-capita-win use **distinct art**.
- **Lands Reached** shelf: a medal per landmark; landmarks not yet reached shown
  **greyed out** so the collection reads as completable. Source: existing
  `milestone_awards` (fellowship scope) / route landmark list.

**Tab: Members**
- Character-select-style **grid of tiles** (`character-grid` visual language),
  each **bordered/tinted with the member's chosen marker color**.
- Each tile: character sprite (glowing in color), display name + character name,
  **total miles** and **last-week miles**.
- **Sorted by last-week miles** (most active first), with a small "#N this wk"
  rank tag. Scrolls for large fellowships.

**Data:** fetched on demand via a new `GET /api/fellowship?fellowshipId=`
(keeps the global response lean; the card payload is heavy).

## 3. Map clicking fix (global view)

Today `onSelectRunner` clusters only `members`; ghosts each have a separate
single-click handler and overlap makes them unclickable, with my fellowship's
sprites winning taps.

**Fix:** in global view, treat ghosts as first-class selectable runners.
- Compute cluster membership across **members + ghosts together** using the same
  `CLUSTER_DIST` proximity logic and stagger positions.
- A tap returns everyone nearby → `ClusterPicker` → player card. Ghosts already
  map cleanly to `Member` via `ghostToMember`, so the existing picker and
  `ProfileDetail` work unchanged for both.
- Single-runner taps open the card directly, as today.

Fellowship view behavior is unchanged (no ghosts present).

## 4. Weekly winners (locked at week's end)

### Winners
- **Fellowship of the week (global scope):** two winners per completed week —
  most **pooled** week-miles, and most **per-capita** week-miles (pooled ÷ member
  count). Each is a weekly-win badge in the winning fellowship's trophy case.
- **Member of the week (per-fellowship scope):** within each fellowship, the
  member with the most week-miles → a badge in that member's backpack. Pooled
  only (per-capita is meaningless for an individual).

### Locking & storage
- New table **`weekly_awards`**:
  - `week_start date` (UTC Monday)
  - `scope text check in ('global_pooled','global_percapita','member')`
  - `fellowship_id uuid` (winner for global scopes; the member's fellowship for
    member scope)
  - `user_id uuid null` (the winning member for member scope; null otherwise)
  - `metric_value double precision` (winning value, for display/tiebreak audit)
  - `created_at timestamptz default now()`
  - Uniqueness (two partial unique indexes, so each scope is enforced exactly):
    - `unique (week_start, fellowship_id) where scope = 'member'` — one member
      winner per fellowship per week.
    - `unique (week_start, scope) where scope in ('global_pooled','global_percapita')`
      — exactly one global winner per scope per week, regardless of which
      fellowship won.
  - RLS enabled, no policies (service-role only), matching existing tables.
- **Cron endpoint** `POST /api/cron/finalize-weeks` (Vercel cron, weekly, e.g.
  Monday 00:10 UTC):
  - Finds every **completed** week from the earliest activity forward that lacks
    a full set of `weekly_awards` rows.
  - Computes winners from activities by `run_date` at run time and inserts rows.
  - **Idempotent**: a missed run self-heals on the next run; already-recorded
    weeks are frozen (late backfills don't change them). Uses a Vercel cron
    secret / auth header to reject public calls.
  - Ties: deterministic tiebreak (highest metric, then lowest fellowship/user id)
    so re-runs are stable.

### Badges surfaced
- **Trophy case** reads `weekly_awards` (global scopes) for that fellowship.
- **Backpack** reads `weekly_awards` (member scope) for the current user in the
  current fellowship (added to `MeResponse`).
- **Celebration:** when a newly-earned weekly badge is first seen (member badge
  for you, or a fellowship badge for your fellowship), pop a toast/celebration
  consistent with the existing `AchievementToasts` / `CelebrationModal` pattern
  (reuse the "seen" seeding approach so pre-existing badges don't flood).

## 5. Backpack restructure (Option C + reading)

`Passport` becomes a unified, filterable inventory ("Your Journey"):

- **Default "All" view:** a grid of collectible tiles ordered **most-recent
  first, top-left descending**. Item types: Postcards (landmarks), Letters
  (notes), Badges (member-of-week wins), and future Items/collectables.
- **Filter chips:** All / Postcards / Letters / Badges / Items.
- **Tap any tile → full-size reader:** letters open as the aged parchment,
  postcards open with scene art + lore, badges show what/when won.
- **Narrative filters auto-switch to a reading list:** selecting **Letters** or
  **Postcards** renders a reading-friendly list (title + thread + mileage)
  instead of tiny tiles. **Badges/Items stay grid tiles.**
- Recency ordering needs an earned-at timestamp per item: postcards by landmark
  cumulative miles / reached time, letters by opened time, badges by
  `week_start`. Where exact timestamps aren't stored (e.g. opened quests are an
  id list), fall back to a stable proxy (reveal miles / week) — acceptable for
  ordering.
- Scope: badges and collectibles shown are **per current fellowship**,
  consistent with existing per-fellowship note scoping.

## API changes

- `GET /api/me?view=global` (global response) gains per-fellowship **ranking
  rows**: `{ id, name, pooledMiles, memberCount, weekPooled, weekPerCapita,
  isProgressLeader }`. Keep `ghosts[]` for the map. `weekPooled` /
  `weekPerCapita` computed from activities by `run_date` in the current week.
- `GET /api/me` (fellowship response) gains `weeklyBadges` for the current user
  in the current fellowship (member-scope `weekly_awards`), for the backpack +
  celebration.
- **New** `GET /api/fellowship?fellowshipId=` → full fellowship-card payload:
  standing (miles, progress %, isLeader, memberCount), weekly-win badges
  (global scopes for this fellowship), lands reached (landmark ids + total),
  and members `[{ id, displayName, character, color, totalMiles, lastWeekMiles }]`.
- **New** `POST /api/cron/finalize-weeks` (cron-only, auth-guarded).
- Shared: add `weekStart(date)` and week-miles helpers to `shared/` (e.g.
  `shared/weeks.ts`) with unit tests; reuse `multiplierFor` /
  `activitiesForFellowship`.

## Frontend components

- **New** `GlobalRankingPanel` (replaces `StatsPanel` in global view).
- **New** `FellowshipCard` (tabbed modal: Trophies / Members).
- **New** trophy-shortcut button (bottom-left) in `Dashboard`.
- **Edit** `MapView`: unified member+ghost cluster selection in global view.
- **Edit** `Passport`: inventory grid + filter chips + tap-to-read +
  narrative reading-list.
- **Edit** `Dashboard`: swap panels by view; wire `FellowshipCard` open/close
  from ranking rows and the shortcut; weekly-badge celebration.

## Assets (user-provided images)

Wired behind clear public paths so art drops in without code changes:
- Weekly-win badges — pooled + per-capita variants (`/badges/week-pooled.png`,
  `/badges/week-percapita.png` or similar).
- Location medals — per landmark (`/medals/<landmarkId>.png`).
- Crown (`/crown.png`), member-of-week badge (`/badges/member-week.png`),
  trophy-case shortcut icon (`/trophy.png`).

Exact filenames finalized during implementation; greyed/locked states derived in
CSS (grayscale + opacity), not separate art.

## Testing

- **Shared:** unit-test `weekStart` (UTC Monday boundaries, year edges) and
  week-miles aggregation (multipliers, type filters, boundary run_dates).
- **Cron:** test idempotency (re-run inserts nothing new), missed-week
  self-heal, tie determinism, and that backfilled runs into a locked week don't
  change the recorded winner.
- **API:** `/api/fellowship` payload shape; global ranking rows (pooled vs
  per-capita ordering; leader flag; empty/edge fellowships).
- **Frontend:** ranking panel collapse/expand and metric toggle; fellowship card
  tabs and last-week sort; map cluster selection includes ghosts; backpack
  filter switching (grid ↔ reading list) and recency order.

## Build phases (for the implementation plan)

1. **Foundations:** `shared/weeks.ts` + helpers + tests; `weekly_awards`
   migration.
2. **Cron finalizer:** `/api/cron/finalize-weeks` + Vercel cron config + tests.
3. **Global rankings API + panel:** ranking rows in global response;
   `GlobalRankingPanel` with expand animation.
4. **Fellowship card:** `/api/fellowship` endpoint; `FellowshipCard` (both tabs);
   trophy shortcut button; open from ranking rows.
5. **Map click fix:** unified member+ghost clustering in global view.
6. **Weekly badges surfacing:** trophy case + backpack member badges +
   celebration toasts.
7. **Backpack restructure:** inventory grid, filters, tap-to-read, reading-list.
8. **Assets pass:** drop in provided art behind the wired paths.

## Non-goals / YAGNI

- No per-metric crowns (single global progress crown only).
- No historical trophy timeline beyond the badge shelves.
- Future collectables/items: the backpack accommodates them structurally, but no
  specific new item types are designed here.
