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
