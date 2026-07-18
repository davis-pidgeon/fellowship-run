import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readSessionUserId } from "./_lib/http.js";
import { getServiceClient } from "./_lib/supabase.js";
import { getEnv } from "./_lib/env.js";
import { decrypt, encrypt } from "./_lib/crypto.js";
import { refreshTokens, fetchRunsSince } from "./_lib/strava.js";
import {
  memberTotal, earliestStartDate, unionActivityTypes, newActivitiesOnly, computeFellowshipTotals,
} from "../shared/fellowship-sync.js";
import { crossedLandmarks } from "../shared/milestones.js";
import { ROUTE } from "../shared/route.js";
import type { Fellowship, RunActivity } from "../shared/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });
  const viewFellowshipId = req.query.fellowshipId as string | undefined;

  const db = getServiceClient();
  const key = getEnv("TOKEN_ENCRYPTION_KEY");

  const { data: user } = await db
    .from("users")
    .select("id, strava_access_token, strava_refresh_token, token_expires_at, strava_client_id, strava_client_secret")
    .eq("id", userId).single();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const { data: memberships } = await db
    .from("fellowship_members")
    .select("fellowship:fellowship_id(id, name, start_date, allowed_activity_types)")
    .eq("user_id", userId);
  const fellowships: (Fellowship & { name: string })[] = (memberships ?? [])
    .map((m) => m.fellowship as unknown as { id: string; name: string; start_date: string; allowed_activity_types: string[] } | null)
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => ({ id: f.id, name: f.name, startDate: f.start_date, allowedActivityTypes: f.allowed_activity_types }));
  if (fellowships.length === 0) return res.status(500).json({ error: "no fellowship membership" });

  const appClientId = user.strava_client_id ?? getEnv("STRAVA_CLIENT_ID");
  const appClientSecret = user.strava_client_secret
    ? decrypt(user.strava_client_secret, key)
    : getEnv("STRAVA_CLIENT_SECRET");

  let accessToken = decrypt(user.strava_access_token, key);
  const expiresMs = new Date(user.token_expires_at).getTime();
  if (Date.now() >= expiresMs - 60_000) {
    try {
      const refreshed = await refreshTokens(decrypt(user.strava_refresh_token, key), {
        clientId: appClientId, clientSecret: appClientSecret,
      });
      accessToken = refreshed.accessToken;
      await db.from("users").update({
        strava_access_token: encrypt(refreshed.accessToken, key),
        strava_refresh_token: encrypt(refreshed.refreshToken, key),
        token_expires_at: new Date(refreshed.expiresAt * 1000).toISOString(),
      }).eq("id", userId);
    } catch {
      return res.status(409).json({ error: "reconnect" });
    }
  }

  const afterEpoch = Math.floor(new Date(earliestStartDate(fellowships)).getTime() / 1000);
  const allowedTypes = new Set(unionActivityTypes(fellowships));
  let fetched;
  try {
    fetched = await fetchRunsSince(accessToken, afterEpoch, allowedTypes);
  } catch (e) {
    if (e instanceof Error && e.message.includes("rate limit")) return res.status(429).json({ error: "rate_limited" });
    return res.status(502).json({ error: "strava_unavailable" });
  }

  const { data: existingRows } = await db.from("activities").select("strava_activity_id").eq("user_id", userId);
  const existingIds = (existingRows ?? []).map((a: { strava_activity_id: number }) => a.strava_activity_id);
  const newActivities = newActivitiesOnly(fetched, existingIds);

  if (newActivities.length > 0) {
    await db.from("activities").insert(
      newActivities.map((a) => ({
        user_id: userId,
        strava_activity_id: a.stravaActivityId,
        distance_miles: a.distanceMiles,
        run_date: a.runDate,
        name: a.name,
        moving_seconds: a.movingSeconds ?? null,
        sport_type: a.sportType,
      }))
    );
  }

  // Backfill duration on already-imported runs (parity with the old behavior).
  const existingSet = new Set(existingIds);
  for (const a of fetched) {
    if (existingSet.has(a.stravaActivityId) && a.movingSeconds != null) {
      await db.from("activities").update({ moving_seconds: a.movingSeconds })
        .eq("user_id", userId).eq("strava_activity_id", a.stravaActivityId);
    }
  }

  const { data: allActivityRows } = await db
    .from("activities").select("strava_activity_id, distance_miles, run_date, sport_type").eq("user_id", userId);
  const activitiesAfter: RunActivity[] = (allActivityRows ?? []).map((a) => ({
    stravaActivityId: a.strava_activity_id, distanceMiles: a.distance_miles,
    runDate: a.run_date, name: "", sportType: a.sport_type,
  }));
  const addedIds = new Set(newActivities.map((a) => a.stravaActivityId));
  const activitiesBefore = activitiesAfter.filter((a) => !addedIds.has(a.stravaActivityId));

  const perFellowship = computeFellowshipTotals(fellowships, activitiesBefore, activitiesAfter, ROUTE);

  const newBadges: { fellowshipId: string; fellowshipName: string; milestone: (typeof perFellowship)[number]["crossed"][number] }[] = [];
  let responseTotalMiles = 0;
  let responseFellowshipMiles = 0;

  for (const result of perFellowship) {
    const fellowship = fellowships.find((f) => f.id === result.fellowshipId)!;
    if (fellowship.id === viewFellowshipId) responseTotalMiles = result.newTotalMiles;

    for (const m of result.crossed) {
      await db.from("milestone_awards").upsert(
        { scope: "user", user_id: userId, fellowship_id: fellowship.id, landmark_id: m.landmarkId },
        { onConflict: "scope,user_id,fellowship_id,landmark_id", ignoreDuplicates: true }
      );
      newBadges.push({ fellowshipId: fellowship.id, fellowshipName: fellowship.name, milestone: m });
    }

    // Fellowship-wide pooled total and crossings.
    const { data: fellowshipMembers } = await db.from("fellowship_members").select("user_id").eq("fellowship_id", fellowship.id);
    const memberIds = (fellowshipMembers ?? []).map((m: { user_id: string }) => m.user_id);
    const { data: memberActivities } = await db
      .from("activities").select("user_id, distance_miles, run_date, sport_type").in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
    const allMemberActivities: RunActivity[] = (memberActivities ?? []).map((a) => ({
      stravaActivityId: 0, distanceMiles: a.distance_miles, runDate: a.run_date, name: "", sportType: a.sport_type,
    }));
    const pooledAfter = memberTotal(allMemberActivities, fellowship);
    // The syncing user is always a member of every fellowship in this loop
    // (fellowships came from their own memberships), and this endpoint only
    // ever adds activities for that one user — so "before" is always the
    // pooled total minus exactly what this sync just added.
    const addedPooled = newActivities.reduce((s, a) => s + a.distanceMiles, 0);
    const pooledBefore = pooledAfter - addedPooled;
    if (fellowship.id === viewFellowshipId) responseFellowshipMiles = pooledAfter;

    for (const m of crossedLandmarks(pooledBefore, pooledAfter, ROUTE)) {
      const { data: existingAward } = await db
        .from("milestone_awards").select("id")
        .eq("scope", "fellowship").eq("fellowship_id", fellowship.id).eq("landmark_id", m.landmarkId).maybeSingle();
      if (!existingAward) {
        await db.from("milestone_awards").insert({ scope: "fellowship", user_id: null, fellowship_id: fellowship.id, landmark_id: m.landmarkId });
        newBadges.push({ fellowshipId: fellowship.id, fellowshipName: fellowship.name, milestone: m });
      }
    }
  }

  return res.status(200).json({
    importedCount: newActivities.length,
    totalMiles: responseTotalMiles,
    fellowshipMiles: responseFellowshipMiles,
    newBadges,
  });
}
