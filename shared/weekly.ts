import type { Fellowship, RunActivity } from "./types.js";
import { weekStart } from "./weeks.js";
import { activitiesForFellowship, multiplierFor } from "./fellowship-sync.js";

export interface MemberInput { userId: string; activities: RunActivity[]; }
export interface FellowshipInput { fellowship: Fellowship; members: MemberInput[]; }
export interface Winners {
  globalPooled: { fellowshipId: string; value: number } | null;
  globalPerCapita: { fellowshipId: string; value: number } | null;
  members: { fellowshipId: string; userId: string; value: number }[];
}

// Miles a member ran in a given week, applying this fellowship's type filter,
// start-date floor, and multipliers (via activitiesForFellowship / multiplierFor).
export function weekMiles(activities: RunActivity[], fellowship: Fellowship, weekStartISO: string): number {
  return activitiesForFellowship(activities, fellowship)
    .filter((a) => weekStart(a.runDate) === weekStartISO)
    .reduce((sum, a) => sum + a.distanceMiles * multiplierFor(fellowship, a.sportType), 0);
}

// Deterministic "is candidate better than current best": higher value wins;
// on a tie the lower id wins so re-runs are stable.
function better(value: number, id: string, best: { value: number; id: string } | null): boolean {
  if (value <= 0) return false;
  if (!best) return true;
  if (value !== best.value) return value > best.value;
  return id < best.id;
}

export function computeWeekWinners(inputs: FellowshipInput[], weekStartISO: string): Winners {
  let pooledBest: { fellowshipId: string; value: number; id: string } | null = null;
  let perCapBest: { fellowshipId: string; value: number; id: string } | null = null;
  const members: Winners["members"] = [];

  for (const { fellowship, members: mem } of inputs) {
    const perMember = mem.map((m) => ({ userId: m.userId, value: weekMiles(m.activities, fellowship, weekStartISO) }));
    const pooled = perMember.reduce((s, m) => s + m.value, 0);
    const perCapita = mem.length ? pooled / mem.length : 0;

    if (better(pooled, fellowship.id, pooledBest && { value: pooledBest.value, id: pooledBest.id }))
      pooledBest = { fellowshipId: fellowship.id, value: pooled, id: fellowship.id };
    if (better(perCapita, fellowship.id, perCapBest && { value: perCapBest.value, id: perCapBest.id }))
      perCapBest = { fellowshipId: fellowship.id, value: perCapita, id: fellowship.id };

    let memberBest: { userId: string; value: number } | null = null;
    for (const pm of perMember) {
      if (better(pm.value, pm.userId, memberBest && { value: memberBest.value, id: memberBest.userId }))
        memberBest = { userId: pm.userId, value: pm.value };
    }
    if (memberBest) members.push({ fellowshipId: fellowship.id, userId: memberBest.userId, value: memberBest.value });
  }

  return {
    globalPooled: pooledBest && { fellowshipId: pooledBest.fellowshipId, value: pooledBest.value },
    globalPerCapita: perCapBest && { fellowshipId: perCapBest.fellowshipId, value: perCapBest.value },
    members,
  };
}
