import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";
import { readSessionUserId } from "./_lib/http.js";
import { weekStart, addWeeks } from "../shared/weeks.js";
import { weekMiles } from "../shared/weekly.js";
import { memberTotal } from "../shared/fellowship-sync.js";
import { percentComplete } from "../shared/progress.js";
import { ROUTE, TOTAL_MILES } from "../shared/route.js";
import type { Fellowship, RunActivity } from "../shared/types.js";

export interface FellowshipCardMember {
  id: string; displayName: string; chosenCharacter: string | null; color: string | null;
  totalMiles: number; lastWeekMiles: number;
}

export function buildCardMembers(
  members: { userId: string; displayName: string; chosenCharacter: string | null; color: string | null; activities: RunActivity[] }[],
  fellowship: Fellowship,
  lastWeekStartISO: string,
): FellowshipCardMember[] {
  return members
    .map((m) => ({
      id: m.userId, displayName: m.displayName, chosenCharacter: m.chosenCharacter, color: m.color,
      totalMiles: memberTotal(m.activities, fellowship),
      lastWeekMiles: weekMiles(m.activities, fellowship, lastWeekStartISO),
    }))
    .sort((a, b) => b.lastWeekMiles - a.lastWeekMiles);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });
  const fellowshipId = req.query.fellowshipId as string | undefined;
  if (!fellowshipId) return res.status(400).json({ error: "fellowshipId required" });

  const db = getServiceClient();
  const { data: fRow } = await db.from("fellowship").select("id, name, start_date, allowed_activity_types, activity_multipliers").eq("id", fellowshipId).maybeSingle();
  if (!fRow) return res.status(404).json({ error: "not found" });
  const fellowship: Fellowship = { id: fRow.id, name: fRow.name, startDate: fRow.start_date, allowedActivityTypes: fRow.allowed_activity_types, activityMultipliers: (fRow.activity_multipliers as Record<string, number>) ?? {} };

  const { data: memberRows } = await db.from("fellowship_members").select("user_id").eq("fellowship_id", fellowshipId);
  const memberIds = (memberRows ?? []).map((m: { user_id: string }) => m.user_id);
  const ids = memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"];
  const { data: users } = await db.from("users").select("id, display_name, chosen_character, color").in("id", ids);
  const { data: acts } = await db.from("activities").select("user_id, distance_miles, run_date, sport_type").in("user_id", ids);

  const actsByUser = new Map<string, RunActivity[]>();
  for (const a of acts ?? []) {
    const list = actsByUser.get(a.user_id) ?? [];
    list.push({ stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0, runDate: a.run_date, name: "", sportType: a.sport_type });
    actsByUser.set(a.user_id, list);
  }
  const memberInputs = (users ?? []).map((u) => ({ userId: u.id, displayName: u.display_name, chosenCharacter: u.chosen_character, color: u.color, activities: actsByUser.get(u.id) ?? [] }));
  const lastWeek = addWeeks(weekStart(new Date()), -1);
  const members = buildCardMembers(memberInputs, fellowship, lastWeek);
  const pooledMiles = members.reduce((s, m) => s + m.totalMiles, 0);

  // Weekly-win badges for this fellowship (global scopes only).
  const { data: badges } = await db.from("weekly_awards").select("week_start, scope, metric_value").eq("fellowship_id", fellowshipId).in("scope", ["global_pooled", "global_percapita"]).order("week_start", { ascending: false });

  // Lands reached: landmark ids whose cumulativeMiles <= pooledMiles, plus the full landmark list for greying.
  const allLandmarks = ROUTE.filter((w) => w.isLandmark).map((w) => ({ id: w.landmarkId!, name: w.name, miles: w.cumulativeMiles }));
  const reached = allLandmarks.filter((l) => l.miles <= pooledMiles).map((l) => l.id);

  return res.status(200).json({
    fellowship: { id: fellowship.id, name: fellowship.name },
    standing: { pooledMiles, progressPct: percentComplete(pooledMiles, ROUTE), totalMiles: TOTAL_MILES, memberCount: members.length },
    weeklyBadges: badges ?? [],
    landmarks: { all: allLandmarks, reached },
    members,
  });
}
