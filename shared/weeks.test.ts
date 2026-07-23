import { describe, it, expect } from "vitest";
import { weekStart, addWeeks, isCompletedWeek, weekStartsBetween } from "./weeks.js";

describe("weekStart", () => {
  it("returns the UTC Monday for a mid-week date", () => {
    // 2026-07-22 is a Wednesday; its Monday is 2026-07-20
    expect(weekStart("2026-07-22T15:00:00Z")).toBe("2026-07-20");
  });
  it("returns the same day when given a Monday", () => {
    expect(weekStart("2026-07-20T00:00:00Z")).toBe("2026-07-20");
  });
  it("treats Sunday as the end of the prior Monday's week", () => {
    // 2026-07-26 is a Sunday; its Monday is 2026-07-20
    expect(weekStart("2026-07-26T23:00:00Z")).toBe("2026-07-20");
  });
  it("crosses a year boundary correctly", () => {
    // 2027-01-01 is a Friday; its Monday is 2026-12-28
    expect(weekStart("2027-01-01T12:00:00Z")).toBe("2026-12-28");
  });
});

describe("addWeeks", () => {
  it("advances by whole weeks", () => {
    expect(addWeeks("2026-07-20", 1)).toBe("2026-07-27");
    expect(addWeeks("2026-07-20", 2)).toBe("2026-08-03");
  });
});

describe("isCompletedWeek", () => {
  it("is false for the in-progress week", () => {
    expect(isCompletedWeek("2026-07-20", new Date("2026-07-22T00:00:00Z"))).toBe(false);
  });
  it("is false at the exact Sunday-night boundary of that week", () => {
    expect(isCompletedWeek("2026-07-20", new Date("2026-07-26T23:59:59.999Z"))).toBe(false);
  });
  it("is true once the following Monday has begun", () => {
    expect(isCompletedWeek("2026-07-20", new Date("2026-07-27T00:00:00Z"))).toBe(true);
  });
});

describe("weekStartsBetween", () => {
  it("lists each Monday inclusive of both ends' weeks", () => {
    expect(weekStartsBetween("2026-07-22", "2026-08-04")).toEqual([
      "2026-07-20", "2026-07-27", "2026-08-03",
    ]);
  });
  it("returns a single week when both dates share a week", () => {
    expect(weekStartsBetween("2026-07-21", "2026-07-24")).toEqual(["2026-07-20"]);
  });
});
