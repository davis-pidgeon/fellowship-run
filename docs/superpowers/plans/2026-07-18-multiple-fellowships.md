# Multiple Fellowships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people belong to multiple, independently-configured Fellowships (own start date, allowed Strava activity types, and Strava API app), add an admin screen to manage Fellowships and membership, and give the dashboard a Fellowship switcher plus a Global "ghost" view.

**Architecture:** Extend the existing Postgres schema with a `fellowship_members` join table and per-Fellowship config columns. All mileage becomes a live aggregation (`sum(activities)` filtered by a Fellowship's date + activity-type rules) instead of a cached total — implemented as pure, unit-tested functions in `shared/fellowship-sync.ts`. The admin screen is a new gated route backed by two new serverless endpoints. The dashboard gains a Fellowship switcher and a read-only Global view reusing the existing map.

**Tech Stack:** Same as the existing app — TypeScript, React 18 + Vite, react-leaflet, Vercel serverless functions (Node 22.x), Supabase (`@supabase/supabase-js`), `jose`, Node `crypto` (AES-256-GCM), Vitest + @testing-library/react.

## Global Constraints

- **Language:** TypeScript everywhere, `"strict": true`.
- **Node runtime:** `"engines": { "node": "22.x" }` (current `package.json`).
- **Miles conversion factor:** 1 mile = `1609.344` meters (`shared/units.ts`, unchanged).
- **Dedupe key:** `strava_activity_id` is globally unique; never insert a duplicate.
- **Milestone idempotency:** a milestone now fires exactly once per `(scope, user_id, fellowship_id, landmark_id)` — not `(scope, user_id, landmark_id)` as before.
- **No cached totals:** mileage is always computed live from `activities`; no `total_miles`-style cache is reintroduced anywhere.
- **A user always has ≥1 Fellowship membership**, enforced at the application layer (admin "remove member" rejects removing the last one).
- **A Strava app (client ID/secret) is optional per Fellowship and per user.** `NULL` means "use the app configured by the `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` env vars" (the existing single app, now called the *default app*). This resolves cleanly with zero env var renames — see Task 8/10/11.
- **Secrets:** `STRAVA_CLIENT_SECRET` (env default) and every per-Fellowship/per-user `strava_client_secret` are encrypted at rest with the existing `encrypt`/`decrypt` (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`). Never logged, never sent to the browser.
- **Admin gating:** every admin endpoint re-checks `users.is_admin` server-side via session on every call — never trust a client-side flag alone.
- **Commits:** conventional commits, one per task minimum.

---

## File Structure

```
supabase/migrations/
├── 0002_multiple_fellowships.sql        # additive schema + backfill + milestone constraint fix
└── 0003_drop_legacy_fellowship_columns.sql  # run only after new app code is deployed

shared/
├── types.ts                # + sportType on RunActivity, + Fellowship, + FellowshipBadge
├── activity-types.ts        # NEW — ACTIVITY_TYPES list (shared by admin API + admin UI)
├── fellowship-sync.ts        # NEW — pure per-Fellowship aggregation + sync computation
├── fellowship-sync.test.ts   # NEW
├── sync-core.ts               # DELETED (superseded by fellowship-sync.ts)
└── sync-core.test.ts          # DELETED

api/
├── _lib/
│   ├── admin.ts             # NEW — requireAdminUserId
│   ├── admin.test.ts        # NEW
│   └── strava.ts            # fetchRunsSince widened to accept allowed types + sport_type
├── admin/
│   ├── fellowships.ts       # NEW — GET list / POST create / PATCH edit
│   ├── fellowships.test.ts  # NEW
│   └── members.ts           # NEW — GET list / POST add / DELETE remove
├── auth/strava-callback.ts   # per-Fellowship app resolution, fellowship_members insert
├── invite.ts                  # trimmed to GET only, returns resolved stravaClientId
├── sync.ts                    # full multi-Fellowship rewrite
└── me.ts                      # fellowshipId + view=global support, live aggregation

src/
├── api-client.ts             # new types + admin methods, stravaAuthUrl(clientId, token?)
├── useSession.ts              # tracks selected fellowshipId/view
├── pages/
│   ├── Join.tsx                # uses resolved clientId from checkInvite
│   ├── Admin.tsx                # NEW
│   └── Dashboard.tsx            # switcher + global-view wiring
└── components/
    ├── CelebrationModal.tsx     # badges: FellowshipBadge[]
    ├── FellowshipSwitcher.tsx    # NEW
    ├── AdminFellowshipsPanel.tsx # NEW
    ├── AdminMembersPanel.tsx     # NEW
    ├── MapView.tsx                # ghost rendering mode
    └── StatsPanel.tsx             # hides sync/lens toggle in global view
```

---

### Task 1: Schema migration for multiple Fellowships

**Files:**
- Create: `supabase/migrations/0002_multiple_fellowships.sql`
- Create: `supabase/migrations/0003_drop_legacy_fellowship_columns.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `fellowship_members` table; `fellowship.start_date` / `allowed_activity_types` / `strava_client_id` / `strava_client_secret`; `users.is_admin` / `strava_client_id` / `strava_client_secret`; `activities.sport_type`; fixed `milestone_awards` unique constraint. Every later task's Supabase queries assume these columns exist.

There's no local Postgres in this project (migrations are pasted into the Supabase SQL editor per the README), so this task's "test" is a careful manual run — same as `0001_init.sql` before it.

- [ ] **Step 1: Write the additive migration**

```sql
-- supabase/migrations/0002_multiple_fellowships.sql
begin;

alter table fellowship
  add column start_date date not null default '2026-07-01',
  add column allowed_activity_types text[] not null default '{Run,TrailRun,VirtualRun,Walk,Hike}',
  add column strava_client_id text,
  add column strava_client_secret text;

create table fellowship_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  fellowship_id uuid not null references fellowship(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (user_id, fellowship_id)
);
create index fellowship_members_user_idx on fellowship_members(user_id);
create index fellowship_members_fellowship_idx on fellowship_members(fellowship_id);
alter table fellowship_members enable row level security;

-- Carry every existing single-fellowship membership into the new join table.
insert into fellowship_members (user_id, fellowship_id, joined_at)
select id, fellowship_id, created_at from users;

alter table users
  add column is_admin boolean not null default false,
  add column strava_client_id text,
  add column strava_client_secret text;

-- sport_type was never stored before this migration (the sync handler filtered
-- to foot-travel types and discarded the field). Every historical activity was
-- imported under that same foot-travel filter, so 'Run' is a safe backfill: it
-- only matters if a fellowship's allowed_activity_types is narrowed below the
-- full foot-travel set, which the migrated fellowship below is not.
alter table activities add column sport_type text not null default 'Run';

alter table milestone_awards drop constraint milestone_awards_scope_user_id_landmark_id_key;
alter table milestone_awards add constraint milestone_awards_scope_user_id_fellowship_id_landmark_id_key
  unique (scope, user_id, fellowship_id, landmark_id);

commit;

-- ── Manual follow-up ──────────────────────────────────────────────────────
-- Check your deployed JOURNEY_START_DATE env var (Vercel → Project Settings).
-- If it is anything other than 2026-07-01, run this so no one's progress
-- resets (start_date defaulted to 2026-07-01 above for every fellowship,
-- including the pre-existing one):
--
-- update fellowship set start_date = '<your JOURNEY_START_DATE value>'
--   where id = (select id from fellowship order by created_at limit 1);
--
-- Then make yourself admin (find your user id from the `users` table first):
--
-- update users set is_admin = true where id = '<your user id>';
```

- [ ] **Step 2: Write the follow-up migration (run only after Tasks 8–11 are deployed)**

```sql
-- supabase/migrations/0003_drop_legacy_fellowship_columns.sql
-- Run this ONLY after the new application code (which reads fellowship_members
-- and computes mileage live) is deployed and confirmed working. Until then,
-- the old code path still depends on these two columns.
alter table users drop column fellowship_id;
alter table users drop column total_miles;
```

- [ ] **Step 3: Run `0002_multiple_fellowships.sql` in the Supabase SQL editor against your project**

Verify: `select count(*) from fellowship_members;` returns the same row count as `select count(*) from users;` (every existing user got exactly one membership row).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_multiple_fellowships.sql supabase/migrations/0003_drop_legacy_fellowship_columns.sql
git commit -m "feat: schema for multiple fellowships"
```

---

### Task 2: Shared types and activity-type list

**Files:**
- Modify: `shared/types.ts`
- Create: `shared/activity-types.ts`
- Delete: `shared/sync-core.ts`, `shared/sync-core.test.ts` (superseded by Task 3; confirmed unused outside those two files and `api/sync.ts`, which Task 10 rewrites)

**Interfaces:**
- Consumes: nothing.
- Produces: `RunActivity.sportType: string`; `Fellowship { id, name, startDate, allowedActivityTypes }`; `FellowshipBadge { fellowshipId, fellowshipName, milestone: Milestone }`; `ACTIVITY_TYPES: { key: string; label: string }[]` — Task 4 (Strava fetch), Task 3 (aggregation), Task 6 (admin validation), and Task 15 (admin UI checklist) all import from here.

- [ ] **Step 1: Add `sportType` to `RunActivity`, add `Fellowship` and `FellowshipBadge` types**

In `shared/types.ts`, change:

```ts
export interface RunActivity {
  stravaActivityId: number;
  distanceMiles: number;
  runDate: string; // ISO 8601
  name: string;
  movingSeconds?: number; // Strava moving_time, for pace; optional for older data
}
```

to:

```ts
export interface RunActivity {
  stravaActivityId: number;
  distanceMiles: number;
  runDate: string; // ISO 8601
  name: string;
  movingSeconds?: number; // Strava moving_time, for pace; optional for older data
  sportType: string; // Strava's activity type, e.g. "Run", "Walk", "Ride"
}
```

Then append at the end of the file:

```ts
export interface Fellowship {
  id: string;
  name: string;
  startDate: string; // ISO date, e.g. "2026-07-01"
  allowedActivityTypes: string[];
}

export interface FellowshipBadge {
  fellowshipId: string;
  fellowshipName: string;
  milestone: Milestone;
}
```

- [ ] **Step 2: Create the shared activity-type list**

```ts
// shared/activity-types.ts
export interface ActivityTypeDef {
  key: string;
  label: string;
}

// Strava sport_type values the app knows how to classify. Used both to
// validate admin input and to render the admin checklist.
export const ACTIVITY_TYPES: ActivityTypeDef[] = [
  { key: "Run", label: "Run" },
  { key: "TrailRun", label: "Trail Run" },
  { key: "VirtualRun", label: "Virtual Run" },
  { key: "Walk", label: "Walk" },
  { key: "Hike", label: "Hike" },
  { key: "Ride", label: "Ride" },
  { key: "VirtualRide", label: "Virtual Ride" },
];
```

- [ ] **Step 3: Delete the superseded sync-core module**

```bash
git rm shared/sync-core.ts shared/sync-core.test.ts
```

- [ ] **Step 4: Run the type checker and test suite**

Run: `npx tsc -b --noEmit && npm test`
Expected: `tsc` fails only inside `api/sync.ts` (still references the old `RunActivity` shape without `sportType` and imports the now-deleted `sync-core.js`) — that's expected and fixed in Task 10. No other file should fail.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/activity-types.ts
git commit -m "feat: fellowship + sportType types, activity-type list"
```

---

### Task 3: Pure per-Fellowship aggregation and sync computation

**Files:**
- Create: `shared/fellowship-sync.ts`
- Test: `shared/fellowship-sync.test.ts`

**Interfaces:**
- Consumes: `RunActivity`, `Waypoint`, `Milestone` (`shared/types.ts`); `crossedLandmarks` (`shared/milestones.ts`).
- Produces: `memberTotal(activities, fellowship): number`; `earliestStartDate(fellowships): string`; `unionActivityTypes(fellowships): string[]`; `canRemoveMembership(membershipCount): boolean`; `newActivitiesOnly(fetched, existingIds): RunActivity[]`; `computeFellowshipTotals(fellowships, activitiesBefore, activitiesAfter, route): { fellowshipId: string; newTotalMiles: number; crossed: Milestone[] }[]`. Task 10 (`api/sync.ts`) and Task 7 (`api/admin/members.ts`) both call into this module — those are the exact names/signatures they use.

- [ ] **Step 1: Write the failing tests**

```ts
// shared/fellowship-sync.test.ts
import { describe, it, expect } from "vitest";
import {
  memberTotal,
  earliestStartDate,
  unionActivityTypes,
  canRemoveMembership,
  newActivitiesOnly,
  computeFellowshipTotals,
} from "./fellowship-sync";
import type { RunActivity, Waypoint, Fellowship } from "./types";

const run = (id: number, miles: number, runDate: string, sportType = "Run"): RunActivity => ({
  stravaActivityId: id, distanceMiles: miles, runDate, name: "Run", sportType,
});

const runningFellowship: Fellowship = {
  id: "f-run", name: "Runners", startDate: "2026-07-01",
  allowedActivityTypes: ["Run", "TrailRun"],
};
const cyclingFellowship: Fellowship = {
  id: "f-ride", name: "Cyclists", startDate: "2026-08-01",
  allowedActivityTypes: ["Ride"],
};

const route: Waypoint[] = [
  { name: "Start", x: 0, y: 0, cumulativeMiles: 0, isLandmark: true, landmarkId: "start", message: "m", lore: "l" },
  { name: "L1", x: 0, y: 0, cumulativeMiles: 10, isLandmark: true, landmarkId: "l1", message: "m1", lore: "lore1" },
];

describe("memberTotal", () => {
  it("sums only activities matching the fellowship's type and date floor", () => {
    const activities = [
      run(1, 3, "2026-07-05T00:00:00Z", "Run"),
      run(2, 4, "2026-06-15T00:00:00Z", "Run"), // before start_date — excluded
      run(3, 5, "2026-07-06T00:00:00Z", "Ride"), // wrong type — excluded
      run(4, 2, "2026-07-07T00:00:00Z", "TrailRun"),
    ];
    expect(memberTotal(activities, runningFellowship)).toBe(5);
  });
  it("returns 0 for no matching activities", () => {
    expect(memberTotal([], runningFellowship)).toBe(0);
  });
});

describe("earliestStartDate", () => {
  it("returns the earliest of several fellowships' start dates", () => {
    expect(earliestStartDate([runningFellowship, cyclingFellowship])).toBe("2026-07-01");
  });
});

describe("unionActivityTypes", () => {
  it("unions allowed types across fellowships without duplicates", () => {
    const withOverlap: Fellowship = { ...cyclingFellowship, allowedActivityTypes: ["Ride", "Run"] };
    expect(new Set(unionActivityTypes([runningFellowship, withOverlap]))).toEqual(
      new Set(["Run", "TrailRun", "Ride"])
    );
  });
});

describe("canRemoveMembership", () => {
  it("allows removal when the user has more than one membership", () => expect(canRemoveMembership(2)).toBe(true));
  it("rejects removal of the last membership", () => expect(canRemoveMembership(1)).toBe(false));
});

describe("newActivitiesOnly", () => {
  it("filters out already-known activity ids", () => {
    const fetched = [run(1, 3, "2026-07-05T00:00:00Z"), run(2, 4, "2026-07-06T00:00:00Z")];
    expect(newActivitiesOnly(fetched, [1]).map((a) => a.stravaActivityId)).toEqual([2]);
  });
});

describe("computeFellowshipTotals", () => {
  it("computes an independent total and crossings per fellowship", () => {
    const before = [run(1, 6, "2026-07-02T00:00:00Z", "Run")];
    const after = [...before, run(2, 5, "2026-07-03T00:00:00Z", "Run")];
    const results = computeFellowshipTotals([runningFellowship], before, after, route);
    expect(results).toEqual([
      { fellowshipId: "f-run", newTotalMiles: 11, crossed: [expect.objectContaining({ landmarkId: "l1" })] },
    ]);
  });
  it("lets two fellowships cross the same landmark independently in one sync", () => {
    const fellowships: Fellowship[] = [
      { ...runningFellowship, id: "f-a" },
      { ...runningFellowship, id: "f-b", startDate: "2026-07-01" },
    ];
    const before = [run(1, 9, "2026-07-02T00:00:00Z", "Run")];
    const after = [...before, run(2, 2, "2026-07-03T00:00:00Z", "Run")];
    const results = computeFellowshipTotals(fellowships, before, after, route);
    expect(results.map((r) => r.fellowshipId)).toEqual(["f-a", "f-b"]);
    expect(results[0].crossed.map((m) => m.landmarkId)).toEqual(["l1"]);
    expect(results[1].crossed.map((m) => m.landmarkId)).toEqual(["l1"]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run shared/fellowship-sync.test.ts`
Expected: FAIL — `Cannot find module './fellowship-sync'`

- [ ] **Step 3: Implement `shared/fellowship-sync.ts`**

```ts
import type { RunActivity, Waypoint, Milestone, Fellowship } from "./types.js";
import { crossedLandmarks } from "./milestones.js";

export function memberTotal(activities: RunActivity[], fellowship: Fellowship): number {
  const floor = new Date(fellowship.startDate).getTime();
  const allowed = new Set(fellowship.allowedActivityTypes);
  return activities
    .filter((a) => allowed.has(a.sportType) && new Date(a.runDate).getTime() >= floor)
    .reduce((sum, a) => sum + a.distanceMiles, 0);
}

export function earliestStartDate(fellowships: Fellowship[]): string {
  return fellowships.reduce(
    (earliest, f) => (f.startDate < earliest ? f.startDate : earliest),
    fellowships[0].startDate
  );
}

export function unionActivityTypes(fellowships: Fellowship[]): string[] {
  const set = new Set<string>();
  for (const f of fellowships) for (const t of f.allowedActivityTypes) set.add(t);
  return [...set];
}

export function canRemoveMembership(membershipCountForUser: number): boolean {
  return membershipCountForUser > 1;
}

export function newActivitiesOnly(fetched: RunActivity[], existingActivityIds: number[]): RunActivity[] {
  const known = new Set(existingActivityIds);
  return fetched.filter((a) => !known.has(a.stravaActivityId));
}

export interface FellowshipSyncResult {
  fellowshipId: string;
  newTotalMiles: number;
  crossed: Milestone[];
}

// Diffs each fellowship's member total before vs. after a sync to detect
// landmark crossings — independently per fellowship, since the same person's
// mileage (and thus crossings) can differ across the fellowships they're in.
export function computeFellowshipTotals(
  fellowships: Fellowship[],
  activitiesBeforeSync: RunActivity[],
  activitiesAfterSync: RunActivity[],
  route: Waypoint[]
): FellowshipSyncResult[] {
  return fellowships.map((f) => {
    const before = memberTotal(activitiesBeforeSync, f);
    const after = memberTotal(activitiesAfterSync, f);
    return { fellowshipId: f.id, newTotalMiles: after, crossed: crossedLandmarks(before, after, route) };
  });
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run shared/fellowship-sync.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/fellowship-sync.ts shared/fellowship-sync.test.ts
git commit -m "feat: pure per-fellowship mileage aggregation and sync computation"
```

---

### Task 4: Widen Strava activity fetch to any configured type

**Files:**
- Modify: `api/_lib/strava.ts`
- Modify (existing tests, update expectations): `api/_lib/strava.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fetchRunsSince(accessToken, afterEpoch, allowedTypes: Set<string>, fetchImpl?): Promise<RunActivity[]>` — note the new required `allowedTypes` parameter; every activity returned now carries `sportType`. Task 10 (`api/sync.ts`) calls this with `new Set(unionActivityTypes(...))`.

- [ ] **Step 1: Update the test file for the new signature and `sportType` field**

Replace the `fetchRunsSince` describe block in `api/_lib/strava.test.ts`:

```ts
describe("fetchRunsSince", () => {
  const FOOT = new Set(["Run", "TrailRun", "VirtualRun", "Walk", "Hike"]);

  it("converts meters to miles, stops on a short page, and records sportType", async () => {
    const page1 = [
      { id: 1, type: "Run", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Morning" },
      { id: 2, type: "Ride", distance: 20000, start_date: "2026-07-01T00:00:00Z", name: "Bike" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page1)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, FOOT, fetchImpl);
    expect(runs).toHaveLength(1);
    expect(runs[0].stravaActivityId).toBe(1);
    expect(runs[0].sportType).toBe("Run");
    expect(runs[0].distanceMiles).toBeCloseTo(1, 6);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // short page => no page 2
  });

  it("keeps all types passed in allowedTypes (e.g. the full foot-travel set)", async () => {
    const page = [
      { id: 1, type: "Run", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Road" },
      { id: 2, type: "TrailRun", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Trail" },
      { id: 3, type: "VirtualRun", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Treadmill" },
      { id: 4, type: "Walk", distance: 1609.344, start_date: "2026-07-06T00:00:00Z", name: "USA BEAT BELGIUM" },
      { id: 5, type: "Hike", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Mountain" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, FOOT, fetchImpl);
    expect(runs.map((r) => r.stravaActivityId)).toEqual([1, 2, 3, 4, 5]);
  });

  it("drops types not in allowedTypes", async () => {
    const page = [
      { id: 1, type: "Run", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Run" },
      { id: 2, type: "Ride", distance: 20000, start_date: "2026-07-01T00:00:00Z", name: "Bike" },
      { id: 3, type: "Swim", distance: 2000, start_date: "2026-07-01T00:00:00Z", name: "Pool" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, FOOT, fetchImpl);
    expect(runs.map((r) => r.stravaActivityId)).toEqual([1]);
  });

  it("allows a cycling-only set when a fellowship is configured for it", async () => {
    const page = [
      { id: 1, type: "Run", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Run" },
      { id: 2, type: "Ride", distance: 20000, start_date: "2026-07-01T00:00:00Z", name: "Bike" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, new Set(["Ride"]), fetchImpl);
    expect(runs.map((r) => r.stravaActivityId)).toEqual([2]);
  });

  it("prefers sport_type over legacy type when classifying", async () => {
    const page = [
      { id: 1, type: "Run", sport_type: "TrailRun", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Trail" },
      { id: 2, type: "Run", sport_type: "Ride", distance: 20000, start_date: "2026-07-01T00:00:00Z", name: "E-bike" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, FOOT, fetchImpl);
    expect(runs.map((r) => r.stravaActivityId)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run api/_lib/strava.test.ts`
Expected: FAIL — `fetchRunsSince` called with the wrong number/type of arguments (TS) or the old hardcoded `FOOT_TRAVEL_TYPES` behavior doesn't match the cycling-only case.

- [ ] **Step 3: Update `fetchRunsSince` in `api/_lib/strava.ts`**

Remove the module-level `FOOT_TRAVEL_TYPES` constant and change the function to:

```ts
export async function fetchRunsSince(
  accessToken: string,
  afterEpoch: number,
  allowedTypes: Set<string>,
  fetchImpl?: typeof fetch
): Promise<RunActivity[]> {
  const f = fetchImpl ?? fetch;
  const perPage = 200;
  const runs: RunActivity[] = [];
  for (let page = 1; ; page++) {
    const url = `${ACTIVITIES_URL}?after=${afterEpoch}&per_page=${perPage}&page=${page}`;
    const res = await f(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) throw new Error("Strava rate limit reached");
    if (!res.ok) throw new Error(`Strava activities request failed: ${res.status}`);
    const batch = (await res.json()) as Array<{
      id: number; type: string; sport_type?: string; distance: number; start_date: string; name: string; moving_time?: number;
    }>;
    for (const a of batch) {
      const sportType = a.sport_type ?? a.type;
      if (allowedTypes.has(sportType)) {
        runs.push({
          stravaActivityId: a.id,
          distanceMiles: metersToMiles(a.distance),
          runDate: a.start_date,
          name: a.name,
          movingSeconds: a.moving_time,
          sportType,
        });
      }
    }
    if (batch.length < perPage) break;
  }
  return runs;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run api/_lib/strava.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/strava.ts api/_lib/strava.test.ts
git commit -m "feat: widen Strava fetch to any configured activity type"
```

---

### Task 5: Admin session check helper

**Files:**
- Create: `api/_lib/admin.ts`
- Test: `api/_lib/admin.test.ts`

**Interfaces:**
- Consumes: `readSessionUserId` (`api/_lib/http.ts`).
- Produces: `requireAdminUserId(req, db): Promise<string | null>` — returns the userId if the session is valid AND `users.is_admin` is true, else `null`. Tasks 6 and 7 (`api/admin/*`) call this first thing in every handler.

- [ ] **Step 1: Write the failing tests**

```ts
// api/_lib/admin.test.ts
import { describe, it, expect } from "vitest";
import { requireAdminUserId } from "./admin";
import { signSession } from "./session";
import { SESSION_COOKIE } from "./http";

function fakeDb(isAdmin: boolean | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: isAdmin === null ? null : { is_admin: isAdmin } }),
        }),
      }),
    }),
  };
}

describe("requireAdminUserId", () => {
  process.env.SESSION_SECRET = "a-test-secret-that-is-long-enough!!";

  it("returns the userId when the session is valid and the user is an admin", async () => {
    const token = await signSession("u-1", process.env.SESSION_SECRET!);
    const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };
    expect(await requireAdminUserId(req, fakeDb(true))).toBe("u-1");
  });

  it("returns null when the user is not an admin", async () => {
    const token = await signSession("u-2", process.env.SESSION_SECRET!);
    const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };
    expect(await requireAdminUserId(req, fakeDb(false))).toBeNull();
  });

  it("returns null when there is no session", async () => {
    expect(await requireAdminUserId({ headers: {} }, fakeDb(true))).toBeNull();
  });

  it("returns null when the user row is missing", async () => {
    const token = await signSession("u-3", process.env.SESSION_SECRET!);
    const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };
    expect(await requireAdminUserId(req, fakeDb(null))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run api/_lib/admin.test.ts`
Expected: FAIL — `Cannot find module './admin'`

- [ ] **Step 3: Implement `api/_lib/admin.ts`**

```ts
import { readSessionUserId } from "./http.js";

export interface AdminLookup {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{ data: { is_admin: boolean } | null }>;
      };
    };
  };
}

export async function requireAdminUserId(
  req: { headers: Record<string, string | string[] | undefined> },
  db: AdminLookup
): Promise<string | null> {
  const userId = await readSessionUserId(req);
  if (!userId) return null;
  const { data } = await db.from("users").select("is_admin").eq("id", userId).maybeSingle();
  if (!data?.is_admin) return null;
  return userId;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run api/_lib/admin.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/admin.ts api/_lib/admin.test.ts
git commit -m "feat: admin session check helper"
```

---

### Task 6: Admin Fellowships endpoint

**Files:**
- Create: `api/admin/fellowships.ts`
- Test: `api/admin/fellowships.test.ts`

**Interfaces:**
- Consumes: `requireAdminUserId` (`api/_lib/admin.ts`), `getServiceClient` (`api/_lib/supabase.ts`), `encrypt` (`api/_lib/crypto.ts`), `ACTIVITY_TYPES` (`shared/activity-types.ts`).
- Produces: `isValidActivityTypes(types: string[]): boolean` (exported for the test, mirrors `isValidCharacter` in `api/character.ts`); the route `GET/POST/PATCH /api/admin/fellowships`. Task 15 (admin UI) calls this route with the bodies documented in Step 3.

- [ ] **Step 1: Write the failing test for the pure validator**

```ts
// api/admin/fellowships.test.ts
import { describe, it, expect } from "vitest";
import { isValidActivityTypes } from "./fellowships";

describe("isValidActivityTypes", () => {
  it("accepts a non-empty list of known types", () => {
    expect(isValidActivityTypes(["Run", "Walk"])).toBe(true);
  });
  it("rejects an empty list", () => {
    expect(isValidActivityTypes([])).toBe(false);
  });
  it("rejects an unknown type", () => {
    expect(isValidActivityTypes(["Run", "Sauron"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run api/admin/fellowships.test.ts`
Expected: FAIL — `Cannot find module './fellowships'`

- [ ] **Step 3: Implement `api/admin/fellowships.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "node:crypto";
import { getServiceClient } from "../_lib/supabase.js";
import { requireAdminUserId } from "../_lib/admin.js";
import { encrypt } from "../_lib/crypto.js";
import { getEnv } from "../_lib/env.js";
import { ACTIVITY_TYPES } from "../../shared/activity-types.js";

const VALID_TYPES = new Set(ACTIVITY_TYPES.map((t) => t.key));

export function isValidActivityTypes(types: unknown): types is string[] {
  return (
    Array.isArray(types) &&
    types.length > 0 &&
    types.every((t) => typeof t === "string" && VALID_TYPES.has(t))
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getServiceClient();
  const adminId = await requireAdminUserId(req, db);
  if (!adminId) return res.status(403).json({ error: "forbidden" });

  if (req.method === "GET") {
    const { data: fellowships } = await db
      .from("fellowship")
      .select("id, name, start_date, allowed_activity_types, invite_token, strava_client_id");
    const { data: members } = await db.from("fellowship_members").select("fellowship_id");
    const counts = new Map<string, number>();
    for (const m of members ?? []) counts.set(m.fellowship_id, (counts.get(m.fellowship_id) ?? 0) + 1);
    return res.status(200).json({
      fellowships: (fellowships ?? []).map((f) => ({
        id: f.id, name: f.name, startDate: f.start_date,
        allowedActivityTypes: f.allowed_activity_types,
        inviteToken: f.invite_token,
        hasCustomStravaApp: !!f.strava_client_id,
        memberCount: counts.get(f.id) ?? 0,
      })),
    });
  }

  if (req.method === "POST") {
    const name = (req.body?.name as string) || "";
    const startDate = (req.body?.startDate as string) || "2026-07-01";
    const allowedActivityTypes = req.body?.allowedActivityTypes;
    if (!name) return res.status(400).json({ error: "name required" });
    if (!isValidActivityTypes(allowedActivityTypes)) {
      return res.status(400).json({ error: "invalid activity types" });
    }
    const stravaClientId = (req.body?.stravaClientId as string) || null;
    const stravaClientSecretRaw = (req.body?.stravaClientSecret as string) || null;
    const stravaClientSecret = stravaClientSecretRaw
      ? encrypt(stravaClientSecretRaw, getEnv("TOKEN_ENCRYPTION_KEY"))
      : null;

    const inviteToken = randomBytes(9).toString("base64url");
    const { data, error } = await db
      .from("fellowship")
      .insert({
        name, start_date: startDate, allowed_activity_types: allowedActivityTypes,
        invite_token: inviteToken, strava_client_id: stravaClientId, strava_client_secret: stravaClientSecret,
      })
      .select("id").single();
    if (error || !data) return res.status(500).json({ error: "could not create fellowship" });
    return res.status(201).json({ id: data.id, inviteToken });
  }

  if (req.method === "PATCH") {
    const id = req.body?.id as string | undefined;
    if (!id) return res.status(400).json({ error: "id required" });
    const update: Record<string, unknown> = {};
    if (typeof req.body?.name === "string") update.name = req.body.name;
    if (typeof req.body?.startDate === "string") update.start_date = req.body.startDate;
    if (req.body?.allowedActivityTypes !== undefined) {
      if (!isValidActivityTypes(req.body.allowedActivityTypes)) {
        return res.status(400).json({ error: "invalid activity types" });
      }
      update.allowed_activity_types = req.body.allowedActivityTypes;
    }
    if (typeof req.body?.stravaClientId === "string") update.strava_client_id = req.body.stravaClientId || null;
    if (typeof req.body?.stravaClientSecret === "string" && req.body.stravaClientSecret) {
      update.strava_client_secret = encrypt(req.body.stravaClientSecret, getEnv("TOKEN_ENCRYPTION_KEY"));
    }
    const { error } = await db.from("fellowship").update(update).eq("id", id);
    if (error) return res.status(500).json({ error: "could not update fellowship" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run api/admin/fellowships.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add api/admin/fellowships.ts api/admin/fellowships.test.ts
git commit -m "feat: admin fellowships endpoint (list/create/edit)"
```

---

### Task 7: Admin Members endpoint

**Files:**
- Create: `api/admin/members.ts`

**Interfaces:**
- Consumes: `requireAdminUserId` (`api/_lib/admin.ts`), `getServiceClient` (`api/_lib/supabase.ts`), `canRemoveMembership` (`shared/fellowship-sync.ts`).
- Produces: `GET/POST/DELETE /api/admin/members`. Task 15 (admin UI) calls this with the bodies in Step 1.

No new pure logic here beyond what Task 3 already tests (`canRemoveMembership`); this handler is DB glue in the same untested style as `api/me.ts`/`api/sync.ts`, verified manually per the spec's Testing section.

- [ ] **Step 1: Implement `api/admin/members.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "../_lib/supabase.js";
import { requireAdminUserId } from "../_lib/admin.js";
import { canRemoveMembership } from "../../shared/fellowship-sync.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getServiceClient();
  const adminId = await requireAdminUserId(req, db);
  if (!adminId) return res.status(403).json({ error: "forbidden" });

  if (req.method === "GET") {
    const { data: users } = await db.from("users").select("id, display_name");
    const { data: memberships } = await db
      .from("fellowship_members")
      .select("user_id, fellowship_id, fellowship:fellowship_id(id, name)");
    const byUser = new Map<string, { id: string; name: string }[]>();
    for (const m of memberships ?? []) {
      const f = m.fellowship as unknown as { id: string; name: string } | null;
      if (!f) continue;
      const list = byUser.get(m.user_id) ?? [];
      list.push({ id: f.id, name: f.name });
      byUser.set(m.user_id, list);
    }
    return res.status(200).json({
      users: (users ?? []).map((u) => ({
        id: u.id, displayName: u.display_name, fellowships: byUser.get(u.id) ?? [],
      })),
    });
  }

  if (req.method === "POST") {
    const userId = req.body?.userId as string | undefined;
    const fellowshipId = req.body?.fellowshipId as string | undefined;
    if (!userId || !fellowshipId) return res.status(400).json({ error: "userId and fellowshipId required" });
    const { error } = await db
      .from("fellowship_members")
      .upsert({ user_id: userId, fellowship_id: fellowshipId }, { onConflict: "user_id,fellowship_id", ignoreDuplicates: true });
    if (error) return res.status(500).json({ error: "could not add member" });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const userId = req.body?.userId as string | undefined;
    const fellowshipId = req.body?.fellowshipId as string | undefined;
    if (!userId || !fellowshipId) return res.status(400).json({ error: "userId and fellowshipId required" });
    const { count } = await db
      .from("fellowship_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (!canRemoveMembership(count ?? 0)) {
      return res.status(409).json({ error: "last_membership" });
    }
    const { error } = await db
      .from("fellowship_members").delete()
      .eq("user_id", userId).eq("fellowship_id", fellowshipId);
    if (error) return res.status(500).json({ error: "could not remove member" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
```

- [ ] **Step 2: Manually verify against a real Supabase project**

Using `curl` with an admin session cookie: `GET /api/admin/members` lists every user with their fellowships; `POST` adds a membership; `DELETE` on a user's only membership returns `409 {"error":"last_membership"}`; `DELETE` on one of two returns `200`.

- [ ] **Step 3: Commit**

```bash
git add api/admin/members.ts
git commit -m "feat: admin members endpoint (list/add/remove with last-membership guard)"
```

---

### Task 8: Per-Fellowship Strava app resolution on OAuth callback

**Files:**
- Modify: `api/auth/strava-callback.ts`

**Interfaces:**
- Consumes: `fellowship.strava_client_id`/`strava_client_secret` (nullable — Task 1), `users.strava_client_id`/`strava_client_secret` (nullable — Task 1), `fellowship_members` (Task 1).
- Produces: on every successful login, `users.strava_client_id`/`strava_client_secret` reflect whichever app (Fellowship-specific or the `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` env default) was actually used to authorize — `NULL` when it was the default app. Task 10 (`api/sync.ts`) and Task 9 (`api/invite.ts`) rely on this "NULL means default app" convention.

- [ ] **Step 1: Rewrite the handler**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { exchangeCode } from "../_lib/strava.js";
import { encrypt, decrypt } from "../_lib/crypto.js";
import { signSession } from "../_lib/session.js";
import { sessionCookie } from "../_lib/http.js";
import { getServiceClient } from "../_lib/supabase.js";
import { getEnv } from "../_lib/env.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string | undefined;
  const inviteToken = req.query.state as string | undefined;
  if (!code) return res.redirect("/?error=oauth");

  const db = getServiceClient();
  const key = getEnv("TOKEN_ENCRYPTION_KEY");

  // Resolve which Strava app to authenticate against: the fellowship behind
  // the invite link if it has one configured, otherwise the default app.
  let fellowshipId: string | null = null;
  let appClientId = getEnv("STRAVA_CLIENT_ID");
  let appClientSecret = getEnv("STRAVA_CLIENT_SECRET");
  let usingDefaultApp = true;
  if (inviteToken) {
    const { data: fellowship } = await db
      .from("fellowship").select("id, strava_client_id, strava_client_secret")
      .eq("invite_token", inviteToken).maybeSingle();
    if (fellowship) {
      fellowshipId = fellowship.id;
      if (fellowship.strava_client_id && fellowship.strava_client_secret) {
        appClientId = fellowship.strava_client_id;
        appClientSecret = decrypt(fellowship.strava_client_secret, key);
        usingDefaultApp = false;
      }
    }
  }

  let tokens: Awaited<ReturnType<typeof exchangeCode>>["tokens"];
  let athlete: Awaited<ReturnType<typeof exchangeCode>>["athlete"];
  try {
    ({ tokens, athlete } = await exchangeCode(code, { clientId: appClientId, clientSecret: appClientSecret }));
  } catch {
    return res.redirect("/?error=oauth");
  }

  const displayName = `${athlete.firstname} ${athlete.lastname}`.trim();
  const expiresIso = new Date(tokens.expiresAt * 1000).toISOString();
  const appFields = usingDefaultApp
    ? { strava_client_id: null, strava_client_secret: null }
    : { strava_client_id: appClientId, strava_client_secret: encrypt(appClientSecret, key) };

  const { data: existing } = await db
    .from("users").select("id").eq("strava_athlete_id", athlete.id).maybeSingle();

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db.from("users").update({
      display_name: displayName,
      avatar_url: athlete.profile,
      strava_access_token: encrypt(tokens.accessToken, key),
      strava_refresh_token: encrypt(tokens.refreshToken, key),
      token_expires_at: expiresIso,
      ...appFields,
    }).eq("id", userId);
  } else {
    if (!fellowshipId) return res.redirect("/join?error=invite");
    const { data: created, error } = await db.from("users").insert({
      strava_athlete_id: athlete.id,
      display_name: displayName,
      avatar_url: athlete.profile,
      strava_access_token: encrypt(tokens.accessToken, key),
      strava_refresh_token: encrypt(tokens.refreshToken, key),
      token_expires_at: expiresIso,
      ...appFields,
    }).select("id").single();
    if (error || !created) return res.redirect("/?error=signup");
    userId = created.id;
    await db.from("fellowship_members").insert({ user_id: userId, fellowship_id: fellowshipId });
  }

  const session = await signSession(userId, getEnv("SESSION_SECRET"));
  res.setHeader("Set-Cookie", sessionCookie(session));
  return res.redirect("/");
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `api/auth/strava-callback.ts`.

- [ ] **Step 3: Manually verify**

Against a real Supabase project + a test Strava app: click a Fellowship's invite link (Task 6's `POST` response `inviteToken`, built into a `/join?token=...` URL) with `strava_client_id`/`secret` set on that fellowship, authorize, and confirm the new `users` row has non-null `strava_client_id` matching that fellowship's. Then log in as an existing default-app user and confirm their row still has `strava_client_id: null`.

- [ ] **Step 4: Commit**

```bash
git add api/auth/strava-callback.ts
git commit -m "feat: resolve per-fellowship Strava app on OAuth callback"
```

---

### Task 9: Trim the invite endpoint

**Files:**
- Modify: `api/invite.ts`

**Interfaces:**
- Consumes: `fellowship.strava_client_id` (Task 1).
- Produces: `GET /api/invite?token=` now also returns `stravaClientId` (the fellowship's own, or `null` meaning "use the default app"). Task 12 (`src/api-client.ts`) and Task 13 (`Join.tsx`) consume this field. The `POST` handler is removed — Fellowship creation now goes through Task 6's admin endpoint.

- [ ] **Step 1: Rewrite `api/invite.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const db = getServiceClient();
  const token = req.query.token as string | undefined;
  if (!token) return res.status(400).json({ valid: false });
  const { data } = await db
    .from("fellowship").select("name, strava_client_id")
    .eq("invite_token", token).maybeSingle();
  return res.status(200).json({
    valid: !!data,
    fellowshipName: data?.name,
    stravaClientId: data?.strava_client_id ?? null,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `api/invite.ts` itself (Task 12 will fix the now-stale `api-client.ts` caller in the same pass).

- [ ] **Step 3: Commit**

```bash
git add api/invite.ts
git commit -m "feat: invite endpoint returns per-fellowship Strava client id, drop fellowship-create POST"
```

---

### Task 10: Multi-Fellowship sync rewrite

**Files:**
- Modify: `api/sync.ts`

**Interfaces:**
- Consumes: `memberTotal`, `earliestStartDate`, `unionActivityTypes`, `newActivitiesOnly`, `computeFellowshipTotals` (`shared/fellowship-sync.ts`); `fetchRunsSince(accessToken, afterEpoch, allowedTypes, fetchImpl?)` (Task 4); `Fellowship`, `FellowshipBadge` (Task 2).
- Produces: `SyncResponse` shape `{ importedCount, totalMiles, fellowshipMiles, newBadges: FellowshipBadge[] }` where `totalMiles`/`fellowshipMiles` are for the fellowship passed as `?fellowshipId=`. Task 12 (`api-client.ts`) types against this.

- [ ] **Step 1: Rewrite `api/sync.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readSessionUserId } from "./_lib/http.js";
import { getServiceClient } from "./_lib/supabase.js";
import { getEnv } from "./_lib/env.js";
import { decrypt, encrypt } from "./_lib/crypto.js";
import { refreshTokens, fetchRunsSince } from "./_lib/strava.js";
import {
  memberTotal, earliestStartDate, unionActivityTypes, newActivitiesOnly, computeFellowshipTotals,
} from "../shared/fellowship-sync.js";
import { crossedLandmarks } from "../shared/milestones.js";
import { ROUTE } from "../shared/route.js";
import type { Fellowship, RunActivity } from "../shared/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });
  const viewFellowshipId = req.query.fellowshipId as string | undefined;

  const db = getServiceClient();
  const key = getEnv("TOKEN_ENCRYPTION_KEY");

  const { data: user } = await db
    .from("users")
    .select("id, strava_access_token, strava_refresh_token, token_expires_at, strava_client_id, strava_client_secret")
    .eq("id", userId).single();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const { data: memberships } = await db
    .from("fellowship_members")
    .select("fellowship:fellowship_id(id, name, start_date, allowed_activity_types)")
    .eq("user_id", userId);
  const fellowships: (Fellowship & { name: string })[] = (memberships ?? [])
    .map((m) => m.fellowship as unknown as { id: string; name: string; start_date: string; allowed_activity_types: string[] } | null)
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ id: f.id, name: f.name, startDate: f.start_date, allowedActivityTypes: f.allowed_activity_types }));
  if (fellowships.length === 0) return res.status(500).json({ error: "no fellowship membership" });

  const appClientId = user.strava_client_id ?? getEnv("STRAVA_CLIENT_ID");
  const appClientSecret = user.strava_client_secret
    ? decrypt(user.strava_client_secret, key)
    : getEnv("STRAVA_CLIENT_SECRET");

  let accessToken = decrypt(user.strava_access_token, key);
  const expiresMs = new Date(user.token_expires_at).getTime();
  if (Date.now() >= expiresMs - 60_000) {
    try {
      const refreshed = await refreshTokens(decrypt(user.strava_refresh_token, key), {
        clientId: appClientId, clientSecret: appClientSecret,
      });
      accessToken = refreshed.accessToken;
      await db.from("users").update({
        strava_access_token: encrypt(refreshed.accessToken, key),
        strava_refresh_token: encrypt(refreshed.refreshToken, key),
        token_expires_at: new Date(refreshed.expiresAt * 1000).toISOString(),
      }).eq("id", userId);
    } catch {
      return res.status(409).json({ error: "reconnect" });
    }
  }

  const afterEpoch = Math.floor(new Date(earliestStartDate(fellowships)).getTime() / 1000);
  const allowedTypes = new Set(unionActivityTypes(fellowships));
  let fetched;
  try {
    fetched = await fetchRunsSince(accessToken, afterEpoch, allowedTypes);
  } catch (e) {
    if (e instanceof Error && e.message.includes("rate limit")) return res.status(429).json({ error: "rate_limited" });
    return res.status(502).json({ error: "strava_unavailable" });
  }

  const { data: existingRows } = await db.from("activities").select("strava_activity_id").eq("user_id", userId);
  const existingIds = (existingRows ?? []).map((a: { strava_activity_id: number }) => a.strava_activity_id);
  const newActivities = newActivitiesOnly(fetched, existingIds);

  if (newActivities.length > 0) {
    await db.from("activities").insert(
      newActivities.map((a) => ({
        user_id: userId,
        strava_activity_id: a.stravaActivityId,
        distance_miles: a.distanceMiles,
        run_date: a.runDate,
        name: a.name,
        moving_seconds: a.movingSeconds ?? null,
        sport_type: a.sportType,
      }))
    );
  }

  // Backfill duration on already-imported runs (parity with the old behavior).
  const existingSet = new Set(existingIds);
  for (const a of fetched) {
    if (existingSet.has(a.stravaActivityId) && a.movingSeconds != null) {
      await db.from("activities").update({ moving_seconds: a.movingSeconds })
        .eq("user_id", userId).eq("strava_activity_id", a.stravaActivityId);
    }
  }

  const { data: allActivityRows } = await db
    .from("activities").select("strava_activity_id, distance_miles, run_date, sport_type").eq("user_id", userId);
  const activitiesAfter: RunActivity[] = (allActivityRows ?? []).map((a) => ({
    stravaActivityId: a.strava_activity_id, distanceMiles: a.distance_miles,
    runDate: a.run_date, name: "", sportType: a.sport_type,
  }));
  const addedIds = new Set(newActivities.map((a) => a.stravaActivityId));
  const activitiesBefore = activitiesAfter.filter((a) => !addedIds.has(a.stravaActivityId));

  const perFellowship = computeFellowshipTotals(fellowships, activitiesBefore, activitiesAfter, ROUTE);

  const newBadges: { fellowshipId: string; fellowshipName: string; milestone: (typeof perFellowship)[number]["crossed"][number] }[] = [];
  let responseTotalMiles = 0;
  let responseFellowshipMiles = 0;

  for (const result of perFellowship) {
    const fellowship = fellowships.find((f) => f.id === result.fellowshipId)!;
    if (fellowship.id === viewFellowshipId) responseTotalMiles = result.newTotalMiles;

    for (const m of result.crossed) {
      await db.from("milestone_awards").upsert(
        { scope: "user", user_id: userId, fellowship_id: fellowship.id, landmark_id: m.landmarkId },
        { onConflict: "scope,user_id,fellowship_id,landmark_id", ignoreDuplicates: true }
      );
      newBadges.push({ fellowshipId: fellowship.id, fellowshipName: fellowship.name, milestone: m });
    }

    // Fellowship-wide pooled total and crossings.
    const { data: fellowshipMembers } = await db.from("fellowship_members").select("user_id").eq("fellowship_id", fellowship.id);
    const memberIds = (fellowshipMembers ?? []).map((m: { user_id: string }) => m.user_id);
    const { data: memberActivities } = await db
      .from("activities").select("user_id, distance_miles, run_date, sport_type").in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
    const allMemberActivities: RunActivity[] = (memberActivities ?? []).map((a) => ({
      stravaActivityId: 0, distanceMiles: a.distance_miles, runDate: a.run_date, name: "", sportType: a.sport_type,
    }));
    const pooledAfter = memberTotal(allMemberActivities, fellowship);
    // The syncing user is always a member of every fellowship in this loop
    // (fellowships came from their own memberships), and this endpoint only
    // ever adds activities for that one user — so "before" is the pooled
    // total minus whatever this sync added that counts toward THIS
    // fellowship specifically (memberTotal applies this fellowship's own
    // type/date filter — newActivities can include types/dates that belong
    // to a different fellowship the user is also in).
    const addedPooled = memberTotal(newActivities, fellowship);
    const pooledBefore = pooledAfter - addedPooled;
    if (fellowship.id === viewFellowshipId) responseFellowshipMiles = pooledAfter;

    for (const m of crossedLandmarks(pooledBefore, pooledAfter, ROUTE)) {
      const { data: existingAward } = await db
        .from("milestone_awards").select("id")
        .eq("scope", "fellowship").eq("fellowship_id", fellowship.id).eq("landmark_id", m.landmarkId).maybeSingle();
      if (!existingAward) {
        await db.from("milestone_awards").insert({ scope: "fellowship", user_id: null, fellowship_id: fellowship.id, landmark_id: m.landmarkId });
        newBadges.push({ fellowshipId: fellowship.id, fellowshipName: fellowship.name, milestone: m });
      }
    }
  }

  return res.status(200).json({
    importedCount: newActivities.length,
    totalMiles: responseTotalMiles,
    fellowshipMiles: responseFellowshipMiles,
    newBadges,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify against a real Supabase project**

A user in two fellowships with different start dates: run `POST /api/sync?fellowshipId=<f1>`, confirm `totalMiles`/`fellowshipMiles` reflect fellowship 1's window, and `newBadges` includes crossings tagged with the correct fellowship name for both fellowships if both were crossed.

- [ ] **Step 4: Commit**

```bash
git add api/sync.ts
git commit -m "feat: multi-fellowship sync — per-fellowship mileage, activity types, and milestones"
```

---

### Task 11: `/api/me` — fellowship selection and Global view

**Files:**
- Modify: `api/me.ts`

**Interfaces:**
- Consumes: `memberTotal` (`shared/fellowship-sync.ts`), `Fellowship` (`shared/types.ts`).
- Produces: `GET /api/me?fellowshipId=&view=fellowship|global`. Fellowship-view response gains `isAdmin: boolean` and `fellowships: {id,name}[]`; `user.totalMiles`/every `members[].totalMiles` are now live per-Fellowship sums. Global-view response is `{ user, isAdmin, fellowships, global: true, ghosts: [{ userId, fellowshipId, fellowshipName, displayName, chosenCharacter, color, totalMiles }] }`. Task 12 (`api-client.ts`) types both shapes.

- [ ] **Step 1: Rewrite `api/me.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";
import { readSessionUserId } from "./_lib/http.js";
import { memberTotal } from "../shared/fellowship-sync.js";
import type { Fellowship, RunActivity } from "../shared/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const db = getServiceClient();
  const { data: user } = await db
    .from("users")
    .select("id, display_name, avatar_url, chosen_character, color, is_admin, opened_quests, notified_achievements")
    .eq("id", userId).maybeSingle();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const { data: memberships } = await db
    .from("fellowship_members")
    .select("joined_at, fellowship:fellowship_id(id, name, start_date, allowed_activity_types)")
    .eq("user_id", userId).order("joined_at", { ascending: true });
  const myFellowships: Fellowship[] = (memberships ?? [])
    .map((m) => m.fellowship as unknown as { id: string; name: string; start_date: string; allowed_activity_types: string[] } | null)
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ id: f.id, name: f.name, startDate: f.start_date, allowedActivityTypes: f.allowed_activity_types }));
  if (myFellowships.length === 0) return res.status(500).json({ error: "no fellowship membership" });
  const fellowshipsSummary = myFellowships.map((f) => ({ id: f.id, name: f.name }));

  const view = req.query.view as string | undefined;

  if (view === "global") {
    const { data: allMemberships } = await db
      .from("fellowship_members")
      .select("user_id, fellowship:fellowship_id(id, name, start_date, allowed_activity_types)");
    const { data: allUsers } = await db.from("users").select("id, display_name, chosen_character, color");
    const usersById = new Map((allUsers ?? []).map((u) => [u.id, u]));

    const ghosts: { userId: string; fellowshipId: string; fellowshipName: string; displayName: string; chosenCharacter: string | null; color: string | null; totalMiles: number }[] = [];
    for (const m of allMemberships ?? []) {
      const f = m.fellowship as unknown as { id: string; name: string; start_date: string; allowed_activity_types: string[] } | null;
      const u = usersById.get(m.user_id);
      if (!f || !u) continue;
      const fellowship: Fellowship = { id: f.id, name: f.name, startDate: f.start_date, allowedActivityTypes: f.allowed_activity_types };
      const { data: acts } = await db.from("activities").select("distance_miles, run_date, sport_type").eq("user_id", u.id);
      const activities: RunActivity[] = (acts ?? []).map((a) => ({
        stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0, runDate: a.run_date, name: "", sportType: a.sport_type,
      }));
      ghosts.push({
        userId: u.id, fellowshipId: f.id, fellowshipName: f.name,
        displayName: u.display_name, chosenCharacter: u.chosen_character, color: u.color,
        totalMiles: memberTotal(activities, fellowship),
      });
    }
    return res.status(200).json({
      user: { id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url, chosenCharacter: user.chosen_character, color: user.color },
      isAdmin: user.is_admin, fellowships: fellowshipsSummary, global: true, ghosts,
    });
  }

  const requestedId = req.query.fellowshipId as string | undefined;
  const fellowship = myFellowships.find((f) => f.id === requestedId) ?? myFellowships[0];

  const { data: memberRows } = await db.from("fellowship_members").select("user_id").eq("fellowship_id", fellowship.id);
  const memberIds = (memberRows ?? []).map((m: { user_id: string }) => m.user_id);
  const { data: members } = await db
    .from("users").select("id, display_name, chosen_character, color, opened_quests")
    .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: acts } = await db
    .from("activities").select("user_id, distance_miles, moving_seconds, run_date, name, sport_type")
    .in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
  const activitiesByUser = new Map<string, RunActivity[]>();
  const rawByUser = new Map<string, { name: string; date: string }[]>();
  const secByUser = new Map<string, { runs: number; longest: number; sec: number; secDist: number; weeks: Set<number> }>();
  for (const a of acts ?? []) {
    const list = activitiesByUser.get(a.user_id) ?? [];
    list.push({ stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0, runDate: a.run_date, name: a.name ?? "", sportType: a.sport_type });
    activitiesByUser.set(a.user_id, list);

    const s = secByUser.get(a.user_id) ?? { runs: 0, longest: 0, sec: 0, secDist: 0, weeks: new Set<number>() };
    const d = a.distance_miles ?? 0;
    s.runs++; s.longest = Math.max(s.longest, d);
    if (a.moving_seconds != null) { s.sec += a.moving_seconds; s.secDist += d; }
    const t = a.run_date ? new Date(a.run_date).getTime() : NaN;
    if (!isNaN(t)) s.weeks.add(Math.floor(t / (7 * 86400000)));
    secByUser.set(a.user_id, s);

    const rawList = rawByUser.get(a.user_id) ?? [];
    rawList.push({ name: a.name ?? "Untitled run", date: a.run_date });
    rawByUser.set(a.user_id, rawList);
  }
  const maxWeekStreak = (weeks: Set<number>): number => {
    const arr = [...weeks].sort((a, b) => a - b);
    let best = 0, cur = 0, prev: number | null = null;
    for (const w of arr) { cur = prev !== null && w === prev + 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = w; }
    return best;
  };

  const memberList = (members ?? []).map((m) => {
    const memberActivities = activitiesByUser.get(m.id) ?? [];
    const totalMiles = memberTotal(memberActivities, fellowship);
    const s = secByUser.get(m.id);
    return {
      id: m.id, displayName: m.display_name, chosenCharacter: m.chosen_character, color: m.color,
      totalMiles,
      openedQuests: Array.isArray(m.opened_quests) ? m.opened_quests : [],
      stats: {
        runs: s?.runs ?? 0, longestMiles: s?.longest ?? 0,
        avgMiles: s && s.runs ? memberActivities.reduce((sum, a) => sum + a.distanceMiles, 0) / s.runs : 0,
        avgPaceSecPerMile: s && s.secDist > 0 ? s.sec / s.secDist : null,
        weekStreak: s ? maxWeekStreak(s.weeks) : 0,
      },
      activities: (rawByUser.get(m.id) ?? []).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    };
  });
  const fellowshipMiles = memberList.reduce((s, m) => s + m.totalMiles, 0);
  const me = memberList.find((m) => m.id === user.id);

  return res.status(200).json({
    user: {
      id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url,
      chosenCharacter: user.chosen_character, color: user.color, totalMiles: me?.totalMiles ?? 0,
    },
    isAdmin: user.is_admin,
    fellowships: fellowshipsSummary,
    fellowship: { id: fellowship.id, name: fellowship.name },
    members: memberList,
    fellowshipMiles,
    openedQuests: Array.isArray(user.opened_quests) ? user.opened_quests : [],
    notifiedAchievements: Array.isArray(user.notified_achievements) ? user.notified_achievements : [],
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `api/me.ts`.

- [ ] **Step 3: Manually verify**

`GET /api/me` (no params) defaults to the earliest-joined fellowship; `GET /api/me?fellowshipId=<other>` switches; `GET /api/me?view=global` returns one ghost entry per fellowship membership across every user.

- [ ] **Step 4: Commit**

```bash
git add api/me.ts
git commit -m "feat: /api/me supports fellowship selection and global ghost view"
```

---

### Task 12: Frontend API client — new types and admin methods

**Files:**
- Modify: `src/api-client.ts`

**Interfaces:**
- Consumes: nothing new (mirrors Task 11's response shapes).
- Produces: `MeResponse` (+`isAdmin`, `+fellowships`, `+fellowship.startDate`? no — kept as `{id,name}` per Task 11), `GlobalResponse`, `Ghost`, `SyncResponse.newBadges: FellowshipBadge[]`, `stravaAuthUrl(clientId: string | null, inviteToken?: string)`, `api.me(fellowshipId?, view?)`, `api.sync(fellowshipId)`, and the six admin methods. Tasks 13, 14, 15, 16, 17 all import from this file.

- [ ] **Step 1: Rewrite `src/api-client.ts`**

```ts
import type { CharacterKey, FellowshipBadge } from "../shared/types";

export interface RunStats {
  runs: number;
  longestMiles: number;
  avgMiles: number;
  avgPaceSecPerMile: number | null;
  weekStreak: number;
}
export interface RecentActivity {
  name: string;
  date: string;
}
export interface Member {
  id: string;
  displayName: string;
  chosenCharacter: CharacterKey | null;
  color: string | null;
  totalMiles: number;
  openedQuests: string[];
  stats: RunStats;
  activities: RecentActivity[];
}
export interface FellowshipSummary {
  id: string;
  name: string;
}
export interface MeResponse {
  user: { id: string; displayName: string; avatarUrl: string | null; chosenCharacter: CharacterKey | null; color: string | null; totalMiles: number };
  isAdmin: boolean;
  fellowships: FellowshipSummary[];
  fellowship: FellowshipSummary;
  members: Member[];
  fellowshipMiles: number;
  openedQuests: string[];
  notifiedAchievements: string[];
}
export interface Ghost {
  userId: string;
  fellowshipId: string;
  fellowshipName: string;
  displayName: string;
  chosenCharacter: CharacterKey | null;
  color: string | null;
  totalMiles: number;
}
export interface GlobalResponse {
  user: MeResponse["user"];
  isAdmin: boolean;
  fellowships: FellowshipSummary[];
  global: true;
  ghosts: Ghost[];
}
export interface SyncResponse {
  importedCount: number;
  totalMiles: number;
  fellowshipMiles: number;
  newBadges: FellowshipBadge[];
}
export interface AdminFellowship {
  id: string;
  name: string;
  startDate: string;
  allowedActivityTypes: string[];
  inviteToken: string;
  hasCustomStravaApp: boolean;
  memberCount: number;
}
export interface AdminUser {
  id: string;
  displayName: string;
  fellowships: FellowshipSummary[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export function stravaAuthUrl(clientId?: string | null, inviteToken?: string): string {
  const params = new URLSearchParams({
    client_id: clientId ?? import.meta.env.VITE_STRAVA_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_STRAVA_REDIRECT_URI,
    response_type: "code",
    scope: "activity:read",
    approval_prompt: "auto",
  });
  if (inviteToken) params.set("state", inviteToken);
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export const api = {
  me: (fellowshipId?: string) =>
    fetch(`/api/me${fellowshipId ? `?fellowshipId=${encodeURIComponent(fellowshipId)}` : ""}`, { credentials: "include" })
      .then((r) => (r.status === 401 ? null : json<MeResponse>(r))),
  meGlobal: () =>
    fetch("/api/me?view=global", { credentials: "include" }).then((r) => (r.status === 401 ? null : json<GlobalResponse>(r))),
  sync: (fellowshipId: string) =>
    fetch(`/api/sync?fellowshipId=${encodeURIComponent(fellowshipId)}`, { method: "POST", credentials: "include" }).then(json<SyncResponse>),
  questOpen: (questId: string) =>
    fetch("/api/quest-open", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId }),
    }).then(json<{ openedQuests: string[] }>),
  achievementsSeen: (ids: string[]) =>
    fetch("/api/achievements-seen", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then(json<{ notifiedAchievements: string[] }>),
  chooseCharacter: (character: CharacterKey, color: string) =>
    fetch("/api/character", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character, color }),
    }).then(json<{ ok: true }>),
  checkInvite: (token: string) =>
    fetch(`/api/invite?token=${encodeURIComponent(token)}`).then(json<{ valid: boolean; fellowshipName?: string; stravaClientId: string | null }>),
  logout: () => fetch("/api/auth/logout", { method: "POST", credentials: "include" }),

  adminListFellowships: () => fetch("/api/admin/fellowships", { credentials: "include" }).then(json<{ fellowships: AdminFellowship[] }>),
  adminCreateFellowship: (body: { name: string; startDate: string; allowedActivityTypes: string[]; stravaClientId?: string; stravaClientSecret?: string }) =>
    fetch("/api/admin/fellowships", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(json<{ id: string; inviteToken: string }>),
  adminUpdateFellowship: (body: { id: string; name?: string; startDate?: string; allowedActivityTypes?: string[]; stravaClientId?: string; stravaClientSecret?: string }) =>
    fetch("/api/admin/fellowships", {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(json<{ ok: true }>),
  adminListMembers: () => fetch("/api/admin/members", { credentials: "include" }).then(json<{ users: AdminUser[] }>),
  adminAddMember: (userId: string, fellowshipId: string) =>
    fetch("/api/admin/members", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, fellowshipId }),
    }).then(json<{ ok: true }>),
  adminRemoveMember: (userId: string, fellowshipId: string) =>
    fetch("/api/admin/members", {
      method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, fellowshipId }),
    }).then(json<{ ok: true }>),
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: errors remaining only in files not yet updated (`Join.tsx`, `CelebrationModal.tsx`, `Dashboard.tsx`, `StatsPanel.tsx`, `MapView.tsx`, `useSession.ts`) — fixed in Tasks 13–17.

- [ ] **Step 3: Commit**

```bash
git add src/api-client.ts
git commit -m "feat: api-client types and methods for multi-fellowship + admin"
```

---

### Task 13: Join page uses the resolved per-Fellowship Strava client id

**Files:**
- Modify: `src/pages/Join.tsx`

**Interfaces:**
- Consumes: `api.checkInvite` (Task 12, now returns `stravaClientId`), `stravaAuthUrl(clientId, inviteToken?)` (Task 12).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Update `Join.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api, stravaAuthUrl } from "../api-client";
import { LoadingRing } from "../components/LoadingRing";

export default function Join() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [state, setState] = useState<{ valid: boolean; name?: string; stravaClientId?: string | null } | null>(null);

  useEffect(() => {
    if (!token) { setState({ valid: false }); return; }
    api.checkInvite(token).then((r) => setState({ valid: r.valid, name: r.fellowshipName, stravaClientId: r.stravaClientId }));
  }, [token]);

  if (!state) return <LoadingRing label="Checking your invite…" />;
  if (!state.valid) return <div className="centered"><h1>Invalid invite</h1><p>Ask your friend for a fresh link.</p></div>;

  return (
    <div className="centered">
      <h1>Join {state.name}</h1>
      <p>Connect Strava to join the fellowship.</p>
      <a className="sync-btn" href={stravaAuthUrl(state.stravaClientId ?? null, token)}>Join with Strava</a>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors in `src/pages/Join.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Join.tsx
git commit -m "feat: join page authorizes against the fellowship's own Strava app"
```

---

### Task 14: Celebration modal shows which Fellowship a badge belongs to

**Files:**
- Modify: `src/components/CelebrationModal.tsx`
- Modify: `src/components/CelebrationModal.test.tsx`

**Interfaces:**
- Consumes: `FellowshipBadge` (`shared/types.ts`, Task 2).
- Produces: `CelebrationModal({ badges: FellowshipBadge[], onClose })`. Task 17 (`Dashboard.tsx`) passes `SyncResponse.newBadges` straight through.

- [ ] **Step 1: Update the test**

```tsx
// src/components/CelebrationModal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CelebrationModal } from "./CelebrationModal";
import type { FellowshipBadge } from "../../shared/types";

const badges: FellowshipBadge[] = [
  { fellowshipId: "f1", fellowshipName: "Trail Blazers", milestone: { landmarkId: "rivendell", name: "Rivendell", message: "You have reached Rivendell!", lore: "A hidden valley.", cumulativeMiles: 458 } },
  { fellowshipId: "f1", fellowshipName: "Trail Blazers", milestone: { landmarkId: "moria", name: "Moria", message: "You crossed Moria!", lore: "A dark mine.", cumulativeMiles: 800 } },
];

describe("CelebrationModal", () => {
  it("renders nothing with no badges", () => {
    const { container } = render(<CelebrationModal badges={[]} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("advances through badges, labeled with their fellowship, then closes", () => {
    const onClose = vi.fn();
    render(<CelebrationModal badges={badges} onClose={onClose} />);
    expect(screen.getByText("Rivendell")).toBeInTheDocument();
    expect(screen.getByText("Trail Blazers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText("Moria")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/components/CelebrationModal.test.tsx`
Expected: FAIL — `getByText("Trail Blazers")` not found.

- [ ] **Step 3: Update `CelebrationModal.tsx`**

```tsx
import { useState } from "react";
import type { FellowshipBadge } from "../../shared/types";

export function CelebrationModal({ badges, onClose }: {
  badges: FellowshipBadge[]; onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  if (badges.length === 0) return null;
  const { milestone: badge, fellowshipName } = badges[index];

  const advance = () => {
    if (index + 1 < badges.length) setIndex(index + 1);
    else onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal pixel-frame">
        <img
          className="badge-scene"
          data-landmark={badge.landmarkId}
          src={`/scenes/${badge.landmarkId}.png`}
          alt={badge.name}
          style={{
            width: "100%", maxHeight: 220, objectFit: "cover", imageRendering: "pixelated",
            borderRadius: 4, marginBottom: 12, display: "block",
          }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <div className="badge-fellowship">{fellowshipName}</div>
        <h2>{badge.name}</h2>
        <div className="badge-mi">Reached at {badge.cumulativeMiles} mi</div>
        <p className="message">{badge.message}</p>
        <p className="lore">{badge.lore}</p>
        <button onClick={advance}>Continue</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/components/CelebrationModal.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/CelebrationModal.tsx src/components/CelebrationModal.test.tsx
git commit -m "feat: celebration modal labels each badge with its fellowship"
```

---

### Task 15: Admin screen — Fellowships and Members panels

**Files:**
- Create: `src/pages/Admin.tsx`
- Create: `src/components/AdminFellowshipsPanel.tsx`
- Create: `src/components/AdminMembersPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `api.adminListFellowships/adminCreateFellowship/adminUpdateFellowship/adminListMembers/adminAddMember/adminRemoveMember` (Task 12), `ACTIVITY_TYPES` (Task 2), `MeResponse.isAdmin` (Task 11).
- Produces: `/admin` route. Nothing later depends on this task.

- [ ] **Step 1: Create the Fellowships panel**

```tsx
// src/components/AdminFellowshipsPanel.tsx
import { useEffect, useState } from "react";
import { api, type AdminFellowship } from "../api-client";
import { ACTIVITY_TYPES } from "../../shared/activity-types";

const DEFAULT_TYPES = ["Run", "TrailRun", "VirtualRun", "Walk", "Hike"];

export function AdminFellowshipsPanel() {
  const [fellowships, setFellowships] = useState<AdminFellowship[]>([]);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("2026-07-01");
  const [types, setTypes] = useState<string[]>(DEFAULT_TYPES);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.adminListFellowships().then((r) => setFellowships(r.fellowships));
  useEffect(() => { load(); }, []);

  const toggleType = (key: string) =>
    setTypes((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));

  const create = async () => {
    if (!name || types.length === 0) return;
    setSaving(true);
    try {
      await api.adminCreateFellowship({
        name, startDate, allowedActivityTypes: types,
        stravaClientId: clientId || undefined, stravaClientSecret: clientSecret || undefined,
      });
      setName(""); setClientId(""); setClientSecret(""); setTypes(DEFAULT_TYPES);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-panel">
      <h2>Fellowships</h2>
      <ul className="admin-list">
        {fellowships.map((f) => (
          <li key={f.id} className="admin-list-row">
            <strong>{f.name}</strong> — {f.memberCount} member{f.memberCount === 1 ? "" : "s"}, starts {f.startDate}
            <div className="admin-list-sub">{f.allowedActivityTypes.join(", ")} {f.hasCustomStravaApp ? "· dedicated Strava app" : "· default Strava app"}</div>
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join?token=${f.inviteToken}`)}
            >
              Copy invite link
            </button>
          </li>
        ))}
      </ul>

      <h3>Create a Fellowship</h3>
      <div className="admin-form">
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Start date <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <div className="admin-type-checklist">
          {ACTIVITY_TYPES.map((t) => (
            <label key={t.key}>
              <input type="checkbox" checked={types.includes(t.key)} onChange={() => toggleType(t.key)} />
              {t.label}
            </label>
          ))}
        </div>
        <label>Strava client ID (optional — blank uses the default app)
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </label>
        <label>Strava client secret (optional)
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" />
        </label>
        <button onClick={create} disabled={saving || !name || types.length === 0}>Create Fellowship</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the Members panel**

```tsx
// src/components/AdminMembersPanel.tsx
import { useEffect, useState } from "react";
import { api, type AdminUser, type AdminFellowship } from "../api-client";

export function AdminMembersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [fellowships, setFellowships] = useState<AdminFellowship[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([api.adminListMembers(), api.adminListFellowships()])
      .then(([u, f]) => { setUsers(u.users); setFellowships(f.fellowships); });
  useEffect(() => { load(); }, []);

  const toggle = async (userId: string, fellowshipId: string, isMember: boolean) => {
    setError(null);
    try {
      if (isMember) await api.adminRemoveMember(userId, fellowshipId);
      else await api.adminAddMember(userId, fellowshipId);
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message === "409" ? "Can't remove someone's last fellowship." : "Something went wrong.");
    }
  };

  return (
    <div className="admin-panel">
      <h2>Members</h2>
      {error && <p className="admin-error">{error}</p>}
      <table className="admin-table">
        <thead>
          <tr><th>Name</th>{fellowships.map((f) => <th key={f.id}>{f.name}</th>)}</tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.displayName}</td>
              {fellowships.map((f) => {
                const isMember = u.fellowships.some((uf) => uf.id === f.id);
                return (
                  <td key={f.id}>
                    <input type="checkbox" checked={isMember} onChange={() => toggle(u.id, f.id, isMember)} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create the Admin page**

```tsx
// src/pages/Admin.tsx
import { Navigate } from "react-router-dom";
import type { MeResponse } from "../api-client";
import { AdminFellowshipsPanel } from "../components/AdminFellowshipsPanel";
import { AdminMembersPanel } from "../components/AdminMembersPanel";

export default function Admin({ me }: { me: MeResponse }) {
  if (!me.isAdmin) return <Navigate to="/" replace />;
  return (
    <div className="admin-page">
      <h1>Admin</h1>
      <AdminFellowshipsPanel />
      <AdminMembersPanel />
    </div>
  );
}
```

- [ ] **Step 4: Wire the route into `App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSession } from "./useSession";
import Login from "./pages/Login";
import Join from "./pages/Join";
import CharacterSelect from "./pages/CharacterSelect";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import { LoadingRing } from "./components/LoadingRing";

function Home() {
  const { data, loading, refresh } = useSession();
  if (loading) return <LoadingRing label="Summoning the Fellowship…" />;
  if (!data) return <Navigate to="/login" replace />;
  if (!data.user.chosenCharacter) return <CharacterSelect onChosen={refresh} />;
  return <Dashboard me={data} refresh={refresh} />;
}

function AdminRoute() {
  const { data, loading } = useSession();
  if (loading) return <LoadingRing label="Summoning the Fellowship…" />;
  if (!data) return <Navigate to="/login" replace />;
  return <Admin me={data} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/join" element={<Join />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Add minimal admin styling to `src/styles.css`**

Append:

```css
.admin-page { max-width: 720px; margin: 0 auto; padding: 24px 16px 60px; font-family: Georgia, serif; color: #f0e2c0; background: #14100a; min-height: 100vh; }
.admin-page h1 { color: #e8c96a; }
.admin-panel { background: #1d1710; border: 1px solid #4a3a26; border-radius: 8px; padding: 16px; margin-top: 20px; }
.admin-list { list-style: none; padding: 0; margin: 0 0 12px; }
.admin-list-row { padding: 8px 0; border-bottom: 1px solid #3a2e1e; }
.admin-list-sub { opacity: 0.7; font-size: 13px; margin: 2px 0 6px; }
.admin-form { display: flex; flex-direction: column; gap: 10px; max-width: 420px; }
.admin-form label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.admin-type-checklist { display: flex; flex-wrap: wrap; gap: 10px; font-size: 14px; }
.admin-type-checklist label { flex-direction: row; align-items: center; gap: 4px; }
.admin-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.admin-table th, .admin-table td { padding: 6px 8px; text-align: center; border-bottom: 1px solid #3a2e1e; }
.admin-table th:first-child, .admin-table td:first-child { text-align: left; }
.admin-error { color: #e57373; }
```

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc -b --noEmit && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 7: Manual verification**

Run `npm run dev`, sign in as the admin user, visit `/admin`: create a Fellowship, copy its invite link, toggle a member's checkbox on/off, confirm the last-membership guard shows the error message.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Admin.tsx src/components/AdminFellowshipsPanel.tsx src/components/AdminMembersPanel.tsx src/App.tsx src/styles.css
git commit -m "feat: admin screen for managing fellowships and membership"
```

---

### Task 16: Fellowship switcher and session wiring

**Files:**
- Create: `src/components/FellowshipSwitcher.tsx`
- Modify: `src/useSession.ts`
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `api.me(fellowshipId?)`, `api.meGlobal()`, `api.sync(fellowshipId)` (Task 12).
- Produces: `useSession()` now returns `{ data, loading, refresh, fellowshipId, setFellowshipId, view, setView }`. Task 17 (`MapView`/`StatsPanel`) consumes `view`/`data` from `Dashboard`.

- [ ] **Step 1: Update `useSession.ts` to track fellowship selection and view**

```ts
import { useCallback, useEffect, useState } from "react";
import { api, type MeResponse, type GlobalResponse } from "./api-client";

export type DashboardView = "fellowship" | "global";

export function useSession() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [globalData, setGlobalData] = useState<GlobalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fellowshipId, setFellowshipId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<DashboardView>("fellowship");

  const load = useCallback((initial: boolean) => {
    if (initial) setLoading(true);
    const request = view === "global" ? api.meGlobal().then((d) => { setGlobalData(d); return null; }) : api.me(fellowshipId).then((d) => { setData(d); if (d && !fellowshipId) setFellowshipId(d.fellowship.id); return d; });
    request.catch(() => { setData(null); setGlobalData(null); }).finally(() => { if (initial) setLoading(false); });
  }, [fellowshipId, view]);

  useEffect(() => { load(true); }, [load]);

  const refresh = useCallback(() => load(false), [load]);
  return { data, globalData, loading, refresh, fellowshipId, setFellowshipId, view, setView };
}
```

- [ ] **Step 2: Create the switcher component**

```tsx
// src/components/FellowshipSwitcher.tsx
import type { FellowshipSummary } from "../api-client";
import type { DashboardView } from "../useSession";

export function FellowshipSwitcher({
  fellowships, fellowshipId, view, onSelect, onGlobal,
}: {
  fellowships: FellowshipSummary[];
  fellowshipId: string | undefined;
  view: DashboardView;
  onSelect: (id: string) => void;
  onGlobal: () => void;
}) {
  if (fellowships.length <= 1) return null;
  return (
    <div className="fellowship-switcher">
      {fellowships.map((f) => (
        <button
          key={f.id}
          className={view === "fellowship" && fellowshipId === f.id ? "active" : ""}
          onClick={() => onSelect(f.id)}
        >
          {f.name}
        </button>
      ))}
      <button className={view === "global" ? "active" : ""} onClick={onGlobal}>Global</button>
    </div>
  );
}
```

Append to `src/styles.css`:

```css
.fellowship-switcher { position: absolute; top: 12px; left: 12px; z-index: 1000; display: flex; gap: 6px; flex-wrap: wrap; }
.fellowship-switcher button { background: #1d1710; color: #f0e2c0; border: 1px solid #4a3a26; border-radius: 6px; padding: 4px 10px; font-family: Georgia, serif; font-size: 13px; cursor: pointer; }
.fellowship-switcher button.active { background: #c0392b; border-color: #c0392b; color: #fff; }
```

- [ ] **Step 3: Wire the switcher into `Dashboard.tsx`**

Change the `Dashboard` signature and top of the component:

```tsx
export default function Dashboard({
  me, refresh, globalData, fellowshipId, setFellowshipId, view, setView,
}: {
  me: MeResponse | null;
  refresh: () => void;
  globalData: GlobalResponse | null;
  fellowshipId: string | undefined;
  setFellowshipId: (id: string) => void;
  view: DashboardView;
  setView: (v: DashboardView) => void;
}) {
```

Add the import and render the switcher plus a `Global` branch at the top of the returned JSX, right before `<MapView`:

```tsx
import { FellowshipSwitcher } from "../components/FellowshipSwitcher";
import type { GlobalResponse } from "../api-client";
import type { DashboardView } from "../useSession";
```

```tsx
<FellowshipSwitcher
  fellowships={(view === "global" ? globalData?.fellowships : me?.fellowships) ?? []}
  fellowshipId={fellowshipId}
  view={view}
  onSelect={(id) => { setFellowshipId(id); setView("fellowship"); }}
  onGlobal={() => setView("global")}
/>
```

The `onSync` handler now passes the current fellowship:

```tsx
const onSync = async () => {
  if (!fellowshipId) return;
  setSyncing(true);
  try {
    const res = await api.sync(fellowshipId);
    if (res.newBadges.length) setBadges(res.newBadges);
    refresh();
  } catch (e) {
    if (e instanceof Error && e.message === "409") alert("Please reconnect Strava.");
    else if (e instanceof Error && e.message === "429") alert("Strava is busy — try again shortly.");
    else alert("Sync failed — please try again shortly.");
  } finally {
    setSyncing(false);
  }
};
```

And `badges`/`CelebrationModal` change from `Milestone[]` to the new type:

```tsx
import type { FellowshipBadge } from "../../shared/types";
// ...
const [badges, setBadges] = useState<FellowshipBadge[]>([]);
```

- [ ] **Step 4: Update `App.tsx`'s `Home` to pass the new props through**

```tsx
function Home() {
  const { data, loading, refresh, globalData, fellowshipId, setFellowshipId, view, setView } = useSession();
  if (loading) return <LoadingRing label="Summoning the Fellowship…" />;
  if (!data && !globalData) return <Navigate to="/login" replace />;
  if (data && !data.user.chosenCharacter) return <CharacterSelect onChosen={refresh} />;
  return (
    <Dashboard
      me={data} refresh={refresh} globalData={globalData}
      fellowshipId={fellowshipId} setFellowshipId={setFellowshipId} view={view} setView={setView}
    />
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: remaining errors confined to `MapView.tsx`/`StatsPanel.tsx` (need `me: MeResponse | null` and ghost-mode handling) — fixed in Task 17.

- [ ] **Step 6: Commit**

```bash
git add src/useSession.ts src/components/FellowshipSwitcher.tsx src/pages/Dashboard.tsx src/App.tsx src/styles.css
git commit -m "feat: fellowship switcher and global-view session state"
```

---

### Task 17: Global ghost rendering on the map

**Files:**
- Modify: `src/components/MapView.tsx`
- Modify: `src/components/StatsPanel.tsx`
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `GlobalResponse.ghosts` (Task 12), `view`/`globalData` (Task 16).
- Produces: nothing later depends on this — it's the final integration task.

- [ ] **Step 1: Add ghost rendering to `MapView.tsx`**

Add a new prop and a lightweight, non-interactive overlay component (reusing the existing `spriteFor`/`positionForMiles`/`latFor` helpers already in the file):

```tsx
function GhostOverlay({ ghost }: { ghost: import("../api-client").Ghost }) {
  const p = positionForMiles(ghost.totalMiles, ROUTE_WAYPOINTS);
  const lat = latFor(p.y);
  const footLat = lat - FOOT_FRAC * CHAR_H;
  const overlayBounds: L.LatLngBoundsExpression = [
    [footLat, p.x - CHAR_W / 2],
    [footLat + CHAR_H, p.x + CHAR_W / 2],
  ];
  return (
    <ImageOverlay
      url={spriteFor(ghost.chosenCharacter)}
      bounds={overlayBounds}
      zIndex={600}
      interactive={false}
      eventHandlers={{
        add: (e) => {
          const el = (e.target as L.ImageOverlay).getElement();
          if (el) { el.style.imageRendering = "pixelated"; el.style.opacity = "0.38"; }
        },
      }}
    />
  );
}
```

Add `ghosts?: import("../api-client").Ghost[]` to `MapView`'s props type, and — right after the `{members.map(...RunnerOverlay...)}` block — render:

```tsx
{ghosts?.map((g) => <GhostOverlay key={`${g.userId}-${g.fellowshipId}`} ghost={g} />)}
```

When `ghosts` is passed, `MapView` should render with `members={[]}` from the caller (Dashboard) so no trails/interactive runners/sync-driven camera-follow render alongside the ghosts — an empty `members` array naturally produces none of those, since they're all keyed off `members.map(...)`. The pooled-Fellowship ring marker is a separate case: it has no dependency on `members` at all (it's positioned from the `fellowshipMiles` prop alone), so it needs an explicit guard. Change:

```tsx
<Marker position={[latFor(fPos.y), fPos.x]} icon={fellowshipIcon} interactive={false} />
```

to:

```tsx
{!ghosts && <Marker position={[latFor(fPos.y), fPos.x]} icon={fellowshipIcon} interactive={false} />}
```

(`ghosts` is `undefined` in fellowship view and always an array — including possibly empty — in Global view, so `!ghosts` correctly distinguishes the two.)

- [ ] **Step 2: Wire ghosts through `Dashboard.tsx`**

Where `<MapView ... />` is rendered, branch on `view`:

```tsx
<MapView
  members={view === "global" ? [] : me?.members ?? []}
  fellowshipMiles={view === "global" ? 0 : me?.fellowshipMiles ?? 0}
  ghosts={view === "global" ? globalData?.ghosts : undefined}
  focus={focus}
  myMiles={view === "global" ? 0 : me?.user.totalMiles ?? 0}
  onOpenQuest={openQuest}
  onNavigate={() => setPanelCollapsed(true)}
  openedQuestIds={openedQuests}
  onSelectRunner={onSelectRunner}
/>
```

Hide the sync button and lens toggle (`StatsPanel`) in global view — render `StatsPanel` only when `view === "fellowship" && me`:

```tsx
{view === "fellowship" && me && (
  <StatsPanel
    me={me}
    onSync={onSync}
    syncing={syncing}
    onSelectMember={(id) => setFocus({ id, nonce: Date.now() })}
    collapsed={panelCollapsed}
    onCollapsedChange={setPanelCollapsed}
  />
)}
```

Guard every other `me`-dependent block. `ProfilePopover`/`ClusterPicker`/`ProfileDetail`/`QuestNote`/`CelebrationModal` don't reference `me` directly (they render off local `profile`/`cluster`/`profileDetail`/`quest`/`badges` state, which can only be set via a click on a real runner marker — never available in global view since `members={[]}` there) — leave those five unchanged. Change the remaining three:

```tsx
{me && <Passport totalMiles={me.user.totalMiles} openedQuestIds={openedQuests} />}
```

```tsx
{me && <Settings me={me} refresh={refresh} />}
```

And the achievement-detection effect, which reads `me.members` — add an early return for the null case:

```tsx
useEffect(() => {
  if (!me) return;
  const base = me.members.find((m) => m.id === me.user.id);
  if (!base) return;
  const earned = computeAchievements({ ...base, openedQuests }).filter((a) => a.earned);
  const fresh = earned.filter((a) => !notifiedRef.current.has(a.id));
  if (fresh.length) {
    fresh.forEach((a) => notifiedRef.current.add(a.id));
    api.achievementsSeen(fresh.map((a) => a.id)).catch(() => {});
    if (seededRef.current) setToasts((prev) => [...prev, ...fresh]);
  }
  seededRef.current = true;
}, [me, openedQuests]);
```

Two more spots read `me` unguarded at the top of the component body (safe at runtime — `me` is always non-null when the component first mounts, since `view` defaults to `"fellowship"` — but `me`'s type is now `MeResponse | null`, so these need an optional-chain to satisfy `strict` mode):

```tsx
const [openedQuests, setOpenedQuests] = useState<string[]>(me?.openedQuests ?? []);
```

```tsx
const notifiedRef = useRef<Set<string>>(new Set(me?.notifiedAchievements ?? []));
```

- [ ] **Step 3: Type-check and run the full suite**

Run: `npx tsc -b --noEmit && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 4: Manual verification on a phone-sized viewport**

`npm run dev`, sign in as a user in 2+ fellowships (use the admin screen from Task 15 to add yourself to a second one), switch between them on the dashboard, then tap Global: confirm ghosts render at ~38% opacity, aren't clickable, and there's no Sync button or Fellowship ring while in Global view.

- [ ] **Step 5: Commit**

```bash
git add src/components/MapView.tsx src/components/StatsPanel.tsx src/pages/Dashboard.tsx
git commit -m "feat: global ghost view on the map"
```

---

## Deployment sequence (not a task — a reminder)

1. Run `0002_multiple_fellowships.sql` (Task 1) against production Supabase.
2. Deploy Tasks 2–17.
3. Verify the app works end-to-end in production (existing group unaffected, admin screen reachable).
4. Only then run `0003_drop_legacy_fellowship_columns.sql` (Task 1, Step 2).
