import type { RunActivity, Waypoint, Milestone, Fellowship } from "./types.js";
import { crossedLandmarks } from "./milestones.js";

export function activitiesForFellowship(activities: RunActivity[], fellowship: Fellowship): RunActivity[] {
  const floor = new Date(fellowship.startDate).getTime();
  const allowed = new Set(fellowship.allowedActivityTypes);
  return activities.filter((a) => allowed.has(a.sportType) && new Date(a.runDate).getTime() >= floor);
}

export function memberTotal(activities: RunActivity[], fellowship: Fellowship): number {
  return activitiesForFellowship(activities, fellowship).reduce((sum, a) => sum + a.distanceMiles, 0);
}

export function earliestStartDate(fellowships: Fellowship[]): string {
  return fellowships.reduce(
    (earliest, f) => (f.startDate < earliest ? f.startDate : earliest),
    fellowships[0].startDate
  );
}

export function unionActivityTypes(fellowships: Fellowship[]): string[] {
  const set = new Set<string>();
  for (const f of fellowships) for (const t of f.allowedActivityTypes) set.add(t);
  return [...set];
}

export function canRemoveMembership(membershipCountForUser: number): boolean {
  return membershipCountForUser > 1;
}

export function newActivitiesOnly(fetched: RunActivity[], existingActivityIds: number[]): RunActivity[] {
  const known = new Set(existingActivityIds);
  return fetched.filter((a) => !known.has(a.stravaActivityId));
}

export interface FellowshipSyncResult {
  fellowshipId: string;
  newTotalMiles: number;
  crossed: Milestone[];
}

// Diffs each fellowship's member total before vs. after a sync to detect
// landmark crossings — independently per fellowship, since the same person's
// mileage (and thus crossings) can differ across the fellowships they're in.
export function computeFellowshipTotals(
  fellowships: Fellowship[],
  activitiesBeforeSync: RunActivity[],
  activitiesAfterSync: RunActivity[],
  route: Waypoint[]
): FellowshipSyncResult[] {
  return fellowships.map((f) => {
    const before = memberTotal(activitiesBeforeSync, f);
    const after = memberTotal(activitiesAfterSync, f);
    return { fellowshipId: f.id, newTotalMiles: after, crossed: crossedLandmarks(before, after, route) };
  });
}
