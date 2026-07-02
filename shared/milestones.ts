import type { Waypoint, Milestone } from "./types";

export function crossedLandmarks(
  oldMiles: number,
  newMiles: number,
  route: Waypoint[]
): Milestone[] {
  return route
    .filter(
      (w) =>
        w.isLandmark &&
        w.landmarkId &&
        w.message &&
        w.lore &&
        w.cumulativeMiles > oldMiles &&
        w.cumulativeMiles <= newMiles
    )
    .sort((a, b) => a.cumulativeMiles - b.cumulativeMiles)
    .map((w) => ({
      landmarkId: w.landmarkId as string,
      name: w.name,
      message: w.message as string,
      lore: w.lore as string,
      cumulativeMiles: w.cumulativeMiles,
    }));
}
