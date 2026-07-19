import { describe, it, expect } from "vitest";
import {
  memberTotal,
  earliestStartDate,
  unionActivityTypes,
  canRemoveMembership,
  newActivitiesOnly,
  computeFellowshipTotals,
  activitiesForFellowship,
  multiplierFor,
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
