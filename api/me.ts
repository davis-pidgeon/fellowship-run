import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";
import { readSessionUserId } from "./_lib/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const db = getServiceClient();
  const { data: user } = await db
    .from("users")
    .select("id, display_name, avatar_url, chosen_character, color, total_miles, fellowship_id, opened_quests, notified_achievements")
    .eq("id", userId).maybeSingle();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const { data: fellowship } = await db
    .from("fellowship").select("id, name").eq("id", user.fellowship_id).single();

  if (!fellowship) return res.status(500).json({ error: "fellowship not found" });

  const { data: members } = await db
    .from("users")
    .select("id, display_name, chosen_character, color, total_miles, opened_quests")
    .eq("fellowship_id", user.fellowship_id);

  // Per-member run stats from the activities table (one grouped read).
  const memberIds = (members ?? []).map((m) => m.id);
  const { data: acts } = await db
    .from("activities")
    .select("user_id, distance_miles, moving_seconds, run_date, name")
    .in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
  const agg = new Map<string, { runs: number; dist: number; longest: number; sec: number; secDist: number; weeks: Set<number> }>();
  const recentByUser = new Map<string, { name: string; date: string }[]>();
  for (const a of acts ?? []) {
    const g = agg.get(a.user_id) ?? { runs: 0, dist: 0, longest: 0, sec: 0, secDist: 0, weeks: new Set<number>() };
    const d = a.distance_miles ?? 0;
    g.runs++; g.dist += d; g.longest = Math.max(g.longest, d);
    if (a.moving_seconds != null) { g.sec += a.moving_seconds; g.secDist += d; }
    const t = a.run_date ? new Date(a.run_date).getTime() : NaN;
    if (!isNaN(t)) g.weeks.add(Math.floor(t / (7 * 86400000))); // 7-day bucket from epoch
    agg.set(a.user_id, g);
    const list = recentByUser.get(a.user_id) ?? [];
    list.push({ name: a.name ?? "Untitled run", date: a.run_date });
    recentByUser.set(a.user_id, list);
  }
  // longest run of consecutive active weeks
  const maxWeekStreak = (weeks: Set<number>): number => {
    const arr = [...weeks].sort((a, b) => a - b);
    let best = 0, cur = 0, prev: number | null = null;
    for (const w of arr) { cur = prev !== null && w === prev + 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = w; }
    return best;
  };

  const memberList = (members ?? []).map((m) => {
    const g = agg.get(m.id);
    return {
      id: m.id, displayName: m.display_name,
      chosenCharacter: m.chosen_character, color: m.color, totalMiles: m.total_miles,
      openedQuests: Array.isArray(m.opened_quests) ? m.opened_quests : [],
      stats: {
        runs: g?.runs ?? 0,
        longestMiles: g?.longest ?? 0,
        avgMiles: g && g.runs ? g.dist / g.runs : 0,
        avgPaceSecPerMile: g && g.secDist > 0 ? g.sec / g.secDist : null,
        weekStreak: g ? maxWeekStreak(g.weeks) : 0,
      },
      // All activities, newest first — their names are the character's sayings.
      // The map cycles the most recent 10; the profile screen cycles them all.
      activities: (recentByUser.get(m.id) ?? [])
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    };
  });
  const fellowshipMiles = memberList.reduce((s, m) => s + (m.totalMiles ?? 0), 0);

  return res.status(200).json({
    user: {
      id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url,
      chosenCharacter: user.chosen_character, color: user.color, totalMiles: user.total_miles,
    },
    fellowship: { id: fellowship.id, name: fellowship.name },
    members: memberList,
    fellowshipMiles,
    openedQuests: Array.isArray(user.opened_quests) ? user.opened_quests : [],
    notifiedAchievements: Array.isArray(user.notified_achievements) ? user.notified_achievements : [],
  });
}
