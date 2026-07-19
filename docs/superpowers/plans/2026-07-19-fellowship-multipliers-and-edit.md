# Fellowship Activity Multipliers + Edit UI + Most-Common Activity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each fellowship a per-activity-type mileage multiplier (e.g. Run ×2.5, Ride ×0.1), let admins edit a fellowship after creation, and show each runner's most-common activity on their player card.

**Architecture:** Add a `fellowship.activity_multipliers` jsonb column (`{ [type]: number }`, default `{}` → ×1.0). A pure `multiplierFor(fellowship, type)` scales distance in `memberTotal` (journey total) and in `computeStats` for longest run and average — but NOT for pace, which stays on raw distance. `computeStats` also returns `mostCommonActivity` (the mode of `sport_type`). The admin panel gains an edit mode and a per-type multiplier input, wired to the existing `PATCH /api/admin/fellowships` + `adminUpdateFellowship`.

**Tech Stack:** TypeScript (strict), React 18 + Vite, Vercel serverless functions (Node 22.x), Supabase, Vitest + @testing-library/react.

## Global Constraints

- **Language:** TypeScript everywhere, `"strict": true`.
- **Multiplier lookup:** `multiplierFor(fellowship, sportType) = fellowship.activityMultipliers?.[sportType] ?? 1`. A missing/absent type multiplier is **1.0** (so existing fellowships with `{}` are unchanged).
- **What the multiplier scales:** journey total (`memberTotal`), `longestMiles`, and `avgMiles`. **Pace (`avgPaceSecPerMile`) uses RAW distance** — never multiplied. Run **count** is a raw activity count (unmultiplied).
- **Storage:** `fellowship.activity_multipliers jsonb not null default '{}'::jsonb`, shaped `{ [activityType]: number }`. Only non-negative finite numbers; keys should be among the fellowship's allowed types.
- **Most-common activity:** the `sport_type` with the highest occurrence count among a member's fellowship-scoped activities; `null` when there are no scoped activities. Ties resolve to the first type reaching the max.
- **No local Postgres:** migrations run manually against Supabase; the controller applies them.
- **Commits:** conventional commits, one per task minimum.

---

## File Structure

```
supabase/migrations/
└── 0005_activity_multipliers.sql   # NEW — add fellowship.activity_multipliers jsonb

shared/
├── types.ts              # Fellowship gains activityMultipliers?: Record<string, number>
├── fellowship-sync.ts     # + multiplierFor(); memberTotal scales by multiplier
└── fellowship-sync.test.ts # + tests

api/
├── me.ts                 # computeStats(activities, fellowship): scale longest/avg (not pace), add mostCommonActivity; load activity_multipliers in both branches
├── sync.ts               # load activity_multipliers into Fellowship objects for computeFellowshipTotals
└── admin/fellowships.ts  # POST/PATCH accept+validate+store activity_multipliers; GET returns them

src/
├── api-client.ts         # RunStats.mostCommonActivity; AdminFellowship + admin method bodies gain activityMultipliers
├── components/AdminFellowshipsPanel.tsx  # edit mode + per-type multiplier inputs
└── components/ProfileDetail.tsx          # render "Most common activity"
```

---

### Task 1: Migration — `activity_multipliers` column

**Files:**
- Create: `supabase/migrations/0005_activity_multipliers.sql`

**Interfaces:**
- Produces: `fellowship.activity_multipliers jsonb not null default '{}'::jsonb`. Tasks 3–6 read/write it.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_activity_multipliers.sql
-- Per-activity-type mileage multiplier for each fellowship, shaped { "Run": 2.5, "Ride": 0.1 }.
-- A type absent from the map (or an empty map) means multiplier 1.0, so existing
-- fellowships are unchanged.
alter table fellowship
  add column activity_multipliers jsonb not null default '{}'::jsonb;
```

- [ ] **Step 2: Commit** (the CONTROLLER applies it to the DB — the implementer only writes + commits the file, and must NOT run psql)

```bash
git add supabase/migrations/0005_activity_multipliers.sql
git commit -m "feat: migration adding fellowship.activity_multipliers"
```

---

### Task 2: `multiplierFor` + multiplier-aware `memberTotal`

**Files:**
- Modify: `shared/types.ts`, `shared/fellowship-sync.ts`
- Test: `shared/fellowship-sync.test.ts`

**Interfaces:**
- Produces: `Fellowship.activityMultipliers?: Record<string, number>`; `multiplierFor(fellowship: Fellowship, sportType: string): number`; `memberTotal` now returns `sum(distanceMiles * multiplierFor(...))`. Task 3 (`computeStats`) imports `multiplierFor`.

- [ ] **Step 1: Add the field to the `Fellowship` type**

In `shared/types.ts`, change the `Fellowship` interface to:

```ts
export interface Fellowship {
  id: string;
  name: string;
  startDate: string; // ISO date, e.g. "2026-07-01"
  allowedActivityTypes: string[];
  activityMultipliers?: Record<string, number>; // { [sportType]: multiplier }; absent => 1.0
}
```

- [ ] **Step 2: Write the failing tests**

Append to `shared/fellowship-sync.test.ts`:

```ts
import { multiplierFor } from "./fellowship-sync";

describe("multiplierFor", () => {
  it("returns the configured multiplier for a type", () => {
    const f: Fellowship = { ...runningFellowship, activityMultipliers: { Run: 2.5, TrailRun: 0.5 } };
    expect(multiplierFor(f, "Run")).toBe(2.5);
    expect(multiplierFor(f, "TrailRun")).toBe(0.5);
  });
  it("defaults to 1 for types with no multiplier or no map", () => {
    expect(multiplierFor(runningFellowship, "Run")).toBe(1);
    const f: Fellowship = { ...runningFellowship, activityMultipliers: { Run: 2.5 } };
    expect(multiplierFor(f, "TrailRun")).toBe(1);
  });
});

describe("memberTotal with multipliers", () => {
  it("scales each activity's distance by its type multiplier", () => {
    const f: Fellowship = { ...runningFellowship, activityMultipliers: { Run: 2, TrailRun: 0.5 } };
    const activities = [
      run(1, 3, "2026-07-05T00:00:00Z", "Run"),      // 3 * 2 = 6
      run(2, 4, "2026-07-06T00:00:00Z", "TrailRun"), // 4 * 0.5 = 2
    ];
    expect(memberTotal(activities, f)).toBe(8);
  });
  it("treats a missing multiplier as 1", () => {
    const activities = [run(1, 5, "2026-07-05T00:00:00Z", "Run")];
    expect(memberTotal(activities, runningFellowship)).toBe(5);
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npx vitest run shared/fellowship-sync.test.ts`
Expected: FAIL — `multiplierFor is not a function` and the scaled-total expectations fail.

- [ ] **Step 4: Implement**

In `shared/fellowship-sync.ts`, add `multiplierFor` and update `memberTotal` (keep `activitiesForFellowship` returning RAW filtered activities — do not scale there):

```ts
export function multiplierFor(fellowship: Fellowship, sportType: string): number {
  return fellowship.activityMultipliers?.[sportType] ?? 1;
}

export function memberTotal(activities: RunActivity[], fellowship: Fellowship): number {
  return activitiesForFellowship(activities, fellowship)
    .reduce((sum, a) => sum + a.distanceMiles * multiplierFor(fellowship, a.sportType), 0);
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run shared/fellowship-sync.test.ts`
Expected: PASS (all prior tests still green + the new ones).

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts shared/fellowship-sync.ts shared/fellowship-sync.test.ts
git commit -m "feat: per-activity-type multiplier scaling in memberTotal"
```

---

### Task 3: Multiplier-aware `computeStats` (pace raw) + most-common activity, in `/api/me`

**Files:**
- Modify: `api/me.ts`

**Interfaces:**
- Consumes: `multiplierFor` (Task 2).
- Produces: `computeStats(activities, fellowship)` returns `{ runs, longestMiles, avgMiles, avgPaceSecPerMile, weekStreak, mostCommonActivity: string | null }` where `longestMiles`/`avgMiles` are multiplier-scaled but `avgPaceSecPerMile` uses raw distance. Both `/api/me` branches now load `activity_multipliers` and pass the fellowship. The `members[].stats` and ghost `stats` payloads gain `mostCommonActivity`. Task 7 (`RunStats`) types this field.

Handler has no unit harness; gate is `npx tsc -b --noEmit` (must be clean).

- [ ] **Step 1: Rewrite `computeStats` to take the fellowship, scale non-pace mileage, and compute the mode**

Import `multiplierFor` at the top of `api/me.ts` (from `../shared/fellowship-sync.js`, which is already imported for `memberTotal`/`activitiesForFellowship` — add `multiplierFor` to that import). Replace the `computeStats` function with:

```ts
function computeStats(activities: RunActivity[], fellowship: Fellowship) {
  let runs = 0, longest = 0, scaledTotal = 0, sec = 0, secDist = 0;
  const weeks = new Set<number>();
  const typeCounts = new Map<string, number>();
  for (const a of activities) {
    runs++;
    const mult = multiplierFor(fellowship, a.sportType);
    const scaled = a.distanceMiles * mult;
    longest = Math.max(longest, scaled);
    scaledTotal += scaled;
    if (a.movingSeconds != null) { sec += a.movingSeconds; secDist += a.distanceMiles; } // pace: RAW distance
    const t = a.runDate ? new Date(a.runDate).getTime() : NaN;
    if (!isNaN(t)) weeks.add(Math.floor(t / (7 * 86400000)));
    typeCounts.set(a.sportType, (typeCounts.get(a.sportType) ?? 0) + 1);
  }
  let mostCommonActivity: string | null = null;
  let best = 0;
  for (const [type, count] of typeCounts) {
    if (count > best) { best = count; mostCommonActivity = type; }
  }
  return {
    runs, longestMiles: longest,
    avgMiles: runs ? scaledTotal / runs : 0,
    avgPaceSecPerMile: secDist > 0 ? sec / secDist : null,
    weekStreak: maxWeekStreak(weeks),
    mostCommonActivity,
  };
}
```

Note `Fellowship` is already imported in `api/me.ts` (`import type { Fellowship, RunActivity } from "../shared/types.js"`).

- [ ] **Step 2: Pass the fellowship at both call sites**

- Global branch: `stats: computeStats(scoped)` → `stats: computeStats(scoped, fellowship)` where `fellowship` is that ghost's own `Fellowship` object (the one built from `f` in the global loop — it already carries `id/name/startDate/allowedActivityTypes`; Step 3 adds `activityMultipliers` to it).
- Fellowship branch: `stats: computeStats(memberActivities)` → `stats: computeStats(memberActivities, fellowship)` (the viewed `fellowship`).

- [ ] **Step 3: Load `activity_multipliers` into every `Fellowship` object built in this handler**

Add `activity_multipliers` to the fellowship selects and map it. There are three places `Fellowship` objects are built in `api/me.ts`; for each, add `activity_multipliers` to the `select(...)` on `fellowship`/`fellowship:fellowship_id(...)` and set `activityMultipliers: f.activity_multipliers ?? {}` on the mapped object:
  1. The viewed-fellowship membership query (`myFellowships` mapping).
  2. The global-branch `allMemberships` query (per-ghost `fellowship`).
Match the existing mapping style, e.g.:

```ts
// in the select string, add: , activity_multipliers
// in the object map, add: activityMultipliers: (f.activity_multipliers as Record<string, number>) ?? {},
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add api/me.ts
git commit -m "feat: multiplier-scaled stats (pace raw) and most-common activity in /api/me"
```

---

### Task 4: Wire multipliers through `sync`

**Files:**
- Modify: `api/sync.ts`

**Interfaces:**
- Consumes: multiplier-aware `memberTotal` (Task 2).
- Produces: the `Fellowship` objects `sync` passes to `computeFellowshipTotals` carry `activityMultipliers`, so milestone crossings use scaled mileage.

Handler has no unit harness; gate is `npx tsc -b --noEmit`.

- [ ] **Step 1: Load `activity_multipliers` in the memberships query**

In `api/sync.ts`, find where it selects the user's fellowships (the `fellowship:fellowship_id(id, name, start_date, allowed_activity_types)` select feeding `computeFellowshipTotals`). Add `activity_multipliers` to that select, and set `activityMultipliers: f.activity_multipliers ?? {}` on each mapped `Fellowship` object (match the existing mapping).

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/sync.ts
git commit -m "feat: sync applies per-fellowship activity multipliers to milestone mileage"
```

---

### Task 5: Admin endpoint stores + validates multipliers

**Files:**
- Modify: `api/admin/fellowships.ts`
- Test: `api/admin/fellowships.test.ts`

**Interfaces:**
- Produces: `isValidMultipliers(m: unknown): m is Record<string, number>` (exported, mirrors `isValidActivityTypes`); `GET` returns `activityMultipliers`; `POST`/`PATCH` accept and store `activity_multipliers`.

- [ ] **Step 1: Write the failing test for the validator**

Append to `api/admin/fellowships.test.ts`:

```ts
import { isValidMultipliers } from "./fellowships";

describe("isValidMultipliers", () => {
  it("accepts an object of non-negative finite numbers", () => {
    expect(isValidMultipliers({ Run: 2.5, Ride: 0.1, Walk: 0 })).toBe(true);
  });
  it("accepts an empty object", () => {
    expect(isValidMultipliers({})).toBe(true);
  });
  it("rejects negative or non-finite values", () => {
    expect(isValidMultipliers({ Run: -1 })).toBe(false);
    expect(isValidMultipliers({ Run: Infinity })).toBe(false);
  });
  it("rejects non-object / non-number values", () => {
    expect(isValidMultipliers(null)).toBe(false);
    expect(isValidMultipliers([2.5])).toBe(false);
    expect(isValidMultipliers({ Run: "2.5" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run api/admin/fellowships.test.ts`
Expected: FAIL — `isValidMultipliers is not a function`.

- [ ] **Step 3: Implement the validator and store the column**

In `api/admin/fellowships.ts`, add:

```ts
export function isValidMultipliers(m: unknown): m is Record<string, number> {
  if (typeof m !== "object" || m === null || Array.isArray(m)) return false;
  return Object.values(m as Record<string, unknown>).every(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0
  );
}
```

- In `GET`: add `activity_multipliers` to the fellowship select, and include `activityMultipliers: f.activity_multipliers ?? {}` in each returned object.
- In `POST`: read `const activityMultipliers = req.body?.activityMultipliers ?? {};`, `if (!isValidMultipliers(activityMultipliers)) return res.status(400).json({ error: "invalid multipliers" });`, and add `activity_multipliers: activityMultipliers` to the `insert({...})`.
- In `PATCH`: `if (req.body?.activityMultipliers !== undefined) { if (!isValidMultipliers(req.body.activityMultipliers)) return res.status(400).json({ error: "invalid multipliers" }); update.activity_multipliers = req.body.activityMultipliers; }`

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run api/admin/fellowships.test.ts`
Expected: PASS (existing `isValidActivityTypes` tests + 4 new).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc -b --noEmit`

```bash
git add api/admin/fellowships.ts api/admin/fellowships.test.ts
git commit -m "feat: admin fellowships store and validate activity multipliers"
```

---

### Task 6: Admin UI — edit mode + multiplier inputs

**Files:**
- Modify: `src/api-client.ts`, `src/components/AdminFellowshipsPanel.tsx`

**Interfaces:**
- Consumes: existing `adminUpdateFellowship`, and Task 5's stored multipliers.
- Produces: `AdminFellowship.activityMultipliers: Record<string, number>`; `adminCreateFellowship`/`adminUpdateFellowship` bodies accept `activityMultipliers`; the panel can edit a fellowship and set a multiplier per allowed type.

- [ ] **Step 1: Extend the client types**

In `src/api-client.ts`:
- Add `activityMultipliers: Record<string, number>;` to the `AdminFellowship` interface.
- Add `activityMultipliers?: Record<string, number>` to the body types of both `adminCreateFellowship` and `adminUpdateFellowship`, and include `activityMultipliers` in the JSON bodies they POST/PATCH.

- [ ] **Step 2: Add edit mode + multiplier inputs to `AdminFellowshipsPanel.tsx`**

Extend the component so that:
- A `multipliers` state (`Record<string, number>`) accompanies the `types` state; each allowed (checked) type shows a `number` input (`step="0.1"`, `min="0"`) bound to `multipliers[key] ?? 1`. When a type is unchecked, its multiplier entry is dropped; when checked, default it to 1.
- An `editingId: string | null` state. Each fellowship row gets an **Edit** button that loads that fellowship's `name/startDate/allowedActivityTypes/activityMultipliers` into the form and sets `editingId`.
- The submit button reads "Create Fellowship" when `editingId === null` and "Save Changes" otherwise. On submit: if editing, call `api.adminUpdateFellowship({ id: editingId, name, startDate, allowedActivityTypes: types, activityMultipliers: multipliers })`; else `api.adminCreateFellowship({ ..., activityMultipliers: multipliers })`. Then reset the form (`editingId=null`, defaults) and `load()`.
- Build the submitted `activityMultipliers` from only the currently-checked types.

Keep the existing Strava client id/secret fields for create; for edit they may stay blank (only sent if filled).

- [ ] **Step 3: Type-check and tests**

Run: `npx tsc -b --noEmit && npm test`
Expected: no errors; all tests pass (update any test that constructs `AdminFellowship` to include `activityMultipliers`).

- [ ] **Step 4: Commit**

```bash
git add src/api-client.ts src/components/AdminFellowshipsPanel.tsx
git commit -m "feat: admin can edit a fellowship and set per-activity multipliers"
```

---

### Task 7: Player card shows most-common activity

**Files:**
- Modify: `src/api-client.ts`, `src/components/ProfileDetail.tsx`

**Interfaces:**
- Consumes: `mostCommonActivity` from `/api/me` (Task 3).
- Produces: `RunStats.mostCommonActivity: string | null`; the player card renders a human-readable "Most common activity".

- [ ] **Step 1: Add the field to `RunStats`**

In `src/api-client.ts`, add `mostCommonActivity: string | null;` to the `RunStats` interface. This propagates to `Member["stats"]` and `Ghost.stats`.

- [ ] **Step 2: Render it in `ProfileDetail.tsx`**

Import `ACTIVITY_TYPES` from `../../shared/activity-types` and add a stat line showing the label for `member.stats.mostCommonActivity` (fall back to a dash when `null`). Place it alongside the other stats (e.g. next to the runs/longest/pace group), matching the existing stat-row markup in the file:

```tsx
const activityLabel = (key: string | null): string =>
  key ? (ACTIVITY_TYPES.find((t) => t.key === key)?.label ?? key) : "—";
// ...in the stat list:
["Most common", activityLabel(member.stats.mostCommonActivity)]
```

Use the file's existing stat-pair rendering pattern (match how "Latest note", pace, etc. are shown) rather than inventing new markup.

- [ ] **Step 3: Type-check and tests**

Run: `npx tsc -b --noEmit && npm test`
Expected: no errors. Update fixtures that build a `RunStats`/`Member`/ghost `stats` object to include `mostCommonActivity` (at least `src/components/StatsPanel.test.tsx`'s `me` members and any default `Member` in `src/achievements.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/api-client.ts src/components/ProfileDetail.tsx src/components/StatsPanel.test.tsx
git commit -m "feat: show most-common activity on the player card"
```

---

## Deployment note (not a task)

Run `0005_activity_multipliers.sql` against production before deploying this code. It is purely additive (new column with a default), so the currently-deployed app is unaffected until the new code ships.
