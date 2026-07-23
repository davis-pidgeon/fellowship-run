import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "../_lib/supabase.js";
import { getEnv } from "../_lib/env.js";
import { weekStart, weekStartsBetween, isCompletedWeek } from "../../shared/weeks.js";
import { computeWeekWinners, type FellowshipInput } from "../../shared/weekly.js";
import type { Fellowship, RunActivity } from "../../shared/types.js";

export interface AwardRow {
  week_start: string;
  scope: "global_pooled" | "global_percapita" | "member";
  fellowship_id: string;
  user_id: string | null;
  metric_value: number;
}

// Pure planner: for each completed week from the earliest activity forward that
// is not already recorded, compute winners and flatten to insertable rows.
export function planFinalization(args: {
  inputs: FellowshipInput[];
  earliestActivityDate: string | null;
  now: Date;
  recordedWeeks: Set<string>;
}): AwardRow[] {
  const { inputs, earliestActivityDate, now, recordedWeeks } = args;
  if (!earliestActivityDate) return [];
  const todayWeek = weekStart(now);
  const weeks = weekStartsBetween(earliestActivityDate, todayWeek)
    .filter((w) => isCompletedWeek(w, now) && !recordedWeeks.has(w));

  const rows: AwardRow[] = [];
  for (const w of weeks) {
    const winners = computeWeekWinners(inputs, w);
    if (winners.globalPooled) rows.push({ week_start: w, scope: "global_pooled", fellowship_id: winners.globalPooled.fellowshipId, user_id: null, metric_value: winners.globalPooled.value });
    if (winners.globalPerCapita) rows.push({ week_start: w, scope: "global_percapita", fellowship_id: winners.globalPerCapita.fellowshipId, user_id: null, metric_value: winners.globalPerCapita.value });
    for (const m of winners.members) rows.push({ week_start: w, scope: "member", fellowship_id: m.fellowshipId, user_id: m.userId, metric_value: m.value });
  }
  return rows;
}

// Load every fellowship + its members' activities into FellowshipInput[].
async function loadInputs(db: ReturnType<typeof getServiceClient>): Promise<{ inputs: FellowshipInput[]; earliest: string | null }> {
  const { data: fships } = await db.from("fellowship").select("id, name, start_date, allowed_activity_types, activity_multipliers");
  const { data: memberships } = await db.from("fellowship_members").select("user_id, fellowship_id");
  const { data: acts } = await db.from("activities").select("user_id, distance_miles, run_date, sport_type");

  const actsByUser = new Map<string, RunActivity[]>();
  let earliest: string | null = null;
  for (const a of acts ?? []) {
    const list = actsByUser.get(a.user_id) ?? [];
    list.push({ stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0, runDate: a.run_date, name: "", sportType: a.sport_type });
    actsByUser.set(a.user_id, list);
    if (a.run_date && (earliest === null || a.run_date < earliest)) earliest = a.run_date;
  }
  const membersByF = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const list = membersByF.get(m.fellowship_id) ?? [];
    list.push(m.user_id);
    membersByF.set(m.fellowship_id, list);
  }
  const inputs: FellowshipInput[] = (fships ?? []).map((f) => {
    const fellowship: Fellowship = { id: f.id, name: f.name, startDate: f.start_date, allowedActivityTypes: f.allowed_activity_types, activityMultipliers: (f.activity_multipliers as Record<string, number>) ?? {} };
    const members = (membersByF.get(f.id) ?? []).map((uid) => ({ userId: uid, activities: actsByUser.get(uid) ?? [] }));
    return { fellowship, members };
  });
  return { inputs, earliest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Reject anything else.
  const secret = getEnv("CRON_SECRET");
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });

  const db = getServiceClient();
  const { inputs, earliest } = await loadInputs(db);
  const { data: recorded } = await db.from("weekly_awards").select("week_start");
  const recordedWeeks = new Set((recorded ?? []).map((r: { week_start: string }) => r.week_start));

  const rows = planFinalization({ inputs, earliestActivityDate: earliest, now: new Date(), recordedWeeks });
  if (rows.length) {
    const { error } = await db.from("weekly_awards").insert(rows);
    // 23505 = unique_violation: a concurrent run already recorded these weeks; safe to ignore
    // (the partial unique indexes are the backstop). Any other error should surface.
    if (error && error.code !== "23505") return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ finalized: rows.length });
}
