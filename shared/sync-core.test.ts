import { describe, it, expect } from "vitest";
import { computeSync } from "./sync-core";
import type { RunActivity, Waypoint } from "./types";

const route: Waypoint[] = [
  { name: "Start", x: 0, y: 0, cumulativeMiles: 0, isLandmark: true, landmarkId: "start", message: "m", lore: "l" },
  { name: "L1", x: 0, y: 0, cumulativeMiles: 10, isLandmark: true, landmarkId: "l1", message: "m1", lore: "lore1" },
];

const run = (id: number, miles: number): RunActivity => ({
  stravaActivityId: id, distanceMiles: miles, runDate: "2026-07-01T00:00:00Z", name: "Run",
});

describe("computeSync", () => {
  it("dedupes activities already stored", () => {
    const res = computeSync({
      fetched: [run(1, 3), run(2, 4)],
      existingActivityIds: [1],
      previousTotalMiles: 0,
      route,
    });
    expect(res.newActivities.map((a) => a.stravaActivityId)).toEqual([2]);
    expect(res.newTotalMiles).toBe(4);
  });
  it("accumulates onto the previous total", () => {
    const res = computeSync({
      fetched: [run(5, 2.5)],
      existingActivityIds: [],
      previousTotalMiles: 6,
      route,
    });
    expect(res.newTotalMiles).toBe(8.5);
  });
  it("reports a landmark crossed by the new miles", () => {
    const res = computeSync({
      fetched: [run(9, 7)],
      existingActivityIds: [],
      previousTotalMiles: 6,
      route,
    });
    expect(res.crossed.map((m) => m.landmarkId)).toEqual(["l1"]);
  });
  it("reports no crossings when nothing new is added", () => {
    const res = computeSync({
      fetched: [run(1, 3)],
      existingActivityIds: [1],
      previousTotalMiles: 6,
      route,
    });
    expect(res.newActivities).toEqual([]);
    expect(res.crossed).toEqual([]);
    expect(res.newTotalMiles).toBe(6);
  });
});
