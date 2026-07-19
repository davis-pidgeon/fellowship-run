# Per-Fellowship Stats & Ghost Player Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a runner's stats, sayings, achievements, and collections count only within each fellowship's own rules (start date + allowed activity types), and make Global-view ghosts more visible, color-matched, and clickable to open a player card.

**Architecture:** Mileage is already per-fellowship via `memberTotal`. Extend the same date+type filter to the activities that feed run count, pace, longest, week streak, sayings, and the profile activity list — via a new pure helper reused by `api/me.ts` and the global-ghost path. Persisted collections (`opened_quests`) and achievement-seen markers (`notified_achievements`) move from flat per-user arrays to per-fellowship JSON objects keyed by fellowship id (migration `0004`). Ghosts in the global endpoint gain per-fellowship stats/collections so the existing player-card UI can render them.

**Tech Stack:** TypeScript (strict), React 18 + Vite, react-leaflet, Vercel serverless functions (Node 22.x), Supabase (`@supabase/supabase-js`), Vitest + @testing-library/react.

## Global Constraints

- **Language:** TypeScript everywhere, `"strict": true`.
- **Per-fellowship filter:** an activity counts for a fellowship iff `allowedActivityTypes.has(sportType)` AND `new Date(runDate) >= new Date(startDate)` — identical to the existing `memberTotal` filter in `shared/fellowship-sync.ts`.
- **No local Postgres:** migrations are run manually against Supabase (SQL editor or `psql`), same as `0001`–`0003`.
- **Collections storage:** `users.opened_quests` and `users.notified_achievements` become `jsonb` objects shaped `{ [fellowshipId]: string[] }`. A missing key means "no notes/none-seen for that fellowship."
- **Prod schema caveat:** on production these two columns were added outside the tracked migrations; verify their actual type before running `0004` there. The test DB has them as `jsonb`.
- **Commits:** conventional commits, one per task minimum.

---

## File Structure

```
shared/
├── fellowship-sync.ts        # + activitiesForFellowship() pure helper
└── fellowship-sync.test.ts   # + tests for the helper

supabase/migrations/
└── 0004_per_fellowship_collections.sql   # NEW — reshape the two columns to per-fellowship jsonb

api/
├── me.ts             # filter stats/sayings per fellowship; return per-fellowship openedQuests; enrich global ghosts
├── quest-open.ts     # accept fellowshipId, update only that fellowship's slice
└── achievements-seen.ts  # accept fellowshipId, update only that fellowship's slice

src/
├── api-client.ts     # questOpen/achievementsSeen take fellowshipId; Ghost gains stats/openedQuests
├── pages/Dashboard.tsx   # pass fellowshipId to questOpen/achievementsSeen; open player card for a clicked ghost
└── components/MapView.tsx # ghost opacity up, colored aura, clickable -> onSelectGhost
```

---

### Task 1: Pure per-fellowship activity filter

**Files:**
- Modify: `shared/fellowship-sync.ts`
- Test: `shared/fellowship-sync.test.ts`

**Interfaces:**
- Consumes: `RunActivity`, `Fellowship` (`shared/types.ts`).
- Produces: `activitiesForFellowship(activities: RunActivity[], fellowship: Fellowship): RunActivity[]` — the subset of `activities` that count toward `fellowship`. Task 3 (`api/me.ts`) uses it to scope stats/sayings.

- [ ] **Step 1: Write the failing test**

Append to `shared/fellowship-sync.test.ts`:

```ts
import { activitiesForFellowship } from "./fellowship-sync";

describe("activitiesForFellowship", () => {
  it("keeps only activities matching the fellowship's type and date floor", () => {
    const activities = [
      run(1, 3, "2026-07-05T00:00:00Z", "Run"),      // ok
      run(2, 4, "2026-06-15T00:00:00Z", "Run"),      // before start_date — excluded
      run(3, 5, "2026-07-06T00:00:00Z", "Ride"),     // wrong type — excluded
      run(4, 2, "2026-07-07T00:00:00Z", "TrailRun"), // ok
    ];
    expect(activitiesForFellowship(activities, runningFellowship).map((a) => a.stravaActivityId))
      .toEqual([1, 4]);
  });
  it("returns an empty list when nothing matches", () => {
    expect(activitiesForFellowship([], runningFellowship)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run shared/fellowship-sync.test.ts`
Expected: FAIL — `activitiesForFellowship is not a function`.

- [ ] **Step 3: Implement the helper**

In `shared/fellowship-sync.ts`, add (and reuse it inside `memberTotal` to stay DRY):

```ts
export function activitiesForFellowship(activities: RunActivity[], fellowship: Fellowship): RunActivity[] {
  const floor = new Date(fellowship.startDate).getTime();
  const allowed = new Set(fellowship.allowedActivityTypes);
  return activities.filter((a) => allowed.has(a.sportType) && new Date(a.runDate).getTime() >= floor);
}
```

Then refactor `memberTotal` to build on it:

```ts
export function memberTotal(activities: RunActivity[], fellowship: Fellowship): number {
  return activitiesForFellowship(activities, fellowship).reduce((sum, a) => sum + a.distanceMiles, 0);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run shared/fellowship-sync.test.ts`
Expected: PASS (existing `memberTotal` tests still green + 2 new).

- [ ] **Step 5: Commit**

```bash
git add shared/fellowship-sync.ts shared/fellowship-sync.test.ts
git commit -m "feat: activitiesForFellowship helper for per-fellowship activity scoping"
```

---

### Task 2: Scope stats, sayings, and profile activities per fellowship in `/api/me`

**Files:**
- Modify: `api/me.ts`

**Interfaces:**
- Consumes: `activitiesForFellowship` (Task 1).
- Produces: no signature change — the fellowship-view `members[]` payload (stats, activities) is now computed from fellowship-scoped activities only.

There is no unit harness for the handler (same as the rest of `api/*`); this is verified manually per the spec's testing note.

- [ ] **Step 1: Filter each member's activities before aggregating**

In `api/me.ts`, in the fellowship (non-global) branch, wrap the per-activity loop so it only sees fellowship-scoped rows. Change the loop that builds `activitiesByUser`/`rawByUser`/`secByUser` (currently `for (const a of acts ?? [])`) to iterate fellowship-scoped activities per member. Concretely, replace the single flat loop with a per-member pass:

```ts
import { memberTotal, activitiesForFellowship } from "../shared/fellowship-sync.js";
// ...
// Group raw rows by user first.
const rowsByUser = new Map<string, typeof acts>();
for (const a of acts ?? []) {
  const list = rowsByUser.get(a.user_id) ?? [];
  list.push(a);
  rowsByUser.set(a.user_id, list);
}
// Then compute stats/sayings from ONLY the activities that count for THIS fellowship.
for (const [uid, rows] of rowsByUser) {
  const scoped = activitiesForFellowship(
    rows.map((a) => ({ stravaActivityId: a.strava_activity_id, distanceMiles: a.distance_miles ?? 0,
      runDate: a.run_date, name: a.name ?? "", sportType: a.sport_type, movingSeconds: a.moving_seconds ?? undefined })),
    fellowship
  );
  activitiesByUser.set(uid, scoped);
  const s = { runs: 0, longest: 0, sec: 0, secDist: 0, weeks: new Set<number>() };
  const raw: { name: string; date: string }[] = [];
  for (const a of scoped) {
    s.runs++; s.longest = Math.max(s.longest, a.distanceMiles);
    if (a.movingSeconds != null) { s.sec += a.movingSeconds; s.secDist += a.distanceMiles; }
    const t = a.runDate ? new Date(a.runDate).getTime() : NaN;
    if (!isNaN(t)) s.weeks.add(Math.floor(t / (7 * 86400000)));
    raw.push({ name: a.name || "Untitled run", date: a.runDate });
  }
  secByUser.set(uid, s);
  rawByUser.set(uid, raw);
}
```

Leave `memberTotal(memberActivities, fellowship)` as-is for `totalMiles` — but note `activitiesByUser` now already holds scoped activities, so `memberTotal` over it is unchanged in result. Remove the now-dead flat loop.

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification (deferred to end-to-end pass)**

With the seeded data, viewing a fellowship whose `start_date` is after some runs shows a lower run count / fewer sayings than a fellowship that starts earlier.

- [ ] **Step 4: Commit**

```bash
git add api/me.ts
git commit -m "feat: scope run count, pace, streak, and sayings to the viewed fellowship"
```

---

### Task 3: Migration — per-fellowship collections columns

**Files:**
- Create: `supabase/migrations/0004_per_fellowship_collections.sql`

**Interfaces:**
- Produces: `users.opened_quests` / `users.notified_achievements` as `jsonb` shaped `{ [fellowshipId]: string[] }`. Tasks 4–6 read/write these per fellowship.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0004_per_fellowship_collections.sql
-- Reshape the two collection columns from a flat array to a per-fellowship object.
-- PROD CAVEAT: confirm these columns are jsonb before running (they were added
-- outside the tracked migrations). If they are text[], first:
--   alter table users alter column opened_quests type jsonb using to_jsonb(opened_quests);
--   alter table users alter column notified_achievements type jsonb using to_jsonb(notified_achievements);
begin;

-- Nest each user's existing flat array under their single current fellowship
-- (every user has exactly one membership at this point — 0002 backfilled it).
update users u set opened_quests = jsonb_build_object(
  (select fm.fellowship_id::text from fellowship_members fm where fm.user_id = u.id order by fm.joined_at limit 1),
  coalesce(u.opened_quests, '[]'::jsonb)
)
where jsonb_typeof(u.opened_quests) = 'array'
  and exists (select 1 from fellowship_members fm where fm.user_id = u.id);

update users u set notified_achievements = jsonb_build_object(
  (select fm.fellowship_id::text from fellowship_members fm where fm.user_id = u.id order by fm.joined_at limit 1),
  coalesce(u.notified_achievements, '[]'::jsonb)
)
where jsonb_typeof(u.notified_achievements) = 'array'
  and exists (select 1 from fellowship_members fm where fm.user_id = u.id);

-- Any user with no membership (shouldn't happen) or an already-object value: normalize to {}.
update users set opened_quests = '{}'::jsonb where jsonb_typeof(opened_quests) <> 'object';
update users set notified_achievements = '{}'::jsonb where jsonb_typeof(notified_achievements) <> 'object';

alter table users alter column opened_quests set default '{}'::jsonb;
alter table users alter column notified_achievements set default '{}'::jsonb;

commit;
```

- [ ] **Step 2: Run it against the test DB**

Run: `psql "$TEST_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0004_per_fellowship_collections.sql`
Verify: `select opened_quests, notified_achievements from users;` shows `{}` (or a fellowship-keyed object) for every row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_per_fellowship_collections.sql
git commit -m "feat: migration reshaping collections to per-fellowship jsonb"
```

---

### Task 4: Per-fellowship read/write of collections in the API

**Files:**
- Modify: `api/me.ts`, `api/quest-open.ts`, `api/achievements-seen.ts`

**Interfaces:**
- Consumes: the reshaped columns (Task 3).
- Produces: `/api/me` returns `openedQuests` = the viewed fellowship's slice (and `members[].openedQuests` likewise). `POST /api/quest-open` and `/api/achievements-seen` accept `{ fellowshipId, ... }` and update only that key.

- [ ] **Step 1: `api/me.ts` — read the per-fellowship slice**

Where the handler currently selects `opened_quests, notified_achievements` and returns `openedQuests`/`notifiedAchievements`, read the current fellowship's slice:

```ts
const slice = (col: unknown, fid: string): string[] => {
  const obj = (col && typeof col === "object" && !Array.isArray(col)) ? col as Record<string, unknown> : {};
  return Array.isArray(obj[fid]) ? (obj[fid] as string[]) : [];
};
// user-level (top of response):
openedQuests: slice(user.opened_quests, fellowship.id),
notifiedAchievements: slice(user.notified_achievements, fellowship.id),
// members[].openedQuests: read m.opened_quests (add it to the members select) and slice by fellowship.id
```

Add `opened_quests` to the `members` select (line ~66) and set each `memberList[].openedQuests = slice(m.opened_quests, fellowship.id)`.

- [ ] **Step 2: `api/quest-open.ts` — update one fellowship's slice**

```ts
const fellowshipId = req.body?.fellowshipId as string | undefined;
if (!fellowshipId) return res.status(400).json({ error: "fellowshipId required" });
const { data: user } = await db.from("users").select("opened_quests").eq("id", userId).maybeSingle();
const all = (user?.opened_quests && typeof user.opened_quests === "object" && !Array.isArray(user.opened_quests))
  ? user.opened_quests as Record<string, string[]> : {};
const current: string[] = Array.isArray(all[fellowshipId]) ? all[fellowshipId] : [];
const openedQuests = current.includes(questId) ? current : [...current, questId];
if (openedQuests.length !== current.length) {
  await db.from("users").update({ opened_quests: { ...all, [fellowshipId]: openedQuests } }).eq("id", userId);
}
return res.status(200).json({ openedQuests });
```

- [ ] **Step 3: `api/achievements-seen.ts` — same per-fellowship pattern for `notified_achievements`**

Mirror Step 2 using `notified_achievements` and the request's `fellowshipId` + `ids`.

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors (callers updated in Task 5).

- [ ] **Step 5: Commit**

```bash
git add api/me.ts api/quest-open.ts api/achievements-seen.ts
git commit -m "feat: read/write collections per fellowship in the API"
```

---

### Task 5: Frontend passes `fellowshipId` for collection writes

**Files:**
- Modify: `src/api-client.ts`, `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: Task 4's endpoints.
- Produces: `api.questOpen(questId, fellowshipId)` and `api.achievementsSeen(ids, fellowshipId)`.

- [ ] **Step 1: Update `api-client.ts` signatures** to include `fellowshipId` in the POST body.

- [ ] **Step 2: Update `Dashboard.tsx` callers** to pass the current `fellowshipId` (from props) to `api.questOpen(...)` and `api.achievementsSeen(...)`.

- [ ] **Step 3: Type-check + tests**

Run: `npx tsc -b --noEmit && npm test`
Expected: no errors; update `src/api-client.test.ts` expectations if it asserts the old body shape.

- [ ] **Step 4: Commit**

```bash
git add src/api-client.ts src/pages/Dashboard.tsx src/api-client.test.ts
git commit -m "feat: send fellowshipId when opening notes / marking achievements seen"
```

---

### Task 6: Enrich global-view ghosts with per-fellowship stats & collections

**Files:**
- Modify: `api/me.ts` (global branch), `src/api-client.ts` (`Ghost` type)

**Interfaces:**
- Consumes: `activitiesForFellowship` (Task 1), the reshaped columns (Task 3).
- Produces: each `Ghost` gains `stats` (runs/longestMiles/avgMiles/avgPaceSecPerMile/weekStreak), `openedQuests`, matching the `Member` shape enough for the player card.

- [ ] **Step 1: In the global branch of `api/me.ts`**, for each membership compute `scoped = activitiesForFellowship(activities, fellowship)` and build the same `stats` object as the fellowship branch, plus `openedQuests = slice(user.opened_quests, f.id)`. Add these to each pushed ghost. (The user rows are already fetched into `usersById`; add `opened_quests` to that select.)

- [ ] **Step 2: Extend the `Ghost` type** in `src/api-client.ts` with `stats` and `openedQuests` (reusing the `Member["stats"]` shape).

- [ ] **Step 3: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/me.ts src/api-client.ts
git commit -m "feat: global ghosts carry per-fellowship stats and collections for the player card"
```

---

### Task 7: Ghost UI — visibility, color aura, clickable player card

**Files:**
- Modify: `src/components/MapView.tsx`, `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: enriched `Ghost` (Task 6).
- Produces: `MapView` gains `onSelectGhost?(ghost)`; ghosts render brighter with a colored aura and are clickable.

- [ ] **Step 1: `GhostOverlay` visibility + color aura**

In `MapView.tsx` `GhostOverlay`, raise opacity and add a color-matched glow in the `add` handler:

```ts
if (el) {
  el.style.imageRendering = "pixelated";
  el.style.opacity = "0.6";
  el.style.filter = `drop-shadow(0 0 4px ${ghost.color ?? "#fff"}) drop-shadow(0 0 6px ${ghost.color ?? "#fff"})`;
}
```

- [ ] **Step 2: Make ghosts clickable**

Set `interactive` true and add a click handler on the `ImageOverlay` that calls a new `onSelect?(ghost)` prop; thread `onSelectGhost` from `MapView` props into `GhostOverlay`.

- [ ] **Step 3: `Dashboard.tsx` — open the player card for a ghost**

Pass `onSelectGhost={(g) => setProfileDetail(ghostToMember(g))}` where `ghostToMember` maps the enriched ghost to the `Member` shape the existing `ProfileDetail` expects (`id: g.userId`, `displayName`, `chosenCharacter`, `color`, `totalMiles`, `openedQuests`, `stats`, `activities: []`). Reuse the already-rendered `ProfileDetail`.

- [ ] **Step 4: Type-check + tests + manual**

Run: `npx tsc -b --noEmit && npm test`
Manual: in Global view, ghosts are brighter with a colored halo; tapping one opens its player card with fellowship-scoped stats.

- [ ] **Step 5: Commit**

```bash
git add src/components/MapView.tsx src/pages/Dashboard.tsx
git commit -m "feat: brighter color-matched ghosts, clickable to open their player card"
```

---

## Deployment note (not a task)

Run `0004_per_fellowship_collections.sql` against production **after** verifying the actual column type of `opened_quests`/`notified_achievements` there (see the migration header), and after the new app code is deployed.
