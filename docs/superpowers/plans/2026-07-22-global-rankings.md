# Global Rankings, Fellowship Cards & Trophies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the global view with fellowship-vs-fellowship rankings, a fellowship "card" (trophies + members), selectable ghosts on the map, weekly winners (fellowship-of-the-week and member-of-the-week) locked by a cron job, and a restructured inventory backpack.

**Architecture:** New pure helpers in `shared/` (`weeks.ts`, `weekly.ts`) hold all week math and winner computation, unit-tested in isolation. A new `weekly_awards` table stores locked weekly winners, populated idempotently by a cron endpoint. The global `/api/me` response gains lean per-fellowship ranking rows; a new `/api/fellowship` endpoint returns the heavy fellowship-card payload on demand. Frontend adds `GlobalRankingPanel` (global view) and `FellowshipCard` (modal), fixes ghost clustering in `MapView`, and rewrites `Passport` into a filterable inventory.

**Tech Stack:** TypeScript (ESM), React 18 + react-leaflet, Vercel serverless functions (`@vercel/node`), Supabase (service-role), Vitest.

## Global Constraints

- **ESM import extensions:** all relative imports in `shared/` and `api/` use the `.js` extension (e.g. `from "../shared/weeks.js"`), matching the existing codebase. Frontend `src/` imports use no extension.
- **Test command:** `npm test` runs `vitest run`. Single file: `npx vitest run <path>`. Single test: `npx vitest run <path> -t "<name>"`.
- **DB access:** server-only via `getServiceClient()` from `api/_lib/supabase.js` (service role bypasses RLS). New tables enable RLS with no policies.
- **Week definition:** ISO calendar week, **Monday 00:00:00 → Sunday 23:59:59.999 UTC**. `weekStart()` in `shared/weeks.ts` is the single source of truth; every "this week" / "last week" / winner computation uses it.
- **Miles math:** always go through `activitiesForFellowship` / `multiplierFor` / `memberTotal` from `shared/fellowship-sync.js` so activity-type filters, start-date floors, and multipliers stay consistent.
- **Per-fellowship scoping:** member badges and backpack collectibles are scoped to the fellowship currently being viewed, matching how `opened_quests` is already sliced by fellowship id.
- **Commit after every task.** Conventional commit messages.

---

## File Structure

**Create:**
- `shared/weeks.ts` — week boundary math (UTC Monday), completed-week detection, week enumeration.
- `shared/weeks.test.ts`
- `shared/weekly.ts` — pure winner computation from per-member activity data.
- `shared/weekly.test.ts`
- `supabase/migrations/0006_weekly_awards.sql` — the `weekly_awards` table.
- `api/cron/finalize-weeks.ts` — cron endpoint that locks completed-week winners.
- `api/cron/finalize-weeks.test.ts` — tests the pure finalizer planner.
- `api/fellowship.ts` — fellowship-card payload endpoint.
- `api/fellowship.test.ts` — tests the pure card-assembly helper.
- `src/components/GlobalRankingPanel.tsx` — fellowship ranking panel (global view).
- `src/components/FellowshipCard.tsx` — tabbed fellowship modal (Trophies / Members).

**Modify:**
- `api/me.ts` — add ranking rows to the global response; add `weeklyBadges` to the fellowship response.
- `src/api-client.ts` — new types + `fellowship()` / updated global response types.
- `src/pages/Dashboard.tsx` — swap panel by view, wire `FellowshipCard` + trophy shortcut.
- `src/components/MapView.tsx` — unified member+ghost cluster selection in global view.
- `src/components/Passport.tsx` — inventory grid + filter chips + tap-to-read + reading list.
- `src/styles.css` — styles for the new panel, card, tiles, inventory.
- `vercel.json` — cron schedule for `finalize-weeks`.

---

## Task 1: Week math helper (`shared/weeks.ts`)

**Files:**
- Create: `shared/weeks.ts`
- Test: `shared/weeks.test.ts`

**Interfaces:**
- Produces:
  - `weekStart(d: Date | string): string` → ISO date `YYYY-MM-DD` of the UTC Monday of that week.
  - `addWeeks(weekStartISO: string, n: number): string` → ISO date of the Monday n weeks later.
  - `isCompletedWeek(weekStartISO: string, now: Date): boolean` → true if that week's Sunday 23:59:59.999 UTC is strictly before `now`.
  - `weekStartsBetween(fromISO: string, toISO: string): string[]` → all Monday week-starts from the week containing `fromISO` through the week containing `toISO`, inclusive.

- [ ] **Step 1: Write the failing test**

```ts
// shared/weeks.test.ts
import { describe, it, expect } from "vitest";
import { weekStart, addWeeks, isCompletedWeek, weekStartsBetween } from "./weeks.js";

describe("weekStart", () => {
  it("returns the UTC Monday for a mid-week date", () => {
    // 2026-07-22 is a Wednesday; its Monday is 2026-07-20
    expect(weekStart("2026-07-22T15:00:00Z")).toBe("2026-07-20");
  });
  it("returns the same day when given a Monday", () => {
    expect(weekStart("2026-07-20T00:00:00Z")).toBe("2026-07-20");
  });
  it("treats Sunday as the end of the prior Monday's week", () => {
    // 2026-07-26 is a Sunday; its Monday is 2026-07-20
    expect(weekStart("2026-07-26T23:00:00Z")).toBe("2026-07-20");
  });
  it("crosses a year boundary correctly", () => {
    // 2027-01-01 is a Friday; its Monday is 2026-12-28
    expect(weekStart("2027-01-01T12:00:00Z")).toBe("2026-12-28");
  });
});

describe("addWeeks", () => {
  it("advances by whole weeks", () => {
    expect(addWeeks("2026-07-20", 1)).toBe("2026-07-27");
    expect(addWeeks("2026-07-20", 2)).toBe("2026-08-03");
  });
});

describe("isCompletedWeek", () => {
  it("is false for the in-progress week", () => {
    expect(isCompletedWeek("2026-07-20", new Date("2026-07-22T00:00:00Z"))).toBe(false);
  });
  it("is false at the exact Sunday-night boundary of that week", () => {
    expect(isCompletedWeek("2026-07-20", new Date("2026-07-26T23:59:59.999Z"))).toBe(false);
  });
  it("is true once the following Monday has begun", () => {
    expect(isCompletedWeek("2026-07-20", new Date("2026-07-27T00:00:00Z"))).toBe(true);
  });
});

describe("weekStartsBetween", () => {
  it("lists each Monday inclusive of both ends' weeks", () => {
    expect(weekStartsBetween("2026-07-22", "2026-08-04")).toEqual([
      "2026-07-20", "2026-07-27", "2026-08-03",
    ]);
  });
  it("returns a single week when both dates share a week", () => {
    expect(weekStartsBetween("2026-07-21", "2026-07-24")).toEqual(["2026-07-20"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/weeks.test.ts`
Expected: FAIL — `weeks.js` / exports not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// shared/weeks.ts
// All week math is UTC and anchored to Monday 00:00:00. A "week start" is the
// ISO date (YYYY-MM-DD) of that Monday and is the canonical key for weekly data.
const DAY_MS = 86_400_000;

function toUTCDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

export function weekStart(d: Date | string): string {
  const date = toUTCDate(d);
  const dow = date.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7; // Mon->0, Sun->6
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - daysSinceMonday * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

export function addWeeks(weekStartISO: string, n: number): string {
  const monday = new Date(`${weekStartISO}T00:00:00Z`);
  return new Date(monday.getTime() + n * 7 * DAY_MS).toISOString().slice(0, 10);
}

export function isCompletedWeek(weekStartISO: string, now: Date): boolean {
  const nextMonday = new Date(`${addWeeks(weekStartISO, 1)}T00:00:00Z`);
  return now.getTime() >= nextMonday.getTime();
}

export function weekStartsBetween(fromISO: string, toISO: string): string[] {
  const start = weekStart(fromISO);
  const end = weekStart(toISO);
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addWeeks(cur, 1);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/weeks.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add shared/weeks.ts shared/weeks.test.ts
git commit -m "feat: UTC week-boundary helpers"
```

---

## Task 2: Winner computation (`shared/weekly.ts`)

Pure functions that, given each member's activities plus their fellowship, compute per-week miles and determine winners. No DB — takes plain data so it is fully unit-testable and reused by both the cron job and any API.

**Files:**
- Create: `shared/weekly.ts`
- Test: `shared/weekly.test.ts`

**Interfaces:**
- Consumes: `Fellowship`, `RunActivity` from `shared/types.js`; `weekStart` from `shared/weeks.js`; `activitiesForFellowship`, `multiplierFor` from `shared/fellowship-sync.js`.
- Produces:
  - `type MemberInput = { userId: string; activities: RunActivity[] }`
  - `type FellowshipInput = { fellowship: Fellowship; members: MemberInput[] }`
  - `weekMiles(activities: RunActivity[], fellowship: Fellowship, weekStartISO: string): number` — fellowship-scoped, multiplier-applied miles for that member in that week.
  - `type Winners = { globalPooled: { fellowshipId: string; value: number } | null; globalPerCapita: { fellowshipId: string; value: number } | null; members: { fellowshipId: string; userId: string; value: number }[] }`
  - `computeWeekWinners(inputs: FellowshipInput[], weekStartISO: string): Winners` — global pooled/per-capita winners across fellowships and the member winner within each fellowship. Ties broken by highest value then lowest id (deterministic). Zero-mile weeks produce `null` / omit that fellowship's member winner.

- [ ] **Step 1: Write the failing test**

```ts
// shared/weekly.test.ts
import { describe, it, expect } from "vitest";
import { weekMiles, computeWeekWinners, type FellowshipInput } from "./weekly.js";
import type { Fellowship, RunActivity } from "./types.js";

const fship = (over: Partial<Fellowship> = {}): Fellowship => ({
  id: "f1", name: "F1", startDate: "2026-01-01", allowedActivityTypes: ["Run", "Walk"],
  activityMultipliers: { Walk: 0.5 }, ...over,
});
const act = (miles: number, date: string, type = "Run"): RunActivity => ({
  stravaActivityId: Math.random(), distanceMiles: miles, runDate: date, name: "", sportType: type,
});

describe("weekMiles", () => {
  it("sums only in-week, allowed, multiplier-applied miles", () => {
    const f = fship();
    const acts = [
      act(5, "2026-07-21T10:00:00Z"),        // in week, Run x1 = 5
      act(4, "2026-07-22T10:00:00Z", "Walk"), // in week, Walk x0.5 = 2
      act(9, "2026-07-14T10:00:00Z"),        // previous week -> excluded
      act(3, "2026-07-23T10:00:00Z", "Ride"), // disallowed type -> excluded
    ];
    expect(weekMiles(acts, f, "2026-07-20")).toBeCloseTo(7);
  });
});

describe("computeWeekWinners", () => {
  it("picks pooled, per-capita, and per-fellowship member winners", () => {
    const inputs: FellowshipInput[] = [
      { fellowship: fship({ id: "big" }), members: [
        { userId: "a", activities: [act(10, "2026-07-21T10:00:00Z")] },
        { userId: "b", activities: [act(10, "2026-07-21T10:00:00Z")] },
        { userId: "c", activities: [act(10, "2026-07-21T10:00:00Z")] },
      ] }, // pooled 30, per-capita 10, member winner a (tie -> lowest id)
      { fellowship: fship({ id: "small" }), members: [
        { userId: "z", activities: [act(25, "2026-07-22T10:00:00Z")] },
      ] }, // pooled 25, per-capita 25, member winner z
    ];
    const w = computeWeekWinners(inputs, "2026-07-20");
    expect(w.globalPooled).toEqual({ fellowshipId: "big", value: 30 });
    expect(w.globalPerCapita).toEqual({ fellowshipId: "small", value: 25 });
    expect(w.members).toContainEqual({ fellowshipId: "big", userId: "a", value: 10 });
    expect(w.members).toContainEqual({ fellowshipId: "small", userId: "z", value: 25 });
  });

  it("omits winners when no miles ran that week", () => {
    const inputs: FellowshipInput[] = [
      { fellowship: fship({ id: "idle" }), members: [{ userId: "a", activities: [] }] },
    ];
    const w = computeWeekWinners(inputs, "2026-07-20");
    expect(w.globalPooled).toBeNull();
    expect(w.globalPerCapita).toBeNull();
    expect(w.members).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/weekly.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// shared/weekly.ts
import type { Fellowship, RunActivity } from "./types.js";
import { weekStart } from "./weeks.js";
import { activitiesForFellowship, multiplierFor } from "./fellowship-sync.js";

export interface MemberInput { userId: string; activities: RunActivity[]; }
export interface FellowshipInput { fellowship: Fellowship; members: MemberInput[]; }
export interface Winners {
  globalPooled: { fellowshipId: string; value: number } | null;
  globalPerCapita: { fellowshipId: string; value: number } | null;
  members: { fellowshipId: string; userId: string; value: number }[];
}

// Miles a member ran in a given week, applying this fellowship's type filter,
// start-date floor, and multipliers (via activitiesForFellowship / multiplierFor).
export function weekMiles(activities: RunActivity[], fellowship: Fellowship, weekStartISO: string): number {
  return activitiesForFellowship(activities, fellowship)
    .filter((a) => weekStart(a.runDate) === weekStartISO)
    .reduce((sum, a) => sum + a.distanceMiles * multiplierFor(fellowship, a.sportType), 0);
}

// Deterministic "is candidate better than current best": higher value wins;
// on a tie the lower id wins so re-runs are stable.
function better(value: number, id: string, best: { value: number; id: string } | null): boolean {
  if (value <= 0) return false;
  if (!best) return true;
  if (value !== best.value) return value > best.value;
  return id < best.id;
}

export function computeWeekWinners(inputs: FellowshipInput[], weekStartISO: string): Winners {
  let pooledBest: { fellowshipId: string; value: number; id: string } | null = null;
  let perCapBest: { fellowshipId: string; value: number; id: string } | null = null;
  const members: Winners["members"] = [];

  for (const { fellowship, members: mem } of inputs) {
    const perMember = mem.map((m) => ({ userId: m.userId, value: weekMiles(m.activities, fellowship, weekStartISO) }));
    const pooled = perMember.reduce((s, m) => s + m.value, 0);
    const perCapita = mem.length ? pooled / mem.length : 0;

    if (better(pooled, fellowship.id, pooledBest && { value: pooledBest.value, id: pooledBest.id }))
      pooledBest = { fellowshipId: fellowship.id, value: pooled, id: fellowship.id };
    if (better(perCapita, fellowship.id, perCapBest && { value: perCapBest.value, id: perCapBest.id }))
      perCapBest = { fellowshipId: fellowship.id, value: perCapita, id: fellowship.id };

    let memberBest: { userId: string; value: number } | null = null;
    for (const pm of perMember) {
      if (better(pm.value, pm.userId, memberBest && { value: memberBest.value, id: memberBest.userId }))
        memberBest = { userId: pm.userId, value: pm.value };
    }
    if (memberBest) members.push({ fellowshipId: fellowship.id, userId: memberBest.userId, value: memberBest.value });
  }

  return {
    globalPooled: pooledBest && { fellowshipId: pooledBest.fellowshipId, value: pooledBest.value },
    globalPerCapita: perCapBest && { fellowshipId: perCapBest.fellowshipId, value: perCapBest.value },
    members,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/weekly.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/weekly.ts shared/weekly.test.ts
git commit -m "feat: weekly winner computation"
```

---

## Task 3: `weekly_awards` migration

**Files:**
- Create: `supabase/migrations/0006_weekly_awards.sql`

**Interfaces:**
- Produces: table `weekly_awards(week_start date, scope text, fellowship_id uuid, user_id uuid, metric_value double precision, created_at timestamptz)` with two partial unique indexes.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0006_weekly_awards.sql
-- Locked weekly winners. Rows are written once by the finalize-weeks cron after
-- a week completes and are never updated (late backfills do not change history).
begin;

create table weekly_awards (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  scope text not null check (scope in ('global_pooled', 'global_percapita', 'member')),
  fellowship_id uuid not null references fellowship(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  metric_value double precision not null default 0,
  created_at timestamptz not null default now()
);

-- One member winner per fellowship per week.
create unique index weekly_awards_member_uniq
  on weekly_awards (week_start, fellowship_id)
  where scope = 'member';

-- Exactly one global winner per scope per week, regardless of fellowship.
create unique index weekly_awards_global_uniq
  on weekly_awards (week_start, scope)
  where scope in ('global_pooled', 'global_percapita');

create index weekly_awards_fellowship_idx on weekly_awards (fellowship_id);
create index weekly_awards_user_idx on weekly_awards (user_id);

alter table weekly_awards enable row level security;

commit;
```

- [ ] **Step 2: Verify the SQL parses locally (dry check)**

Run: `grep -c "create " supabase/migrations/0006_weekly_awards.sql`
Expected: `4` (table + 3 indexes lines beginning with `create`). This is a sanity check that the file was written; actual application happens against Supabase during deploy.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_weekly_awards.sql
git commit -m "feat: weekly_awards table"
```

> **Manual follow-up (record in PR description):** apply this migration to the Supabase project before the cron runs in production.

---

## Task 4: Finalizer planner + cron endpoint

The cron endpoint enumerates completed weeks lacking records and inserts winner rows. The **planning** logic (which weeks still need finalizing, and the rows to insert) is a pure function so it can be tested without a DB.

**Files:**
- Create: `api/cron/finalize-weeks.ts`
- Test: `api/cron/finalize-weeks.test.ts`

**Interfaces:**
- Consumes: `computeWeekWinners`, `FellowshipInput`, `Winners` from `shared/weekly.js`; `weekStart`, `weekStartsBetween`, `isCompletedWeek` from `shared/weeks.js`; `getServiceClient`, `getEnv`.
- Produces:
  - `type AwardRow = { week_start: string; scope: "global_pooled" | "global_percapita" | "member"; fellowship_id: string; user_id: string | null; metric_value: number }`
  - `planFinalization(args: { inputs: FellowshipInput[]; earliestActivityDate: string | null; now: Date; recordedWeeks: Set<string> }): AwardRow[]` — for each completed week from the earliest activity's week through the last completed week that is **not** in `recordedWeeks`, compute winners and flatten to award rows.
  - Default export: Vercel handler (auth-guarded, loads data, calls `planFinalization`, inserts rows).

- [ ] **Step 1: Write the failing test**

```ts
// api/cron/finalize-weeks.test.ts
import { describe, it, expect } from "vitest";
import { planFinalization } from "./finalize-weeks.js";
import type { FellowshipInput } from "../../shared/weekly.js";
import type { Fellowship, RunActivity } from "../../shared/types.js";

const f: Fellowship = { id: "f1", name: "F1", startDate: "2026-07-01", allowedActivityTypes: ["Run"], activityMultipliers: {} };
const act = (miles: number, date: string): RunActivity => ({ stravaActivityId: Math.random(), distanceMiles: miles, runDate: date, name: "", sportType: "Run" });

describe("planFinalization", () => {
  const inputs: FellowshipInput[] = [
    { fellowship: f, members: [
      { userId: "a", activities: [act(10, "2026-07-08T10:00:00Z"), act(30, "2026-07-15T10:00:00Z")] },
    ] },
  ];

  it("emits rows for each completed, unrecorded week", () => {
    // now = 2026-07-20 (Mon). Completed weeks: w/o 07-06 and 07-13. 07-20 is in progress.
    const rows = planFinalization({ inputs, earliestActivityDate: "2026-07-08", now: new Date("2026-07-20T00:00:00Z"), recordedWeeks: new Set() });
    const weeks = [...new Set(rows.map((r) => r.week_start))].sort();
    expect(weeks).toEqual(["2026-07-06", "2026-07-13"]);
    // each finalized week with miles yields 3 rows: pooled, percapita, member
    const wk13 = rows.filter((r) => r.week_start === "2026-07-13");
    expect(wk13.map((r) => r.scope).sort()).toEqual(["global_pooled", "global_percapita", "member"]);
    expect(wk13.find((r) => r.scope === "member")).toMatchObject({ fellowship_id: "f1", user_id: "a", metric_value: 30 });
  });

  it("skips weeks already recorded (idempotent)", () => {
    const rows = planFinalization({ inputs, earliestActivityDate: "2026-07-08", now: new Date("2026-07-20T00:00:00Z"), recordedWeeks: new Set(["2026-07-06", "2026-07-13"]) });
    expect(rows).toEqual([]);
  });

  it("emits nothing when there is no activity history", () => {
    expect(planFinalization({ inputs, earliestActivityDate: null, now: new Date("2026-07-20T00:00:00Z"), recordedWeeks: new Set() })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/cron/finalize-weeks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// api/cron/finalize-weeks.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "../_lib/supabase.js";
import { getEnv } from "../_lib/env.js";
import { weekStart, weekStartsBetween, isCompletedWeek } from "../../shared/weeks.js";
import { computeWeekWinners, type FellowshipInput } from "../../shared/weekly.js";
import type { Fellowship, RunActivity } from "../../shared/types.js";

export interface AwardRow {
  week_start: string;
  scope: "global_pooled" | "global_percapita" | "member";
  fellowship_id: string;
  user_id: string | null;
  metric_value: number;
}

// Pure planner: for each completed week from the earliest activity forward that
// is not already recorded, compute winners and flatten to insertable rows.
export function planFinalization(args: {
  inputs: FellowshipInput[];
  earliestActivityDate: string | null;
  now: Date;
  recordedWeeks: Set<string>;
}): AwardRow[] {
  const { inputs, earliestActivityDate, now, recordedWeeks } = args;
  if (!earliestActivityDate) return [];
  const todayWeek = weekStart(now);
  const weeks = weekStartsBetween(earliestActivityDate, todayWeek)
    .filter((w) => isCompletedWeek(w, now) && !recordedWeeks.has(w));

  const rows: AwardRow[] = [];
  for (const w of weeks) {
    const winners = computeWeekWinners(inputs, w);
    if (winners.globalPooled) rows.push({ week_start: w, scope: "global_pooled", fellowship_id: winners.globalPooled.fellowshipId, user_id: null, metric_value: winners.globalPooled.value });
    if (winners.globalPerCapita) rows.push({ week_start: w, scope: "global_percapita", fellowship_id: winners.globalPerCapita.fellowshipId, user_id: null, metric_value: winners.globalPerCapita.value });
    for (const m of winners.members) rows.push({ week_start: w, scope: "member", fellowship_id: m.fellowshipId, user_id: m.userId, metric_value: m.value });
  }
  return rows;
}

// Load every fellowship + its members' activities into FellowshipInput[].
async function loadInputs(db: ReturnType<typeof getServiceClient>): Promise<{ inputs: FellowshipInput[]; earliest: string | null }> {
  const { data: fships } = await db.from("fellowship").select("id, name, start_date, allowed_activity_types, activity_multipliers");
  const { data: memberships } = await db.from("fellowship_members").select("user_id, fellowship_id");
  const { data: acts } = await db.from("activities").select("user_id, distance_miles, run_date, sport_type");

  const actsByUser = new Map<string, RunActivity[]>();
  let earliest: string | null = null;
  for (const a of acts ?? []) {
    const list = actsByUser.get(a.user_id) ?? [];
    list.push({ stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0, runDate: a.run_date, name: "", sportType: a.sport_type });
    actsByUser.set(a.user_id, list);
    if (a.run_date && (earliest === null || a.run_date < earliest)) earliest = a.run_date;
  }
  const membersByF = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const list = membersByF.get(m.fellowship_id) ?? [];
    list.push(m.user_id);
    membersByF.set(m.fellowship_id, list);
  }
  const inputs: FellowshipInput[] = (fships ?? []).map((f) => {
    const fellowship: Fellowship = { id: f.id, name: f.name, startDate: f.start_date, allowedActivityTypes: f.allowed_activity_types, activityMultipliers: (f.activity_multipliers as Record<string, number>) ?? {} };
    const members = (membersByF.get(f.id) ?? []).map((uid) => ({ userId: uid, activities: actsByUser.get(uid) ?? [] }));
    return { fellowship, members };
  });
  return { inputs, earliest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Reject anything else.
  const secret = getEnv("CRON_SECRET");
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });

  const db = getServiceClient();
  const { inputs, earliest } = await loadInputs(db);
  const { data: recorded } = await db.from("weekly_awards").select("week_start");
  const recordedWeeks = new Set((recorded ?? []).map((r: { week_start: string }) => r.week_start));

  const rows = planFinalization({ inputs, earliestActivityDate: earliest, now: new Date(), recordedWeeks });
  if (rows.length) {
    // ignoreDuplicates guards against a concurrent run racing the same week.
    await db.from("weekly_awards").upsert(rows, { onConflict: "week_start,scope", ignoreDuplicates: true });
  }
  return res.status(200).json({ finalized: rows.length });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/cron/finalize-weeks.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the cron schedule to `vercel.json`**

```json
{
  "crons": [{ "path": "/api/cron/finalize-weeks", "schedule": "10 0 * * 1" }],
  "rewrites": [{ "source": "/((?!api/|@|src/|node_modules/|.*\\.).*)", "destination": "/index.html" }]
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add api/cron/finalize-weeks.ts api/cron/finalize-weeks.test.ts vercel.json
git commit -m "feat: weekly winner finalizer cron"
```

> **Manual follow-up (record in PR description):** set the `CRON_SECRET` env var in Vercel project settings.

---

## Task 5: Global ranking rows in `/api/me`

Add per-fellowship ranking rows to the global response. The aggregation is a pure helper so it can be tested; the handler wires DB data into it.

**Files:**
- Modify: `api/me.ts`
- Test: `api/me.test.ts` (create)

**Interfaces:**
- Produces (exported from `api/me.ts` for testing):
  - `type RankingRow = { id: string; name: string; pooledMiles: number; memberCount: number; weekPooled: number; weekPerCapita: number; isProgressLeader: boolean }`
  - `buildRankingRows(inputs: FellowshipInput[], currentWeekStartISO: string): RankingRow[]` — pooled all-time miles (via `memberTotal`), member count, this-week pooled + per-capita (via `weekMiles`), and `isProgressLeader` set on the single highest-pooledMiles fellowship.
- The global JSON response gains `rankings: RankingRow[]` alongside existing `ghosts`.

- [ ] **Step 1: Write the failing test**

```ts
// api/me.test.ts
import { describe, it, expect } from "vitest";
import { buildRankingRows } from "./me.js";
import type { FellowshipInput } from "../shared/weekly.js";
import type { Fellowship, RunActivity } from "../shared/types.js";

const f = (id: string): Fellowship => ({ id, name: id, startDate: "2026-01-01", allowedActivityTypes: ["Run"], activityMultipliers: {} });
const act = (miles: number, date: string): RunActivity => ({ stravaActivityId: Math.random(), distanceMiles: miles, runDate: date, name: "", sportType: "Run" });

describe("buildRankingRows", () => {
  it("aggregates totals, week miles, per-capita, and flags the progress leader", () => {
    const inputs: FellowshipInput[] = [
      { fellowship: f("big"), members: [
        { userId: "a", activities: [act(100, "2026-01-05T00:00:00Z"), act(10, "2026-07-21T00:00:00Z")] },
        { userId: "b", activities: [act(100, "2026-01-05T00:00:00Z")] },
      ] },
      { fellowship: f("small"), members: [
        { userId: "z", activities: [act(150, "2026-01-05T00:00:00Z"), act(40, "2026-07-22T00:00:00Z")] },
      ] },
    ];
    const rows = buildRankingRows(inputs, "2026-07-20");
    const big = rows.find((r) => r.id === "big")!;
    const small = rows.find((r) => r.id === "small")!;
    expect(big.pooledMiles).toBeCloseTo(210);
    expect(big.memberCount).toBe(2);
    expect(big.weekPooled).toBeCloseTo(10);
    expect(big.weekPerCapita).toBeCloseTo(5);
    expect(small.weekPerCapita).toBeCloseTo(40);
    expect(big.isProgressLeader).toBe(true); // 210 > 190
    expect(small.isProgressLeader).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/me.test.ts`
Expected: FAIL — `buildRankingRows` not exported.

- [ ] **Step 3: Implement `buildRankingRows` and wire it in**

Add near the top of `api/me.ts` (after imports):

```ts
import { weekStart } from "../shared/weeks.js";
import { weekMiles, type FellowshipInput } from "../shared/weekly.js";

export interface RankingRow {
  id: string; name: string; pooledMiles: number; memberCount: number;
  weekPooled: number; weekPerCapita: number; isProgressLeader: boolean;
}

export function buildRankingRows(inputs: FellowshipInput[], currentWeekStartISO: string): RankingRow[] {
  const rows = inputs.map(({ fellowship, members }) => {
    const pooledMiles = members.reduce((s, m) => s + memberTotal(m.activities, fellowship), 0);
    const weekPooled = members.reduce((s, m) => s + weekMiles(m.activities, fellowship, currentWeekStartISO), 0);
    return {
      id: fellowship.id, name: fellowship.name, pooledMiles, memberCount: members.length,
      weekPooled, weekPerCapita: members.length ? weekPooled / members.length : 0, isProgressLeader: false,
    };
  });
  let leader: RankingRow | null = null;
  for (const r of rows) if (!leader || r.pooledMiles > leader.pooledMiles) leader = r;
  if (leader && leader.pooledMiles > 0) leader.isProgressLeader = true;
  return rows;
}
```

Ensure `memberTotal` is imported (it already is in `me.ts`). In the `view === "global"` branch, build `FellowshipInput[]` from the already-loaded `allMemberships` + `usersById` + each user's activities, then add `rankings` to the response. Replace the existing global `return res.status(200).json({...})` with one that also includes `rankings`:

```ts
    // Reuse the per-membership loop's data: group members by fellowship.
    const inputsByF = new Map<string, FellowshipInput>();
    for (const m of allMemberships ?? []) {
      const fRow = m.fellowship as unknown as { id: string; name: string; start_date: string; allowed_activity_types: string[]; activity_multipliers: unknown } | null;
      const u = usersById.get(m.user_id);
      if (!fRow || !u) continue;
      const fellowship: Fellowship = { id: fRow.id, name: fRow.name, startDate: fRow.start_date, allowedActivityTypes: fRow.allowed_activity_types, activityMultipliers: (fRow.activity_multipliers as Record<string, number>) ?? {} };
      const { data: acts } = await db.from("activities").select("distance_miles, run_date, sport_type").eq("user_id", u.id);
      const activities: RunActivity[] = (acts ?? []).map((a) => ({ stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0, runDate: a.run_date, name: "", sportType: a.sport_type }));
      const existing = inputsByF.get(fRow.id) ?? { fellowship, members: [] };
      existing.members.push({ userId: u.id, activities });
      inputsByF.set(fRow.id, existing);
    }
    const rankings = buildRankingRows([...inputsByF.values()], weekStart(new Date()));

    return res.status(200).json({
      user: { id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url, chosenCharacter: user.chosen_character, color: user.color },
      isAdmin: user.is_admin, fellowships: fellowshipsSummary, global: true, ghosts, rankings,
    });
```

> Note: this reuses the existing ghost-building loop's queries. To avoid double-fetching each user's activities, you may fold the `FellowshipInput` accumulation into the existing `for (const m of allMemberships ?? [])` loop that already fetches `acts`. Keep whichever is cleaner; behavior is what the test pins.

- [ ] **Step 4: Run tests**

Run: `npx vitest run api/me.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add api/me.ts api/me.test.ts
git commit -m "feat: fellowship ranking rows in global response"
```

---

## Task 6: `GlobalRankingPanel` component + client types

**Files:**
- Modify: `src/api-client.ts`
- Create: `src/components/GlobalRankingPanel.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `RankingRow` type; `GlobalResponse.rankings`.
- Produces: `GlobalRankingPanel` React component with props `{ rankings: RankingRow[]; myFellowshipId: string | undefined; onSelectFellowship: (id: string) => void }`.

- [ ] **Step 1: Add types to `src/api-client.ts`**

Add the `RankingRow` interface and extend `GlobalResponse`:

```ts
export interface RankingRow {
  id: string; name: string; pooledMiles: number; memberCount: number;
  weekPooled: number; weekPerCapita: number; isProgressLeader: boolean;
}
```

In `GlobalResponse`, add `rankings: RankingRow[];`.

- [ ] **Step 2: Create the component**

```tsx
// src/components/GlobalRankingPanel.tsx
import { useState } from "react";
import type { RankingRow } from "../api-client";

type Metric = "pooled" | "percapita";

function valueFor(r: RankingRow, metric: Metric, timeframe: "all" | "week"): number {
  if (timeframe === "all") return metric === "pooled" ? r.pooledMiles : r.memberCount ? r.pooledMiles / r.memberCount : 0;
  return metric === "pooled" ? r.weekPooled : r.weekPerCapita;
}

function Rows({ rows, metric, timeframe, myId, onSelect, week }: {
  rows: RankingRow[]; metric: Metric; timeframe: "all" | "week"; myId: string | undefined;
  onSelect: (id: string) => void; week: boolean;
}) {
  const sorted = [...rows].sort((a, b) => valueFor(b, metric, timeframe) - valueFor(a, metric, timeframe));
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <>
      {sorted.map((r, i) => (
        <div
          key={r.id}
          className={"rank-row" + (r.id === myId ? " me" : "")}
          onClick={() => onSelect(r.id)}
          title="Open fellowship card"
        >
          <span className="rank-rk">{!week && r.isProgressLeader ? "👑" : (medals[i] ?? i + 1)}</span>
          <span className="rank-nm">{r.name}</span>
          <span className="rank-val">{week ? "+" : ""}{Math.round(valueFor(r, metric, timeframe))}</span>
        </div>
      ))}
    </>
  );
}

export function GlobalRankingPanel({ rankings, myFellowshipId, onSelectFellowship }: {
  rankings: RankingRow[]; myFellowshipId: string | undefined; onSelectFellowship: (id: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>("pooled");
  const [expanded, setExpanded] = useState(false);
  const top3all = [...rankings].sort((a, b) => valueFor(b, metric, "all") - valueFor(a, metric, "all")).slice(0, 3);
  const top3week = [...rankings].sort((a, b) => valueFor(b, metric, "week") - valueFor(a, metric, "week")).slice(0, 3);

  return (
    <div className={"global-panel" + (expanded ? " expanded" : "")}>
      <div className="global-panel-head">🌍 Fellowships</div>
      <div className="metric-toggle">
        <button aria-pressed={metric === "pooled"} onClick={() => setMetric("pooled")}>Pooled</button>
        <button aria-pressed={metric === "percapita"} onClick={() => setMetric("percapita")}>Per-capita</button>
      </div>

      {expanded ? (
        <div className="global-cols">
          <div>
            <div className="mini-head">All-time</div>
            <Rows rows={rankings} metric={metric} timeframe="all" myId={myFellowshipId} onSelect={onSelectFellowship} week={false} />
          </div>
          <div>
            <div className="mini-head">This week</div>
            <Rows rows={rankings} metric={metric} timeframe="week" myId={myFellowshipId} onSelect={onSelectFellowship} week={true} />
          </div>
        </div>
      ) : (
        <>
          <Rows rows={top3all} metric={metric} timeframe="all" myId={myFellowshipId} onSelect={onSelectFellowship} week={false} />
          <div className="mini-head">This week</div>
          <Rows rows={top3week} metric={metric} timeframe="week" myId={myFellowshipId} onSelect={onSelectFellowship} week={true} />
        </>
      )}

      <button className="expand-btn" onClick={() => setExpanded((e) => !e)}>
        {expanded ? "Collapse ▾" : "See full rankings ⤢"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add styles to `src/styles.css`**

```css
/* Global fellowship ranking panel */
.global-panel { position: absolute; left: 12px; bottom: 12px; width: 264px;
  background: rgba(26,20,8,0.92); color: #e8dcc0; border: 2px solid #6b5a2e;
  border-radius: 12px; padding: 12px; font-family: Georgia, serif; z-index: 1000;
  transition: width .38s cubic-bezier(.22,.9,.28,1), height .38s cubic-bezier(.22,.9,.28,1),
    left .38s cubic-bezier(.22,.9,.28,1), top .38s cubic-bezier(.22,.9,.28,1),
    right .38s cubic-bezier(.22,.9,.28,1), bottom .38s cubic-bezier(.22,.9,.28,1); }
.global-panel.expanded { left: 5vw; right: 5vw; top: 8vh; bottom: 8vh; width: auto; overflow-y: auto; }
.global-panel-head { color: #f0d97a; font-size: 15px; margin-bottom: 8px; }
.metric-toggle { display: flex; gap: 4px; background: #0f0b04; border-radius: 8px; padding: 3px; margin-bottom: 8px; }
.metric-toggle button { flex: 1; border: 0; background: transparent; color: #b8a878; font-size: 12px; padding: 5px; border-radius: 6px; cursor: pointer; }
.metric-toggle button[aria-pressed="true"] { background: #6b5a2e; color: #fff; }
.rank-row { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,.06); cursor: pointer; }
.rank-row.me { background: rgba(240,217,122,.08); border-radius: 6px; }
.rank-rk { width: 20px; text-align: center; color: #9a8a5a; }
.rank-nm { flex: 1; }
.rank-val { color: #f0d97a; font-weight: 600; }
.mini-head { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #9a8a5a; margin: 8px 0 4px; }
.global-cols { display: flex; gap: 20px; }
.global-cols > div { flex: 1; }
.expand-btn { width: 100%; margin-top: 8px; background: #2a2210; border: 1px solid #6b5a2e; color: #f0d97a; border-radius: 7px; padding: 6px; font-size: 12px; cursor: pointer; }
```

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add src/api-client.ts src/components/GlobalRankingPanel.tsx src/styles.css
git commit -m "feat: global fellowship ranking panel"
```

---

## Task 7: `/api/fellowship` endpoint

Returns the fellowship-card payload: standing, weekly-win badges, lands reached, and members with total + last-week miles.

**Files:**
- Create: `api/fellowship.ts`
- Test: `api/fellowship.test.ts`

**Interfaces:**
- Consumes: `weekStart`, `addWeeks` from `shared/weeks.js`; `weekMiles`, `memberTotal`; `percentComplete`, `ROUTE`.
- Produces (exported for test):
  - `type FellowshipCardMember = { id: string; displayName: string; chosenCharacter: string | null; color: string | null; totalMiles: number; lastWeekMiles: number }`
  - `buildCardMembers(members: { userId: string; displayName: string; chosenCharacter: string | null; color: string | null; activities: RunActivity[] }[], fellowship: Fellowship, lastWeekStartISO: string): FellowshipCardMember[]` — sorted by `lastWeekMiles` descending.
- Default export handler returns `{ fellowship, standing, weeklyBadges, landmarks, members }`.

- [ ] **Step 1: Write the failing test**

```ts
// api/fellowship.test.ts
import { describe, it, expect } from "vitest";
import { buildCardMembers } from "./fellowship.js";
import type { Fellowship, RunActivity } from "../shared/types.js";

const f: Fellowship = { id: "f1", name: "F1", startDate: "2026-01-01", allowedActivityTypes: ["Run"], activityMultipliers: {} };
const act = (miles: number, date: string): RunActivity => ({ stravaActivityId: Math.random(), distanceMiles: miles, runDate: date, name: "", sportType: "Run" });

describe("buildCardMembers", () => {
  it("computes totals + last-week miles and sorts by last week desc", () => {
    const members = [
      { userId: "a", displayName: "A", chosenCharacter: null, color: "#111", activities: [act(50, "2026-01-05T00:00:00Z"), act(5, "2026-07-14T00:00:00Z")] },
      { userId: "b", displayName: "B", chosenCharacter: null, color: "#222", activities: [act(20, "2026-01-05T00:00:00Z"), act(30, "2026-07-15T00:00:00Z")] },
    ];
    // last completed week Monday = 2026-07-13
    const rows = buildCardMembers(members, f, "2026-07-13");
    expect(rows[0].id).toBe("b"); // 30 last week > 5
    expect(rows[0].lastWeekMiles).toBeCloseTo(30);
    expect(rows[0].totalMiles).toBeCloseTo(50);
    expect(rows[1].id).toBe("a");
    expect(rows[1].lastWeekMiles).toBeCloseTo(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/fellowship.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the endpoint**

```ts
// api/fellowship.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";
import { readSessionUserId } from "./_lib/http.js";
import { weekStart, addWeeks } from "../shared/weeks.js";
import { weekMiles } from "../shared/weekly.js";
import { memberTotal } from "../shared/fellowship-sync.js";
import { percentComplete } from "../shared/progress.js";
import { ROUTE, TOTAL_MILES } from "../shared/route.js";
import type { Fellowship, RunActivity } from "../shared/types.js";

export interface FellowshipCardMember {
  id: string; displayName: string; chosenCharacter: string | null; color: string | null;
  totalMiles: number; lastWeekMiles: number;
}

export function buildCardMembers(
  members: { userId: string; displayName: string; chosenCharacter: string | null; color: string | null; activities: RunActivity[] }[],
  fellowship: Fellowship,
  lastWeekStartISO: string,
): FellowshipCardMember[] {
  return members
    .map((m) => ({
      id: m.userId, displayName: m.displayName, chosenCharacter: m.chosenCharacter, color: m.color,
      totalMiles: memberTotal(m.activities, fellowship),
      lastWeekMiles: weekMiles(m.activities, fellowship, lastWeekStartISO),
    }))
    .sort((a, b) => b.lastWeekMiles - a.lastWeekMiles);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });
  const fellowshipId = req.query.fellowshipId as string | undefined;
  if (!fellowshipId) return res.status(400).json({ error: "fellowshipId required" });

  const db = getServiceClient();
  const { data: fRow } = await db.from("fellowship").select("id, name, start_date, allowed_activity_types, activity_multipliers").eq("id", fellowshipId).maybeSingle();
  if (!fRow) return res.status(404).json({ error: "not found" });
  const fellowship: Fellowship = { id: fRow.id, name: fRow.name, startDate: fRow.start_date, allowedActivityTypes: fRow.allowed_activity_types, activityMultipliers: (fRow.activity_multipliers as Record<string, number>) ?? {} };

  const { data: memberRows } = await db.from("fellowship_members").select("user_id").eq("fellowship_id", fellowshipId);
  const memberIds = (memberRows ?? []).map((m: { user_id: string }) => m.user_id);
  const ids = memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"];
  const { data: users } = await db.from("users").select("id, display_name, chosen_character, color").in("id", ids);
  const { data: acts } = await db.from("activities").select("user_id, distance_miles, run_date, sport_type").in("user_id", ids);

  const actsByUser = new Map<string, RunActivity[]>();
  for (const a of acts ?? []) {
    const list = actsByUser.get(a.user_id) ?? [];
    list.push({ stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0, runDate: a.run_date, name: "", sportType: a.sport_type });
    actsByUser.set(a.user_id, list);
  }
  const memberInputs = (users ?? []).map((u) => ({ userId: u.id, displayName: u.display_name, chosenCharacter: u.chosen_character, color: u.color, activities: actsByUser.get(u.id) ?? [] }));
  const lastWeek = addWeeks(weekStart(new Date()), -1);
  const members = buildCardMembers(memberInputs, fellowship, lastWeek);
  const pooledMiles = members.reduce((s, m) => s + m.totalMiles, 0);

  // Weekly-win badges for this fellowship (global scopes only).
  const { data: badges } = await db.from("weekly_awards").select("week_start, scope, metric_value").eq("fellowship_id", fellowshipId).in("scope", ["global_pooled", "global_percapita"]).order("week_start", { ascending: false });

  // Lands reached: landmark ids whose cumulativeMiles <= pooledMiles, plus the full landmark list for greying.
  const allLandmarks = ROUTE.filter((w) => w.isLandmark).map((w) => ({ id: w.landmarkId!, name: w.name, miles: w.cumulativeMiles }));
  const reached = allLandmarks.filter((l) => l.miles <= pooledMiles).map((l) => l.id);

  return res.status(200).json({
    fellowship: { id: fellowship.id, name: fellowship.name },
    standing: { pooledMiles, progressPct: percentComplete(pooledMiles, ROUTE), totalMiles: TOTAL_MILES, memberCount: members.length },
    weeklyBadges: badges ?? [],
    landmarks: { all: allLandmarks, reached },
    members,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/fellowship.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`
Expected: no errors.

```bash
git add api/fellowship.ts api/fellowship.test.ts
git commit -m "feat: fellowship card payload endpoint"
```

---

## Task 8: `FellowshipCard` component + client method + trophy shortcut

**Files:**
- Modify: `src/api-client.ts`
- Create: `src/components/FellowshipCard.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `/api/fellowship` payload.
- Produces: `api.fellowship(id)`; `FellowshipCard` component with props `{ fellowshipId: string | null; isLeaderId: string | undefined; onClose: () => void }`.

- [ ] **Step 1: Add types + client method to `src/api-client.ts`**

```ts
export interface FellowshipCardData {
  fellowship: { id: string; name: string };
  standing: { pooledMiles: number; progressPct: number; totalMiles: number; memberCount: number };
  weeklyBadges: { week_start: string; scope: "global_pooled" | "global_percapita"; metric_value: number }[];
  landmarks: { all: { id: string; name: string; miles: number }[]; reached: string[] };
  members: { id: string; displayName: string; chosenCharacter: string | null; color: string | null; totalMiles: number; lastWeekMiles: number }[];
}
```

Add to the `api` object:

```ts
  fellowship: (fellowshipId: string) =>
    fetch(`/api/fellowship?fellowshipId=${encodeURIComponent(fellowshipId)}`, { credentials: "include" }).then(json<FellowshipCardData>),
```

- [ ] **Step 2: Create the component**

```tsx
// src/components/FellowshipCard.tsx
import { useEffect, useState } from "react";
import { api, type FellowshipCardData } from "../api-client";
import { CHARACTERS } from "../../shared/characters";

type Tab = "trophies" | "members";
function spriteFor(character: string | null): string {
  return CHARACTERS.find((c) => c.key === character)?.sprite ?? "/sprites/frodo.png";
}
function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function FellowshipCard({ fellowshipId, isLeader, onClose }: {
  fellowshipId: string | null; isLeader: boolean; onClose: () => void;
}) {
  const [data, setData] = useState<FellowshipCardData | null>(null);
  const [tab, setTab] = useState<Tab>("trophies");

  useEffect(() => {
    if (!fellowshipId) { setData(null); return; }
    setData(null);
    api.fellowship(fellowshipId).then(setData).catch(() => setData(null));
  }, [fellowshipId]);

  if (!fellowshipId) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fellowship-card" onClick={(e) => e.stopPropagation()}>
        <button className="passport-close" onClick={onClose} aria-label="Close">✕</button>
        {!data ? (
          <div className="fc-loading">Loading…</div>
        ) : (
          <>
            <h2 className="fc-name">{data.fellowship.name}</h2>
            <div className="fc-standing">
              {isLeader && <img className="fc-crown" src="/crown.png" alt="#1" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />}
              {isLeader ? "Currently #1 · " : ""}{Math.round(data.standing.pooledMiles)} / {data.standing.totalMiles} mi · {data.standing.memberCount} members
            </div>

            <div className="fc-tabs">
              <button className={"fc-tab" + (tab === "trophies" ? " on" : "")} onClick={() => setTab("trophies")}>Trophies</button>
              <button className={"fc-tab" + (tab === "members" ? " on" : "")} onClick={() => setTab("members")}>Members</button>
            </div>

            {tab === "trophies" && (
              <div className="fc-body">
                <div className="fc-shelf-head">Weekly Victories <span>{data.weeklyBadges.length}</span></div>
                <div className="fc-shelf">
                  {data.weeklyBadges.length === 0 && <div className="fc-empty">No weekly wins yet.</div>}
                  {data.weeklyBadges.map((b, i) => (
                    <div className="fc-badge" key={i} title={`Week of ${weekLabel(b.week_start)}`}>
                      <img src={b.scope === "global_pooled" ? "/badges/week-pooled.png" : "/badges/week-percapita.png"} alt={b.scope}
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
                      <small>{weekLabel(b.week_start)}</small>
                    </div>
                  ))}
                </div>

                <div className="fc-shelf-head">Lands Reached <span>{data.landmarks.reached.length}/{data.landmarks.all.length}</span></div>
                <div className="fc-shelf">
                  {data.landmarks.all.map((l) => {
                    const got = data.landmarks.reached.includes(l.id);
                    return (
                      <div className={"fc-medal" + (got ? "" : " locked")} key={l.id} title={l.name}>
                        <img src={`/medals/${l.id}.png`} alt={l.name}
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
                        <small>{l.name}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "members" && (
              <div className="fc-member-grid">
                {data.members.map((m, i) => (
                  <div className="fc-mtile" key={m.id} style={{ ["--c" as string]: m.color ?? "#fdd835" }}>
                    <div className="fc-mrank">#{i + 1} this wk</div>
                    <img className="fc-msprite" src={spriteFor(m.chosenCharacter)} alt={m.displayName} />
                    <div className="fc-mname">{m.displayName}</div>
                    <div className="fc-mstats">
                      <div><div className="fc-mv tot">{Math.round(m.totalMiles)}</div><div className="fc-mk">total mi</div></div>
                      <div><div className="fc-mv wk">+{Math.round(m.lastWeekMiles)}</div><div className="fc-mk">last wk</div></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add styles to `src/styles.css`**

```css
/* Fellowship card modal */
.fellowship-card { position: relative; max-width: 620px; width: 92vw; max-height: 88vh; overflow-y: auto;
  background: #140e05; border: 2px solid #c0392b; border-radius: 16px; padding: 20px 22px;
  color: #e8dcc0; font-family: Georgia, serif; }
.fc-loading, .fc-empty { color: #9a8a5a; padding: 20px; text-align: center; }
.fc-name { text-align: center; color: #f0a030; margin: 0 0 4px; }
.fc-standing { text-align: center; font-size: 12px; color: #d8c88a; margin-bottom: 14px; }
.fc-crown { height: 18px; vertical-align: middle; margin-right: 4px; }
.fc-tabs { display: flex; gap: 6px; justify-content: center; border-bottom: 1px solid #3a3018; margin-bottom: 16px; }
.fc-tab { border: 0; background: transparent; color: #9a8a5a; font-size: 13px; padding: 8px 14px; border-bottom: 2px solid transparent; cursor: pointer; }
.fc-tab.on { color: #f0e2c0; border-bottom-color: #f0a030; }
.fc-shelf-head { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #9a8a5a; margin: 6px 0 8px; display: flex; justify-content: space-between; }
.fc-shelf { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 16px; }
.fc-badge, .fc-medal { aspect-ratio: 1; background: #221a0c; border: 1px solid #4a3c1c; border-radius: 10px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px; }
.fc-badge img, .fc-medal img { max-width: 60%; image-rendering: pixelated; }
.fc-badge small, .fc-medal small { font-size: 7px; color: #9a8a5a; text-align: center; }
.fc-medal.locked { opacity: .28; filter: grayscale(1); }
.fc-member-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.fc-mtile { position: relative; border: 2px solid var(--c); border-radius: 12px; padding: 14px 10px 12px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 16%, #1a1408), #140e05);
  display: flex; flex-direction: column; align-items: center; text-align: center; }
.fc-mrank { position: absolute; top: 6px; left: 8px; font-size: 10px; color: #9a8a5a; }
.fc-msprite { width: 48px; height: 64px; object-fit: contain; image-rendering: pixelated; filter: drop-shadow(0 0 4px var(--c)); }
.fc-mname { font-size: 15px; color: #f0e2c0; margin: 4px 0 8px; }
.fc-mstats { display: flex; gap: 10px; width: 100%; justify-content: center; border-top: 1px solid rgba(255,255,255,.08); padding-top: 8px; }
.fc-mv { font-size: 15px; font-weight: 600; }
.fc-mv.tot { color: var(--c); }
.fc-mv.wk { color: #7fc97f; }
.fc-mk { font-size: 8px; text-transform: uppercase; letter-spacing: .4px; color: #8a7a4a; }
.trophy-btn { position: absolute; left: 12px; bottom: 12px; width: 48px; height: 48px; border-radius: 50%;
  background: rgba(42,32,16,0.9); border: 2px solid #6b5a2e; display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 1000; padding: 0; }
.trophy-btn img { width: 26px; height: 26px; }
```

- [ ] **Step 4: Wire into `src/pages/Dashboard.tsx`**

Add state and render. Near the other `useState` calls:

```tsx
  const [cardFellowshipId, setCardFellowshipId] = useState<string | null>(null);
```

Import at top:

```tsx
import { GlobalRankingPanel } from "../components/GlobalRankingPanel";
import { FellowshipCard } from "../components/FellowshipCard";
```

Replace the `{me && (<StatsPanel .../>)}` block so the panel depends on view:

```tsx
      {me && view !== "global" && (
        <StatsPanel
          me={me}
          onSync={onSync}
          syncing={syncing}
          onSelectMember={(id) => setFocus({ id, nonce: Date.now() })}
          collapsed={panelCollapsed}
          onCollapsedChange={setPanelCollapsed}
          fellowships={me.fellowships}
          fellowshipId={fellowshipId}
          onSelectFellowship={(id) => { setFellowshipId(id); setView("fellowship"); }}
        />
      )}
      {view === "global" && globalData && (
        <GlobalRankingPanel
          rankings={globalData.rankings}
          myFellowshipId={fellowshipId}
          onSelectFellowship={(id) => setCardFellowshipId(id)}
        />
      )}
```

Add the trophy shortcut button (only in fellowship view, opens own card) near the globe button:

```tsx
      {me && view !== "global" && fellowshipId && (
        <button className="trophy-btn" onClick={() => setCardFellowshipId(fellowshipId)} title="Your trophy case" aria-label="Open your fellowship card">
          <img src="/trophy.png" alt="Trophy case" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
        </button>
      )}
```

Render the card near the other modals (compute leader from global rankings when available):

```tsx
      <FellowshipCard
        fellowshipId={cardFellowshipId}
        isLeader={!!globalData?.rankings.find((r) => r.id === cardFellowshipId)?.isProgressLeader}
        onClose={() => setCardFellowshipId(null)}
      />
```

- [ ] **Step 5: Typecheck, build, commit**

Run: `npx tsc -b && npm run build`
Expected: build succeeds.

```bash
git add src/api-client.ts src/components/FellowshipCard.tsx src/pages/Dashboard.tsx src/styles.css
git commit -m "feat: fellowship card modal + trophy shortcut"
```

---

## Task 9: Selectable ghosts on the map (global view)

Make ghosts participate in cluster selection so a tap in a crowded global view fans out members + ghosts together into the existing picker.

**Files:**
- Modify: `src/components/MapView.tsx`
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- `MapView` change: when `ghosts` is present, `onSelectRunner` clusters across members + ghosts (ghosts mapped to `Member` via a passed-in mapper) using the same proximity logic.

- [ ] **Step 1: Pass a ghost→member mapper and unify selection**

In `src/pages/Dashboard.tsx`, `ghostToMember` already exists. Pass ghosts already mapped so `MapView` treats them uniformly. Change the `MapView` props usage: add `ghostMembers` derived from ghosts and let selection include them. Simplest approach that keeps `GhostOverlay` visuals: compute cluster over the combined position list.

In `src/components/MapView.tsx`, extend the cluster computation to include ghost positions. Replace the `runnerPos` / `clusterFor` block:

```tsx
  const CLUSTER_DIST = 42;
  const ghostList = ghosts ?? [];
  // Combined selectable set: members (staggered) + ghosts (each mapped to a Member-shaped entry).
  const selectable: { member: Member; x: number; y: number }[] = [
    ...members.map((m, i) => {
      const p = positionForMiles(m.totalMiles * t, ROUTE_WAYPOINTS);
      return { member: m, x: p.x + (i - (count - 1) / 2) * STAGGER, y: p.y };
    }),
    ...ghostList.map((g) => {
      const p = positionForMiles(g.totalMiles, ROUTE_WAYPOINTS);
      return { member: ghostToMember(g), x: p.x, y: p.y };
    }),
  ];
  const clusterAt = (x: number, y: number): Member[] =>
    selectable.filter((s) => Math.hypot(s.x - x, s.y - y) <= CLUSTER_DIST).map((s) => s.member);
```

Add a local `ghostToMember` helper in `MapView.tsx` (or import from a shared module). Define it above the component:

```tsx
function ghostToMember(ghost: Ghost): Member {
  return { id: ghost.userId, displayName: ghost.displayName, chosenCharacter: ghost.chosenCharacter, color: ghost.color,
    totalMiles: ghost.totalMiles, openedQuests: ghost.openedQuests, stats: ghost.stats, activities: [], fellowshipName: ghost.fellowshipName };
}
```

Update `RunnerOverlay` usage to pass the cluster computed at the member's own position:

```tsx
      {members.map((m, i) => {
        const p = positionForMiles(m.totalMiles * t, ROUTE_WAYPOINTS);
        const x = p.x + (i - (count - 1) / 2) * STAGGER;
        return <RunnerOverlay key={m.id} member={m} miles={m.totalMiles * t} offsetX={(i - (count - 1) / 2) * STAGGER} onSelect={onSelectRunner} cluster={clusterAt(x, p.y)} />;
      })}
```

Change `GhostOverlay` so its click also uses cluster selection instead of single-ghost select:

```tsx
      {ghostList.map((g) => {
        const p = positionForMiles(g.totalMiles, ROUTE_WAYPOINTS);
        return <GhostOverlay key={`${g.userId}-${g.fellowshipId}`} ghost={g} onSelectCluster={(pt) => onSelectRunner(clusterAt(p.x, p.y), pt)} />;
      })}
```

Update `GhostOverlay` to report the container click point and call `onSelectCluster`:

```tsx
function GhostOverlay({ ghost, onSelectCluster }: { ghost: Ghost; onSelectCluster: (pt: { x: number; y: number }) => void }) {
  const map = useMap();
  const p = positionForMiles(ghost.totalMiles, ROUTE_WAYPOINTS);
  const lat = latFor(p.y);
  const footLat = lat - FOOT_FRAC * CHAR_H;
  const overlayBounds: L.LatLngBoundsExpression = [[footLat, p.x - CHAR_W / 2], [footLat + CHAR_H, p.x + CHAR_W / 2]];
  return (
    <ImageOverlay
      url={spriteFor(ghost.chosenCharacter)}
      bounds={overlayBounds}
      zIndex={600}
      interactive
      eventHandlers={{
        add: (e) => {
          const el = (e.target as L.ImageOverlay).getElement();
          if (el) { el.style.imageRendering = "pixelated"; el.style.opacity = "0.6";
            el.style.filter = `drop-shadow(0 0 4px ${ghost.color ?? "#fff"}) drop-shadow(0 0 6px ${ghost.color ?? "#fff"})`; el.style.cursor = "pointer"; }
        },
        click: (e) => { const cp = map.latLngToContainerPoint(e.latlng); onSelectCluster({ x: cp.x, y: cp.y }); },
      }}
    />
  );
}
```

`GhostOverlay` now needs `useMap` — it is already imported at the top of the file.

- [ ] **Step 2: Remove the now-unused `onSelectGhost` path**

In `MapView` props, remove `onSelectGhost` and its prop type. In `Dashboard.tsx`, remove the `onSelectGhost={(g) => setProfileDetail(ghostToMember(g))}` prop from `<MapView>` (selection now flows through `onSelectRunner` → `ClusterPicker`/`ProfilePopover`).

- [ ] **Step 3: Build and manually verify**

Run: `npx tsc -b && npm run build`
Expected: build succeeds.

Manual: `npm run dev`, enter global view, confirm tapping a crowded spot opens the picker listing both your members and nearby ghosts, and selecting a ghost opens its player card.

- [ ] **Step 4: Commit**

```bash
git add src/components/MapView.tsx src/pages/Dashboard.tsx
git commit -m "feat: selectable ghosts via unified cluster picker in global view"
```

---

## Task 10: Member-of-week badges in `/api/me` + celebration

Surface the current user's member-of-week badges (current fellowship) and toast newly-seen ones.

**Files:**
- Modify: `api/me.ts`
- Modify: `src/api-client.ts`
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- `MeResponse` gains `weeklyBadges: { week_start: string }[]` — member-scope `weekly_awards` for this user + fellowship, newest first.

- [ ] **Step 1: Add the query to the fellowship branch of `api/me.ts`**

Before the final `return res.status(200).json({...})` (non-global branch), add:

```ts
  const { data: weeklyBadgeRows } = await db
    .from("weekly_awards")
    .select("week_start")
    .eq("scope", "member")
    .eq("fellowship_id", fellowship.id)
    .eq("user_id", user.id)
    .order("week_start", { ascending: false });
```

Add `weeklyBadges: weeklyBadgeRows ?? [],` to that response object.

- [ ] **Step 2: Update `MeResponse` in `src/api-client.ts`**

Add `weeklyBadges: { week_start: string }[];` to `MeResponse`.

- [ ] **Step 3: Toast newly-earned member badges in `Dashboard.tsx`**

Reuse the existing toast surface. Add an effect that fires when a badge week is newly present (seed silently on first pass like achievements). Near the achievements effect:

```tsx
  const badgeSeenRef = useRef<Set<string>>(new Set());
  const badgeSeededRef = useRef(false);
  useEffect(() => {
    if (!me) return;
    const weeks = (me.weeklyBadges ?? []).map((b) => b.week_start);
    const fresh = weeks.filter((w) => !badgeSeenRef.current.has(w));
    fresh.forEach((w) => badgeSeenRef.current.add(w));
    if (badgeSeededRef.current && fresh.length) {
      setToasts((prev) => [...prev, ...fresh.map((w) => ({ id: `week-${w}`, name: "Member of the Week!", description: `You logged the most miles the week of ${w}.`, icon: "🏅", earned: true }))]);
    }
    badgeSeededRef.current = true;
  }, [me]);
```

> The toast object shape matches `EarnedAchievement` from `src/achievements.ts` exactly: `{ id: string; name: string; icon: string; description: string; earned: boolean }`. `AchievementToasts` reads `t.id`, `t.icon`, `t.name`, so all fields above are required.

- [ ] **Step 4: Typecheck, build, commit**

Run: `npx tsc -b && npm run build`
Expected: succeeds.

```bash
git add api/me.ts src/api-client.ts src/pages/Dashboard.tsx
git commit -m "feat: member-of-week badges + celebration toast"
```

---

## Task 11: Backpack inventory restructure (`Passport`)

Rewrite `Passport` into a unified inventory grid with filter chips, tap-to-read, and narrative reading lists. Badges come from `me.weeklyBadges`.

**Files:**
- Modify: `src/components/Passport.tsx`
- Modify: `src/pages/Dashboard.tsx` (pass badges)
- Modify: `src/styles.css`

**Interfaces:**
- `Passport` props gain `weeklyBadges: { week_start: string }[]`.
- Internal model: `type Item = { kind: "postcard" | "letter" | "badge"; id: string; title: string; sortKey: number; ... }`.

- [ ] **Step 1: Rewrite `Passport.tsx`**

```tsx
// src/components/Passport.tsx
import { useState } from "react";
import { ROUTE } from "../../shared/route";
import { SIDE_QUESTS, ARCS } from "../../shared/sidequests";

type Filter = "all" | "postcards" | "letters" | "badges";

interface Item {
  kind: "postcard" | "letter" | "badge";
  id: string;
  title: string;
  sortKey: number; // higher = more recent; used for recency ordering
  scene?: string;  // postcard image path
  lore?: string;   // postcard/letter body
  arcColor?: string;
  mi?: number;
}

export function Passport({ totalMiles, openedQuestIds, weeklyBadges }: {
  totalMiles: number;
  openedQuestIds: string[];
  weeklyBadges: { week_start: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [reading, setReading] = useState<Item | null>(null);

  const postcards: Item[] = ROUTE.filter((w) => w.isLandmark && w.cumulativeMiles <= totalMiles).map((w) => ({
    kind: "postcard", id: w.landmarkId!, title: w.name, sortKey: w.cumulativeMiles, scene: `/scenes/${w.landmarkId}.png`, lore: w.lore, mi: w.cumulativeMiles,
  }));
  const openedSet = new Set(openedQuestIds);
  const letters: Item[] = SIDE_QUESTS.filter((q) => openedSet.has(q.id)).map((q) => ({
    kind: "letter", id: q.id, title: q.title, sortKey: q.revealMiles, lore: q.story, arcColor: ARCS[q.arc]?.color, mi: q.revealMiles,
  }));
  const badges: Item[] = weeklyBadges.map((b) => ({
    kind: "badge", id: `week-${b.week_start}`, title: `Member of the Week`, sortKey: new Date(`${b.week_start}T00:00:00Z`).getTime() / 1e6,
    lore: `You logged the most miles the week of ${b.week_start}.`,
  }));

  const all = [...postcards, ...letters, ...badges].sort((a, b) => b.sortKey - a.sortKey);
  const shown = filter === "all" ? all
    : filter === "postcards" ? postcards.slice().sort((a, b) => b.sortKey - a.sortKey)
    : filter === "letters" ? letters.slice().sort((a, b) => b.sortKey - a.sortKey)
    : badges.slice().sort((a, b) => b.sortKey - a.sortKey);
  const narrative = filter === "letters" || filter === "postcards";

  const iconFor = (it: Item) => it.kind === "postcard" ? "🖼️" : it.kind === "letter" ? "✉️" : "🏅";

  return (
    <>
      <button className="backpack-btn" onClick={() => setOpen(true)} title="Your journey" aria-label="Open your journey log">
        <img src="/pack.png" alt="Backpack" />
      </button>

      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="modal pixel-frame passport" onClick={(e) => e.stopPropagation()}>
            <button className="passport-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            <h2>Your Journey</h2>

            <div className="bp-chips">
              {(["all", "postcards", "letters", "badges"] as Filter[]).map((f) => (
                <button key={f} className={"bp-chip" + (filter === f ? " on" : "")} onClick={() => { setFilter(f); setReading(null); }}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {all.length === 0 ? (
              <p className="lore">No postcards, letters, or badges yet — lace up and reach a landmark, find a letter, or win a week!</p>
            ) : reading ? (
              <div className="bp-reader">
                <button className="bp-back" onClick={() => setReading(null)}>← Back</button>
                {reading.scene && <img className="postcard-scene" src={reading.scene} alt={reading.title} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />}
                <h4>{reading.title}{reading.mi != null ? ` · ${reading.mi} mi` : ""}</h4>
                <p className="lore">{reading.lore}</p>
              </div>
            ) : narrative ? (
              <div className="bp-reading-list">
                {shown.map((it) => (
                  <div key={it.id} className="bp-rl-item" style={{ borderLeftColor: it.arcColor ?? "#c9a24a" }} onClick={() => setReading(it)}>
                    <span className="bp-rl-ic">{iconFor(it)}</span>
                    <span className="bp-rl-tt">{it.title}</span>
                    <span className="bp-rl-mi">{it.mi != null ? `${it.mi} mi` : ""}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bp-grid">
                {shown.map((it) => (
                  <button key={it.id} className={"bp-tile bp-" + it.kind} onClick={() => (it.kind === "badge" ? setReading(it) : setReading(it))} title={it.title}>
                    <span className="bp-tile-ic">{iconFor(it)}</span>
                    <span className="bp-tile-tt">{it.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Pass badges from `Dashboard.tsx`**

Change the `Passport` render to:

```tsx
      {me && <Passport totalMiles={me.user.totalMiles} openedQuestIds={openedQuests} weeklyBadges={me.weeklyBadges ?? []} />}
```

- [ ] **Step 3: Add styles to `src/styles.css`**

```css
/* Backpack inventory */
.bp-chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 12px; }
.bp-chip { font-size: 11px; padding: 4px 10px; border: 1px solid #4a3c1c; border-radius: 20px; background: transparent; color: #b8a878; cursor: pointer; }
.bp-chip.on { background: #6b5a2e; color: #fff; border-color: #6b5a2e; }
.bp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.bp-tile { aspect-ratio: 1; border: 1px solid #4a3c1c; border-radius: 8px; background: #221a0c; color: #e8dcc0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; padding: 4px; }
.bp-tile-ic { font-size: 22px; }
.bp-tile-tt { font-size: 8px; color: #9a8a5a; text-align: center; line-height: 1.1; }
.bp-reading-list { display: flex; flex-direction: column; gap: 7px; }
.bp-rl-item { display: flex; align-items: center; gap: 10px; background: #1c1508; border: 1px solid #3a3018; border-left: 3px solid #c9a24a;
  border-radius: 8px; padding: 9px 10px; cursor: pointer; }
.bp-rl-ic { font-size: 18px; }
.bp-rl-tt { flex: 1; font-size: 13px; color: #f0e2c0; }
.bp-rl-mi { font-size: 10px; color: #9a8a5a; }
.bp-reader { text-align: center; }
.bp-back { background: transparent; border: 0; color: #9a8a5a; cursor: pointer; float: left; }
```

- [ ] **Step 4: Build and manually verify**

Run: `npx tsc -b && npm run build`
Expected: succeeds.

Manual: `npm run dev`, open the backpack. Confirm: All view is a recency-ordered grid; tapping a tile opens the reader; Letters/Postcards filters show a reading list; Badges filter shows badge tiles.

- [ ] **Step 5: Commit**

```bash
git add src/components/Passport.tsx src/pages/Dashboard.tsx src/styles.css
git commit -m "feat: unified inventory backpack with filters and reading list"
```

---

## Task 12: Asset wiring pass

Drop in user-provided art behind the already-referenced paths and verify graceful fallback.

**Files:**
- Add (binary, provided by user): `public/crown.png`, `public/trophy.png`, `public/badges/week-pooled.png`, `public/badges/week-percapita.png`, `public/badges/member-week.png`, `public/medals/<landmarkId>.png` per landmark.

**Interfaces:** none (static assets). Every consumer already has an `onError` fallback so missing art degrades gracefully.

- [ ] **Step 1: Place the provided images**

Copy the user's images into `public/` at the paths above. Landmark ids come from `shared/route.ts` (`landmarkId` on `isLandmark` waypoints): list them with `grep 'landmarkId' shared/route.ts`.

- [ ] **Step 2: Verify in the running app**

Run: `npm run dev`
Manual: open a fellowship card — crown (if leader), weekly badges, and medals render from the new art; unreached medals appear greyed. Open the backpack — badge tiles render. The bottom-left trophy shortcut shows the trophy icon.

- [ ] **Step 3: Commit**

```bash
git add public/crown.png public/trophy.png public/badges public/medals
git commit -m "feat: trophy, crown, badge, and medal art"
```

---

## Self-Review Notes

- **Spec coverage:** §1 ranking panel → Tasks 5–6; §2 fellowship card → Tasks 7–8; §3 map fix → Task 9; §4 weekly winners/cron → Tasks 1–4, badges surfaced in Tasks 8/10; §5 backpack → Task 11; API changes → Tasks 5,7,10; assets → Task 12.
- **Week definition** is centralized in `shared/weeks.ts` (Task 1) and reused everywhere (Tasks 2,4,5,7).
- **Idempotent locking** verified by Task 4 tests (recorded-week skip, no-history, per-scope rows).
- **Type consistency:** `RankingRow` defined identically in `api/me.ts` (Task 5) and `src/api-client.ts` (Task 6); `FellowshipInput`/`weekMiles`/`memberTotal` reused across Tasks 2,4,5,7; toast object shape verified against `EarnedAchievement` in `src/achievements.ts` (Task 10).
- **No open placeholders:** all task steps carry concrete code and commands.
