import type { RunActivity, Waypoint, Milestone } from "./types.js";
import { crossedLandmarks } from "./milestones.js";

export interface SyncComputeInput {
  fetched: RunActivity[];
  existingActivityIds: number[];
  previousTotalMiles: number;
  route: Waypoint[];
}

export interface SyncComputeResult {
  newActivities: RunActivity[];
  newTotalMiles: number;
  crossed: Milestone[];
}

export function computeSync(input: SyncComputeInput): SyncComputeResult {
  const known = new Set(input.existingActivityIds);
  const newActivities = input.fetched.filter((a) => !known.has(a.stravaActivityId));
  const added = newActivities.reduce((sum, a) => sum + a.distanceMiles, 0);
  const newTotalMiles = input.previousTotalMiles + added;
  const crossed = crossedLandmarks(input.previousTotalMiles, newTotalMiles, input.route);
  return { newActivities, newTotalMiles, crossed };
}
