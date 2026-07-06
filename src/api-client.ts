import type { CharacterKey, Milestone } from "../shared/types";

export interface RunStats {
  runs: number;
  longestMiles: number;
  avgMiles: number;
  avgPaceSecPerMile: number | null; // null until a run with duration is synced
  weekStreak: number; // longest run of consecutive weeks with a run
}
export interface RecentActivity {
  name: string;
  date: string; // ISO
}
export interface Member {
  id: string;
  displayName: string;
  chosenCharacter: CharacterKey | null;
  color: string | null;
  totalMiles: number;
  openedQuests: string[];
  stats: RunStats;
  activities: RecentActivity[]; // all, newest first (names = the character's sayings)
}
export interface MeResponse {
  user: { id: string; displayName: string; avatarUrl: string | null; chosenCharacter: CharacterKey | null; color: string | null; totalMiles: number };
  fellowship: { id: string; name: string };
  members: Member[];
  fellowshipMiles: number;
  openedQuests: string[];
  notifiedAchievements: string[];
}
export interface SyncResponse {
  importedCount: number;
  totalMiles: number;
  fellowshipMiles: number;
  newBadges: Milestone[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export function stravaAuthUrl(inviteToken?: string): string {
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_STRAVA_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_STRAVA_REDIRECT_URI,
    response_type: "code",
    scope: "activity:read",
    approval_prompt: "auto",
  });
  if (inviteToken) params.set("state", inviteToken);
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export const api = {
  me: () => fetch("/api/me", { credentials: "include" }).then((r) => (r.status === 401 ? null : json<MeResponse>(r))),
  sync: () => fetch("/api/sync", { method: "POST", credentials: "include" }).then(json<SyncResponse>),
  questOpen: (questId: string) =>
    fetch("/api/quest-open", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId }),
    }).then(json<{ openedQuests: string[] }>),
  achievementsSeen: (ids: string[]) =>
    fetch("/api/achievements-seen", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then(json<{ notifiedAchievements: string[] }>),
  chooseCharacter: (character: CharacterKey, color: string) =>
    fetch("/api/character", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character, color }),
    }).then(json<{ ok: true }>),
  createFellowship: (name: string) =>
    fetch("/api/invite", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(json<{ inviteToken: string; fellowshipId: string }>),
  checkInvite: (token: string) =>
    fetch(`/api/invite?token=${encodeURIComponent(token)}`).then(json<{ valid: boolean; fellowshipName?: string }>),
  logout: () => fetch("/api/auth/logout", { method: "POST", credentials: "include" }),
};
