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
