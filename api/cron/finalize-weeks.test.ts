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
    expect(wk13.map((r) => r.scope).sort()).toEqual(["global_percapita", "global_pooled", "member"]);
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
