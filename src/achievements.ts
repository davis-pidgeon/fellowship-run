import type { Member } from "./api-client";
import { SIDE_QUESTS, ARCS, type QuestArc } from "../shared/sidequests";

export interface Achievement {
  id: string;
  icon: string;
  name: string;
  description: string;
}
export interface EarnedAchievement extends Achievement {
  earned: boolean;
}

// Per-collection completion badges (one per story thread).
const THREAD_BADGES: { arc: QuestArc; icon: string; name: string }[] = [
  { arc: "smeagol", icon: "💍", name: "The Ring's Long Shadow" },
  { arc: "bilbo", icon: "📕", name: "There and Back Again" },
  { arc: "bombadil", icon: "🎵", name: "Songs of the Eldest" },
  { arc: "dwarves", icon: "⛏️", name: "Chronicles of Khazad-dûm" },
  { arc: "elves", icon: "✨", name: "The Fading Light" },
  { arc: "wizards", icon: "🪄", name: "Secrets of the Istari" },
  { arc: "faramir", icon: "🛡️", name: "The Captain's Honor" },
  { arc: "orcs", icon: "🗡️", name: "Whispers of Mordor" },
  { arc: "general", icon: "🗺️", name: "Wayfarer's Log" },
];
function arcComplete(arc: QuestArc, opened: Set<string>): boolean {
  const all = SIDE_QUESTS.filter((q) => q.arc === arc);
  return all.length > 0 && all.every((q) => opened.has(q.id));
}

// All badges are earned purely from data already in /api/me (miles, run stats
// incl. week streak, and collected notes) — no extra endpoint needed.
export function computeAchievements(m: Member): EarnedAchievement[] {
  const s = m.stats;
  const notes = m.openedQuests.length;
  const opened = new Set(m.openedQuests);
  const wk = s.weekStreak ?? 0;
  const allNotes = SIDE_QUESTS.length;

  const defs: [Achievement, boolean][] = [
    [{ id: "first-run", icon: "👣", name: "First Steps", description: "Log your first run." }, s.runs >= 1],
    [{ id: "ten-runs", icon: "📅", name: "Getting Consistent", description: "Log 10 runs." }, s.runs >= 10],
    [{ id: "runs-25", icon: "🔥", name: "Devoted", description: "Log 25 runs." }, s.runs >= 25],
    [{ id: "run-5k", icon: "🏃", name: "5K Strong", description: "Finish a run of 3.1 mi or more." }, s.longestMiles >= 3.1],
    [{ id: "run-10k", icon: "🏅", name: "10K Club", description: "Finish a run of 6.2 mi or more." }, s.longestMiles >= 6.2],
    [{ id: "run-half", icon: "🎽", name: "Half Marathoner", description: "Finish a run of 13.1 mi or more." }, s.longestMiles >= 13.1],
    [{ id: "swift", icon: "⚡", name: "Swift of Foot", description: "Average pace under 10:00 / mi." }, s.avgPaceSecPerMile != null && s.avgPaceSecPerMile < 600],
    // week streaks
    [{ id: "streak-10", icon: "📆", name: "Ten-Week Streak", description: "Run in 10 consecutive weeks." }, wk >= 10],
    [{ id: "streak-20", icon: "📆", name: "Twenty-Week Streak", description: "Run in 20 consecutive weeks." }, wk >= 20],
    [{ id: "streak-30", icon: "📆", name: "Thirty-Week Streak", description: "Run in 30 consecutive weeks." }, wk >= 30],
    [{ id: "streak-40", icon: "📆", name: "Forty-Week Streak", description: "Run in 40 consecutive weeks." }, wk >= 40],
    [{ id: "streak-52", icon: "🏆", name: "A Full Year", description: "Run every week for 52 consecutive weeks." }, wk >= 52],
    // journey mileage
    [{ id: "mi-50", icon: "🌄", name: "Well Underway", description: "Travel 50 miles." }, m.totalMiles >= 50],
    [{ id: "mi-100", icon: "🧭", name: "Seasoned Traveler", description: "Travel 100 miles." }, m.totalMiles >= 100],
    [{ id: "mi-500", icon: "🥾", name: "Long Hauler", description: "Travel 500 miles." }, m.totalMiles >= 500],
    [{ id: "mi-1000", icon: "🌍", name: "Thousand-Miler", description: "Travel 1,000 miles." }, m.totalMiles >= 1000],
    [{ id: "mi-1500", icon: "🗺️", name: "The Long Road", description: "Travel 1,500 miles." }, m.totalMiles >= 1500],
    // landmarks
    [{ id: "rivendell", icon: "🏰", name: "Elf-friend", description: "Reach Rivendell." }, m.totalMiles >= 458],
    [{ id: "moria", icon: "⛏️", name: "Delver", description: "Cross the Mines of Moria." }, m.totalMiles >= 800],
    [{ id: "halfway", icon: "⚖️", name: "Halfway to Doom", description: "Pass the journey's halfway mark." }, m.totalMiles >= 889.5],
    [{ id: "blackgate", icon: "🏴", name: "At the Black Gate", description: "Reach the Black Gate." }, m.totalMiles >= 1650],
    [{ id: "mountdoom", icon: "💍", name: "Ring-bearer", description: "Complete the journey to Mount Doom." }, m.totalMiles >= 1779],
    // collection counts
    [{ id: "first-note", icon: "✉️", name: "Curious", description: "Collect your first note." }, notes >= 1],
    [{ id: "notes-10", icon: "📜", name: "Note Collector", description: "Collect 10 notes." }, notes >= 10],
    [{ id: "notes-20", icon: "📚", name: "Avid Collector", description: "Collect 20 notes." }, notes >= 20],
    [{ id: "notes-30", icon: "🗄️", name: "Archivist", description: "Collect 30 notes." }, notes >= 30],
    [{ id: "notes-all", icon: "🏆", name: "Completionist", description: `Collect all ${allNotes} notes.` }, notes >= allNotes && SIDE_QUESTS.every((q) => opened.has(q.id))],
  ];

  // one completion badge per story thread
  for (const t of THREAD_BADGES) {
    defs.push([
      { id: `thread-${t.arc}`, icon: t.icon, name: t.name, description: `Collect every note in the ${ARCS[t.arc].title} thread.` },
      arcComplete(t.arc, opened),
    ]);
  }

  return defs.map(([a, earned]) => ({ ...a, earned }));
}

// Flat lookup used by the "achievement unlocked" toasts.
export const ACHIEVEMENTS_BY_ID: Record<string, Achievement> = Object.fromEntries(
  computeAchievements({
    totalMiles: 0, openedQuests: [],
    stats: { runs: 0, longestMiles: 0, avgMiles: 0, avgPaceSecPerMile: null, weekStreak: 0 },
  } as unknown as Member).map((a) => [a.id, { id: a.id, icon: a.icon, name: a.name, description: a.description }])
);
