import { describe, it, expect } from "vitest";
import { ROUTE, TOTAL_MILES } from "./route";

describe("ROUTE", () => {
  it("starts at the Shire at mile 0", () => {
    expect(ROUTE[0].cumulativeMiles).toBe(0);
    expect(ROUTE[0].landmarkId).toBe("shire");
  });
  it("ends at Mount Doom at 1779 miles", () => {
    const last = ROUTE[ROUTE.length - 1];
    expect(last.landmarkId).toBe("mount-doom");
    expect(last.cumulativeMiles).toBe(1779);
    expect(TOTAL_MILES).toBe(1779);
  });
  it("has strictly increasing cumulative miles", () => {
    for (let i = 1; i < ROUTE.length; i++) {
      expect(ROUTE[i].cumulativeMiles).toBeGreaterThan(ROUTE[i - 1].cumulativeMiles);
    }
  });
  it("gives every landmark a message and lore", () => {
    for (const w of ROUTE.filter((w) => w.isLandmark)) {
      expect(w.message && w.message.length).toBeTruthy();
      expect(w.lore && w.lore.length).toBeTruthy();
    }
  });
});
