import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";
import { readSessionUserId } from "./_lib/http.js";
import { memberTotal, activitiesForFellowship, multiplierFor } from "../shared/fellowship-sync.js";
import type { Fellowship, RunActivity } from "../shared/types.js";

// Longest run of consecutive week-buckets (weeks identified by floor(epoch / 7 days)).
function maxWeekStreak(weeks: Set<number>): number {
  const arr = [...weeks].sort((a, b) => a - b);
  let best = 0, cur = 0, prev: number | null = null;
  for (const w of arr) { cur = prev !== null && w === prev + 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = w; }
  return best;
}

// Shared stat formulas used for both fellowship-member cards and global-view ghosts,
// so a ghost's card reads identically to a member's. `activities` must already be
// scoped to the fellowship in question (see activitiesForFellowship).
function computeStats(activities: RunActivity[], fellowship: Fellowship) {
  let runs = 0, longest = 0, scaledTotal = 0, sec = 0, secDist = 0;
  const weeks = new Set<number>();
  const typeCounts = new Map<string, number>();
  for (const a of activities) {
    runs++;
    const mult = multiplierFor(fellowship, a.sportType);
    const scaled = a.distanceMiles * mult;
    longest = Math.max(longest, scaled);
    scaledTotal += scaled;
    if (a.movingSeconds != null) { sec += a.movingSeconds; secDist += a.distanceMiles; } // pace: RAW distance
    const t = a.runDate ? new Date(a.runDate).getTime() : NaN;
    if (!isNaN(t)) weeks.add(Math.floor(t / (7 * 86400000)));
    typeCounts.set(a.sportType, (typeCounts.get(a.sportType) ?? 0) + 1);
  }
  let mostCommonActivity: string | null = null;
  let best = 0;
  for (const [type, count] of typeCounts) {
    if (count > best) { best = count; mostCommonActivity = type; }
  }
  return {
    runs, longestMiles: longest,
    avgMiles: runs ? scaledTotal / runs : 0,
    avgPaceSecPerMile: secDist > 0 ? sec / secDist : null,
    weekStreak: maxWeekStreak(weeks),
    mostCommonActivity,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const slice = (col: unknown, fid: string): string[] => {
    const obj = (col && typeof col === "object" && !Array.isArray(col)) ? col as Record<string, unknown> : {};
    return Array.isArray(obj[fid]) ? (obj[fid] as string[]) : [];
  };

  const db = getServiceClient();
  const { data: user } = await db
    .from("users")
    .select("id, display_name, avatar_url, chosen_character, color, is_admin, opened_quests, notified_achievements")
    .eq("id", userId).maybeSingle();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const { data: memberships } = await db
    .from("fellowship_members")
    .select("joined_at, fellowship:fellowship_id(id, name, start_date, allowed_activity_types, activity_multipliers)")
    .eq("user_id", userId).order("joined_at", { ascending: true });
  const myFellowships: Fellowship[] = (memberships ?? [])
    .map((m) => m.fellowship as unknown as { id: string; name: string; start_date: string; allowed_activity_types: string[]; activity_multipliers: unknown } | null)
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({
      id: f.id, name: f.name, startDate: f.start_date, allowedActivityTypes: f.allowed_activity_types,
      activityMultipliers: (f.activity_multipliers as Record<string, number>) ?? {},
    }));
  if (myFellowships.length === 0) return res.status(500).json({ error: "no fellowship membership" });
  const fellowshipsSummary = myFellowships.map((f) => ({ id: f.id, name: f.name }));

  const view = req.query.view as string | undefined;

  if (view === "global") {
    const { data: allMemberships } = await db
      .from("fellowship_members")
      .select("user_id, fellowship:fellowship_id(id, name, start_date, allowed_activity_types, activity_multipliers)");
    const { data: allUsers } = await db.from("users").select("id, display_name, chosen_character, color, opened_quests");
    const usersById = new Map((allUsers ?? []).map((u) => [u.id, u]));

    const ghosts: {
      userId: string; fellowshipId: string; fellowshipName: string; displayName: string;
      chosenCharacter: string | null; color: string | null; totalMiles: number;
      stats: ReturnType<typeof computeStats>; openedQuests: string[];
    }[] = [];
    for (const m of allMemberships ?? []) {
      const f = m.fellowship as unknown as { id: string; name: string; start_date: string; allowed_activity_types: string[]; activity_multipliers: unknown } | null;
      const u = usersById.get(m.user_id);
      if (!f || !u) continue;
      const fellowship: Fellowship = {
        id: f.id, name: f.name, startDate: f.start_date, allowedActivityTypes: f.allowed_activity_types,
        activityMultipliers: (f.activity_multipliers as Record<string, number>) ?? {},
      };
      const { data: acts } = await db
        .from("activities").select("distance_miles, moving_seconds, run_date, name, sport_type")
        .eq("user_id", u.id);
      const activities: RunActivity[] = (acts ?? []).map((a) => ({
        stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0, runDate: a.run_date,
        name: a.name ?? "", sportType: a.sport_type, movingSeconds: a.moving_seconds ?? undefined,
      }));
      const scoped = activitiesForFellowship(activities, fellowship);
      ghosts.push({
        userId: u.id, fellowshipId: f.id, fellowshipName: f.name,
        displayName: u.display_name, chosenCharacter: u.chosen_character, color: u.color,
        totalMiles: memberTotal(activities, fellowship),
        stats: computeStats(scoped, fellowship),
        openedQuests: slice(u.opened_quests, f.id),
      });
    }
    return res.status(200).json({
      user: { id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url, chosenCharacter: user.chosen_character, color: user.color },
      isAdmin: user.is_admin, fellowships: fellowshipsSummary, global: true, ghosts,
    });
  }

  const requestedId = req.query.fellowshipId as string | undefined;
  const fellowship = myFellowships.find((f) => f.id === requestedId) ?? myFellowships[0];

  const { data: memberRows } = await db.from("fellowship_members").select("user_id").eq("fellowship_id", fellowship.id);
  const memberIds = (memberRows ?? []).map((m: { user_id: string }) => m.user_id);
  const { data: members } = await db
    .from("users").select("id, display_name, chosen_character, color, opened_quests")
    .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: acts } = await db
    .from("activities").select("user_id, distance_miles, moving_seconds, run_date, name, sport_type")
    .in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
  const activitiesByUser = new Map<string, RunActivity[]>();
  const rawByUser = new Map<string, { name: string; date: string }[]>();
  // Group raw rows by user first.
  type ActRow = NonNullable<typeof acts>[number];
  const rowsByUser = new Map<string, ActRow[]>();
  for (const a of acts ?? []) {
    const list = rowsByUser.get(a.user_id) ?? [];
    list.push(a);
    rowsByUser.set(a.user_id, list);
  }
  // Then compute stats/sayings from ONLY the activities that count for THIS fellowship.
  for (const [uid, rows] of rowsByUser) {
    const scoped = activitiesForFellowship(
      rows.map((a) => ({ stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0,
        runDate: a.run_date, name: a.name ?? "", sportType: a.sport_type, movingSeconds: a.moving_seconds ?? undefined })),
      fellowship
    );
    activitiesByUser.set(uid, scoped);
    rawByUser.set(uid, scoped.map((a) => ({ name: a.name || "Untitled run", date: a.runDate })));
  }

  const memberList = (members ?? []).map((m) => {
    const memberActivities = activitiesByUser.get(m.id) ?? [];
    return {
      id: m.id, displayName: m.display_name, chosenCharacter: m.chosen_character, color: m.color,
      totalMiles: memberTotal(memberActivities, fellowship),
      openedQuests: slice(m.opened_quests, fellowship.id),
      stats: computeStats(memberActivities, fellowship),
      activities: (rawByUser.get(m.id) ?? []).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    };
  });
  const fellowshipMiles = memberList.reduce((s, m) => s + m.totalMiles, 0);
  const me = memberList.find((m) => m.id === user.id);

  return res.status(200).json({
    user: {
      id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url,
      chosenCharacter: user.chosen_character, color: user.color, totalMiles: me?.totalMiles ?? 0,
    },
    isAdmin: user.is_admin,
    fellowships: fellowshipsSummary,
    fellowship: { id: fellowship.id, name: fellowship.name },
    members: memberList,
    fellowshipMiles,
    openedQuests: slice(user.opened_quests, fellowship.id),
    notifiedAchievements: slice(user.notified_achievements, fellowship.id),
  });
}
