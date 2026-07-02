import { describe, it, expect } from "vitest";
import { positionForMiles, percentComplete } from "./progress";
import type { Waypoint } from "./types";

const R: Waypoint[] = [
  { name: "A", x: 0, y: 0, cumulativeMiles: 0, isLandmark: true, landmarkId: "a" },
  { name: "B", x: 100, y: 0, cumulativeMiles: 100, isLandmark: true, landmarkId: "b" },
  { name: "C", x: 100, y: 200, cumulativeMiles: 300, isLandmark: true, landmarkId: "c" },
];

describe("positionForMiles", () => {
  it("clamps negative miles to the first waypoint", () => {
    expect(positionForMiles(-5, R)).toEqual({ x: 0, y: 0, segmentIndex: 0 });
  });
  it("returns exact waypoint position on a threshold", () => {
    expect(positionForMiles(100, R)).toEqual({ x: 100, y: 0, segmentIndex: 1 });
  });
  it("interpolates within the first segment", () => {
    expect(positionForMiles(50, R)).toEqual({ x: 50, y: 0, segmentIndex: 0 });
  });
  it("interpolates within a later, longer segment", () => {
    // 200 miles = 100 mi into the 200-mile B->C segment => halfway
    expect(positionForMiles(200, R)).toEqual({ x: 100, y: 100, segmentIndex: 1 });
  });
  it("clamps beyond the end to the last waypoint", () => {
    expect(positionForMiles(9999, R)).toEqual({ x: 100, y: 200, segmentIndex: 2 });
  });
});

describe("percentComplete", () => {
  it("is 0 at the start", () => expect(percentComplete(0, R)).toBe(0));
  it("is 50 at the halfway distance", () => expect(percentComplete(150, R)).toBe(50));
  it("clamps to 100 past the end", () => expect(percentComplete(400, R)).toBe(100));
});
