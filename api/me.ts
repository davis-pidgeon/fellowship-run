import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";
import { readSessionUserId } from "./_lib/http.js";
import { memberTotal } from "../shared/fellowship-sync.js";
import type { Fellowship, RunActivity } from "../shared/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const db = getServiceClient();
  const { data: user } = await db
    .from("users")
    .select("id, display_name, avatar_url, chosen_character, color, is_admin, opened_quests, notified_achievements")
    .eq("id", userId).maybeSingle();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const { data: memberships } = await db
    .from("fellowship_members")
    .select("joined_at, fellowship:fellowship_id(id, name, start_date, allowed_activity_types)")
    .eq("user_id", userId).order("joined_at", { ascending: true });
  const myFellowships: Fellowship[] = (memberships ?? [])
    .map((m) => m.fellowship as unknown as { id: string; name: string; start_date: string; allowed_activity_types: string[] } | null)
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ id: f.id, name: f.name, startDate: f.start_date, allowedActivityTypes: f.allowed_activity_types }));
  if (myFellowships.length === 0) return res.status(500).json({ error: "no fellowship membership" });
  const fellowshipsSummary = myFellowships.map((f) => ({ id: f.id, name: f.name }));

  const view = req.query.view as string | undefined;

  if (view === "global") {
    const { data: allMemberships } = await db
      .from("fellowship_members")
      .select("user_id, fellowship:fellowship_id(id, name, start_date, allowed_activity_types)");
    const { data: allUsers } = await db.from("users").select("id, display_name, chosen_character, color");
    const usersById = new Map((allUsers ?? []).map((u) => [u.id, u]));

    const ghosts: { userId: string; fellowshipId: string; fellowshipName: string; displayName: string; chosenCharacter: string | null; color: string | null; totalMiles: number }[] = [];
    for (const m of allMemberships ?? []) {
      const f = m.fellowship as unknown as { id: string; name: string; start_date: string; allowed_activity_types: string[] } | null;
      const u = usersById.get(m.user_id);
      if (!f || !u) continue;
      const fellowship: Fellowship = { id: f.id, name: f.name, startDate: f.start_date, allowedActivityTypes: f.allowed_activity_types };
      const { data: acts } = await db.from("activities").select("distance_miles, run_date, sport_type").eq("user_id", u.id);
      const activities: RunActivity[] = (acts ?? []).map((a) => ({
        stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0, runDate: a.run_date, name: "", sportType: a.sport_type,
      }));
      ghosts.push({
        userId: u.id, fellowshipId: f.id, fellowshipName: f.name,
        displayName: u.display_name, chosenCharacter: u.chosen_character, color: u.color,
        totalMiles: memberTotal(activities, fellowship),
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
  const secByUser = new Map<string, { runs: number; longest: number; sec: number; secDist: number; weeks: Set<number> }>();
  for (const a of acts ?? []) {
    const list = activitiesByUser.get(a.user_id) ?? [];
    list.push({ stravaActivityId: 0, distanceMiles: a.distance_miles ?? 0, runDate: a.run_date, name: a.name ?? "", sportType: a.sport_type });
    activitiesByUser.set(a.user_id, list);

    const s = secByUser.get(a.user_id) ?? { runs: 0, longest: 0, sec: 0, secDist: 0, weeks: new Set<number>() };
    const d = a.distance_miles ?? 0;
    s.runs++; s.longest = Math.max(s.longest, d);
    if (a.moving_seconds != null) { s.sec += a.moving_seconds; s.secDist += d; }
    const t = a.run_date ? new Date(a.run_date).getTime() : NaN;
    if (!isNaN(t)) s.weeks.add(Math.floor(t / (7 * 86400000)));
    secByUser.set(a.user_id, s);

    const rawList = rawByUser.get(a.user_id) ?? [];
    rawList.push({ name: a.name ?? "Untitled run", date: a.run_date });
    rawByUser.set(a.user_id, rawList);
  }
  const maxWeekStreak = (weeks: Set<number>): number => {
    const arr = [...weeks].sort((a, b) => a - b);
    let best = 0, cur = 0, prev: number | null = null;
    for (const w of arr) { cur = prev !== null && w === prev + 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = w; }
    return best;
  };

  const memberList = (members ?? []).map((m) => {
    const memberActivities = activitiesByUser.get(m.id) ?? [];
    const totalMiles = memberTotal(memberActivities, fellowship);
    const s = secByUser.get(m.id);
    return {
      id: m.id, displayName: m.display_name, chosenCharacter: m.chosen_character, color: m.color,
      totalMiles,
      openedQuests: Array.isArray(m.opened_quests) ? m.opened_quests : [],
      stats: {
        runs: s?.runs ?? 0, longestMiles: s?.longest ?? 0,
        avgMiles: s && s.runs ? memberActivities.reduce((sum, a) => sum + a.distanceMiles, 0) / s.runs : 0,
        avgPaceSecPerMile: s && s.secDist > 0 ? s.sec / s.secDist : null,
        weekStreak: s ? maxWeekStreak(s.weeks) : 0,
      },
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
    openedQuests: Array.isArray(user.opened_quests) ? user.opened_quests : [],
    notifiedAchievements: Array.isArray(user.notified_achievements) ? user.notified_achievements : [],
  });
}
