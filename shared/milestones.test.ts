import { describe, it, expect } from "vitest";
import { crossedLandmarks } from "./milestones";
import type { Waypoint } from "./types";

const R: Waypoint[] = [
  { name: "Start", x: 0, y: 0, cumulativeMiles: 0, isLandmark: true, landmarkId: "start", message: "m", lore: "l" },
  { name: "L1", x: 0, y: 0, cumulativeMiles: 100, isLandmark: true, landmarkId: "l1", message: "m1", lore: "lore1" },
  { name: "L2", x: 0, y: 0, cumulativeMiles: 200, isLandmark: true, landmarkId: "l2", message: "m2", lore: "lore2" },
  { name: "waypoint", x: 0, y: 0, cumulativeMiles: 250, isLandmark: false },
];

describe("crossedLandmarks", () => {
  it("returns nothing when no landmark is between old and new", () => {
    expect(crossedLandmarks(10, 90, R)).toEqual([]);
  });
  it("does not re-fire the start landmark for a new runner at 0", () => {
    expect(crossedLandmarks(0, 50, R)).toEqual([]);
  });
  it("fires a landmark crossed this sync", () => {
    const out = crossedLandmarks(90, 150, R);
    expect(out.map((m) => m.landmarkId)).toEqual(["l1"]);
  });
  it("fires multiple landmarks crossed in one sync, in order", () => {
    const out = crossedLandmarks(50, 205, R);
    expect(out.map((m) => m.landmarkId)).toEqual(["l1", "l2"]);
  });
  it("fires on an exact threshold hit (inclusive upper bound)", () => {
    expect(crossedLandmarks(150, 200, R).map((m) => m.landmarkId)).toEqual(["l2"]);
  });
  it("ignores non-landmark waypoints", () => {
    expect(crossedLandmarks(210, 300, R)).toEqual([]);
  });
});
