import { describe, it, expect } from "vitest";
import { metersToMiles } from "./units";

describe("metersToMiles", () => {
  it("converts a marathon (42195 m) to ~26.2187 miles", () => {
    expect(metersToMiles(42195)).toBeCloseTo(26.2187, 3);
  });
  it("returns 0 for 0 meters", () => {
    expect(metersToMiles(0)).toBe(0);
  });
  it("converts exactly one mile", () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 9);
  });
});
