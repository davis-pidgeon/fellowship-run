import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readSessionUserId } from "./_lib/http";
import { getServiceClient } from "./_lib/supabase";
import { getEnv } from "./_lib/env";
import { decrypt, encrypt } from "./_lib/crypto";
import { refreshTokens, fetchRunsSince } from "./_lib/strava";
import { computeSync } from "../shared/sync-core";
import { crossedLandmarks } from "../shared/milestones";
import { ROUTE } from "../shared/route";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const db = getServiceClient();
  const key = getEnv("TOKEN_ENCRYPTION_KEY");

  const { data: user } = await db
    .from("users")
    .select("id, fellowship_id, strava_access_token, strava_refresh_token, token_expires_at, last_sync_at, total_miles")
    .eq("id", userId)
    .single();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  // Refresh token if expired (with 60s buffer)
  let accessToken = decrypt(user.strava_access_token, key);
  const expiresMs = new Date(user.token_expires_at).getTime();
  if (Date.now() >= expiresMs - 60_000) {
    try {
      const refreshed = await refreshTokens(decrypt(user.strava_refresh_token, key), {
        clientId: getEnv("STRAVA_CLIENT_ID"),
        clientSecret: getEnv("STRAVA_CLIENT_SECRET"),
      });
      accessToken = refreshed.accessToken;
      await db
        .from("users")
        .update({
          strava_access_token: encrypt(refreshed.accessToken, key),
          strava_refresh_token: encrypt(refreshed.refreshToken, key),
          token_expires_at: new Date(refreshed.expiresAt * 1000).toISOString(),
        })
        .eq("id", userId);
    } catch {
      return res.status(409).json({ error: "reconnect" });
    }
  }

  // Fetch runs since last sync, but never earlier than the journey start date.
  // JOURNEY_START_DATE (ISO, e.g. "2026-07-01") floors the import so old runs
  // from long before the quest began are never counted.
  const journeyStart = process.env.JOURNEY_START_DATE
    ? Math.floor(new Date(process.env.JOURNEY_START_DATE).getTime() / 1000)
    : 0;
  const lastSync = user.last_sync_at
    ? Math.floor(new Date(user.last_sync_at).getTime() / 1000)
    : 0;
  const afterEpoch = Math.max(lastSync, journeyStart);
  let fetched;
  try {
    fetched = await fetchRunsSince(accessToken, afterEpoch);
  } catch (e) {
    if (e instanceof Error && e.message.includes("rate limit")) {
      return res.status(429).json({ error: "rate_limited" });
    }
    return res.status(502).json({ error: "strava_unavailable" });
  }

  // Load existing activity IDs for deduplication
  const { data: existing } = await db
    .from("activities")
    .select("strava_activity_id")
    .eq("user_id", userId);
  const existingIds = (existing ?? []).map((a: { strava_activity_id: number }) => a.strava_activity_id);

  const result = computeSync({
    fetched,
    existingActivityIds: existingIds,
    previousTotalMiles: user.total_miles,
    route: ROUTE,
  });

  // Insert new activities
  if (result.newActivities.length > 0) {
    await db.from("activities").insert(
      result.newActivities.map((a) => ({
        user_id: userId,
        strava_activity_id: a.stravaActivityId,
        distance_miles: a.distanceMiles,
        run_date: a.runDate,
        name: a.name,
      }))
    );
  }

  // Update user's total_miles and last_sync_at
  await db
    .from("users")
    .update({
      total_miles: result.newTotalMiles,
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", userId);

  // Personal (user-scope) milestone awards — idempotent via unique constraint
  for (const m of result.crossed) {
    await db.from("milestone_awards").upsert(
      {
        scope: "user",
        user_id: userId,
        fellowship_id: user.fellowship_id,
        landmark_id: m.landmarkId,
      },
      { onConflict: "scope,user_id,landmark_id", ignoreDuplicates: true }
    );
  }

  // Fellowship-level crossings
  const { data: members } = await db
    .from("users")
    .select("total_miles")
    .eq("fellowship_id", user.fellowship_id);
  const fellowshipMiles = (members ?? []).reduce(
    (s: number, m: { total_miles: number | null }) => s + (m.total_miles ?? 0),
    0
  );
  const priorFellowshipMiles =
    fellowshipMiles -
    result.newActivities.reduce((s, a) => s + a.distanceMiles, 0);
  const fellowshipCrossed = crossedLandmarks(priorFellowshipMiles, fellowshipMiles, ROUTE);

  // Fellowship-scope milestone awards — check-before-insert to handle NULL user_id
  // (Postgres treats NULLs as distinct in unique constraints, so ON CONFLICT would not
  // deduplicate fellowship rows; we guard idempotency with an explicit existence check.)
  for (const m of fellowshipCrossed) {
    const { data: existingAward } = await db
      .from("milestone_awards")
      .select("id")
      .eq("scope", "fellowship")
      .eq("fellowship_id", user.fellowship_id)
      .eq("landmark_id", m.landmarkId)
      .maybeSingle();
    if (!existingAward) {
      await db.from("milestone_awards").insert({
        scope: "fellowship",
        user_id: null,
        fellowship_id: user.fellowship_id,
        landmark_id: m.landmarkId,
      });
    }
  }

  const badgeMap = new Map<string, (typeof result.crossed)[number]>();
  for (const m of result.crossed) badgeMap.set(m.landmarkId, m);
  for (const m of fellowshipCrossed) if (!badgeMap.has(m.landmarkId)) badgeMap.set(m.landmarkId, m);

  return res.status(200).json({
    importedCount: result.newActivities.length,
    totalMiles: result.newTotalMiles,
    fellowshipMiles,
    newBadges: [...badgeMap.values()],
  });
}
