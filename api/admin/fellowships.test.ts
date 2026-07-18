import { describe, it, expect } from "vitest";
import { isValidActivityTypes } from "./fellowships";

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
