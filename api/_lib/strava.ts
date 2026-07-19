import type { RunActivity } from "../../shared/types.js";
import { metersToMiles } from "../../shared/units.js";

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch seconds
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;
}

export interface StravaDeps {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

const TOKEN_URL = "https://www.strava.com/oauth/token";
const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";


async function postToken(body: Record<string, string>, deps: StravaDeps) {
  const f = deps.fetchImpl ?? fetch;
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: deps.clientId, client_secret: deps.clientSecret, ...body }),
  });
  if (!res.ok) throw new Error(`Strava token request failed: ${res.status}`);
  return res.json();
}

export async function exchangeCode(code: string, deps: StravaDeps) {
  const data = await postToken({ code, grant_type: "authorization_code" }, deps);
  const tokens: StravaTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
  const a = data.athlete;
  const athlete: StravaAthlete = {
    id: a.id, firstname: a.firstname, lastname: a.lastname, profile: a.profile,
  };
  return { tokens, athlete };
}

export async function refreshTokens(refreshToken: string, deps: StravaDeps): Promise<StravaTokens> {
  const data = await postToken({ grant_type: "refresh_token", refresh_token: refreshToken }, deps);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at };
}

export async function fetchRunsSince(
  accessToken: string,
  afterEpoch: number,
  allowedTypes: Set<string>,
  fetchImpl?: typeof fetch
): Promise<RunActivity[]> {
  const f = fetchImpl ?? fetch;
  const perPage = 200;
  const runs: RunActivity[] = [];
  for (let page = 1; ; page++) {
    const url = `${ACTIVITIES_URL}?after=${afterEpoch}&per_page=${perPage}&page=${page}`;
    const res = await f(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) throw new Error("Strava rate limit reached");
    if (!res.ok) throw new Error(`Strava activities request failed: ${res.status}`);
    const batch = (await res.json()) as Array<{
      id: number; type: string; sport_type?: string; distance: number; start_date: string; name: string; moving_time?: number;
    }>;
    for (const a of batch) {
      const sportType = a.sport_type ?? a.type;
      if (allowedTypes.has(sportType)) {
        runs.push({
          stravaActivityId: a.id,
          distanceMiles: metersToMiles(a.distance),
          runDate: a.start_date,
          name: a.name,
          movingSeconds: a.moving_time,
          sportType,
        });
      }
    }
    if (batch.length < perPage) break;
  }
  return runs;
}
