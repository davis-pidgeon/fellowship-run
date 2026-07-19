import type { CharacterKey, FellowshipBadge } from "../shared/types";

export interface RunStats {
  runs: number;
  longestMiles: number;
  avgMiles: number;
  avgPaceSecPerMile: number | null;
  weekStreak: number;
}
export interface RecentActivity {
  name: string;
  date: string;
}
export interface Member {
  id: string;
  displayName: string;
  chosenCharacter: CharacterKey | null;
  color: string | null;
  totalMiles: number;
  openedQuests: string[];
  stats: RunStats;
  activities: RecentActivity[];
}
export interface FellowshipSummary {
  id: string;
  name: string;
}
export interface MeResponse {
  user: { id: string; displayName: string; avatarUrl: string | null; chosenCharacter: CharacterKey | null; color: string | null; totalMiles: number };
  isAdmin: boolean;
  fellowships: FellowshipSummary[];
  fellowship: FellowshipSummary;
  members: Member[];
  fellowshipMiles: number;
  openedQuests: string[];
  notifiedAchievements: string[];
}
export interface Ghost {
  userId: string;
  fellowshipId: string;
  fellowshipName: string;
  displayName: string;
  chosenCharacter: CharacterKey | null;
  color: string | null;
  totalMiles: number;
}
export interface GlobalResponse {
  user: MeResponse["user"];
  isAdmin: boolean;
  fellowships: FellowshipSummary[];
  global: true;
  ghosts: Ghost[];
}
export interface SyncResponse {
  importedCount: number;
  totalMiles: number;
  fellowshipMiles: number;
  newBadges: FellowshipBadge[];
}
export interface AdminFellowship {
  id: string;
  name: string;
  startDate: string;
  allowedActivityTypes: string[];
  inviteToken: string;
  hasCustomStravaApp: boolean;
  memberCount: number;
}
export interface AdminUser {
  id: string;
  displayName: string;
  fellowships: FellowshipSummary[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export function stravaAuthUrl(clientId?: string | null, inviteToken?: string): string {
  const params = new URLSearchParams({
    client_id: clientId ?? import.meta.env.VITE_STRAVA_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_STRAVA_REDIRECT_URI,
    response_type: "code",
    scope: "activity:read",
    approval_prompt: "auto",
  });
  if (inviteToken) params.set("state", inviteToken);
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export const api = {
  me: (fellowshipId?: string) =>
    fetch(`/api/me${fellowshipId ? `?fellowshipId=${encodeURIComponent(fellowshipId)}` : ""}`, { credentials: "include" })
      .then((r) => (r.status === 401 ? null : json<MeResponse>(r))),
  meGlobal: () =>
    fetch("/api/me?view=global", { credentials: "include" }).then((r) => (r.status === 401 ? null : json<GlobalResponse>(r))),
  sync: (fellowshipId: string) =>
    fetch(`/api/sync?fellowshipId=${encodeURIComponent(fellowshipId)}`, { method: "POST", credentials: "include" }).then(json<SyncResponse>),
  questOpen: (questId: string, fellowshipId: string) =>
    fetch("/api/quest-open", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId, fellowshipId }),
    }).then(json<{ openedQuests: string[] }>),
  achievementsSeen: (ids: string[], fellowshipId: string) =>
    fetch("/api/achievements-seen", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, fellowshipId }),
    }).then(json<{ notifiedAchievements: string[] }>),
  chooseCharacter: (character: CharacterKey, color: string) =>
    fetch("/api/character", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character, color }),
    }).then(json<{ ok: true }>),
  checkInvite: (token: string) =>
    fetch(`/api/invite?token=${encodeURIComponent(token)}`).then(json<{ valid: boolean; fellowshipName?: string; stravaClientId: string | null }>),
  logout: () => fetch("/api/auth/logout", { method: "POST", credentials: "include" }),

  adminListFellowships: () => fetch("/api/admin/fellowships", { credentials: "include" }).then(json<{ fellowships: AdminFellowship[] }>),
  adminCreateFellowship: (body: { name: string; startDate: string; allowedActivityTypes: string[]; stravaClientId?: string; stravaClientSecret?: string }) =>
    fetch("/api/admin/fellowships", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(json<{ id: string; inviteToken: string }>),
  adminUpdateFellowship: (body: { id: string; name?: string; startDate?: string; allowedActivityTypes?: string[]; stravaClientId?: string; stravaClientSecret?: string }) =>
    fetch("/api/admin/fellowships", {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(json<{ ok: true }>),
  adminListMembers: () => fetch("/api/admin/members", { credentials: "include" }).then(json<{ users: AdminUser[] }>),
  adminAddMember: (userId: string, fellowshipId: string) =>
    fetch("/api/admin/members", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, fellowshipId }),
    }).then(json<{ ok: true }>),
  adminRemoveMember: (userId: string, fellowshipId: string) =>
    fetch("/api/admin/members", {
      method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, fellowshipId }),
    }).then(json<{ ok: true }>),
};
