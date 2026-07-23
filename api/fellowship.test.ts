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
