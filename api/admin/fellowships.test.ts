import { describe, it, expect } from "vitest";
import { isValidActivityTypes, isValidMultipliers } from "./fellowships";

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

describe("isValidMultipliers", () => {
  it("accepts an object of non-negative finite numbers", () => {
    expect(isValidMultipliers({ Run: 2.5, Ride: 0.1, Walk: 0 })).toBe(true);
  });
  it("accepts an empty object", () => {
    expect(isValidMultipliers({})).toBe(true);
  });
  it("rejects negative or non-finite values", () => {
    expect(isValidMultipliers({ Run: -1 })).toBe(false);
    expect(isValidMultipliers({ Run: Infinity })).toBe(false);
  });
  it("rejects non-object / non-number values", () => {
    expect(isValidMultipliers(null)).toBe(false);
    expect(isValidMultipliers([2.5])).toBe(false);
    expect(isValidMultipliers({ Run: "2.5" })).toBe(false);
  });
});
