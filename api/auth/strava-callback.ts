import type { VercelRequest, VercelResponse } from "@vercel/node";
import { exchangeCode } from "../_lib/strava.js";
import { encrypt, decrypt } from "../_lib/crypto.js";
import { signSession } from "../_lib/session.js";
import { sessionCookie } from "../_lib/http.js";
import { getServiceClient } from "../_lib/supabase.js";
import { getEnv } from "../_lib/env.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string | undefined;
  const inviteToken = req.query.state as string | undefined;
  if (!code) return res.redirect("/?error=oauth");

  const db = getServiceClient();
  const key = getEnv("TOKEN_ENCRYPTION_KEY");

  // Resolve which Strava app to authenticate against: the fellowship behind
  // the invite link if it has one configured, otherwise the default app.
  let fellowshipId: string | null = null;
  let appClientId = getEnv("STRAVA_CLIENT_ID");
  let appClientSecret = getEnv("STRAVA_CLIENT_SECRET");
  let usingDefaultApp = true;
  if (inviteToken) {
    const { data: fellowship } = await db
      .from("fellowship").select("id, strava_client_id, strava_client_secret")
      .eq("invite_token", inviteToken).maybeSingle();
    if (fellowship) {
      fellowshipId = fellowship.id;
      if (fellowship.strava_client_id && fellowship.strava_client_secret) {
        appClientId = fellowship.strava_client_id;
        appClientSecret = decrypt(fellowship.strava_client_secret, key);
        usingDefaultApp = false;
      }
    }
  }

  let tokens: Awaited<ReturnType<typeof exchangeCode>>["tokens"];
  let athlete: Awaited<ReturnType<typeof exchangeCode>>["athlete"];
  try {
    ({ tokens, athlete } = await exchangeCode(code, { clientId: appClientId, clientSecret: appClientSecret }));
  } catch {
    return res.redirect("/?error=oauth");
  }

  const displayName = `${athlete.firstname} ${athlete.lastname}`.trim();
  const expiresIso = new Date(tokens.expiresAt * 1000).toISOString();
  const appFields = usingDefaultApp
    ? { strava_client_id: null, strava_client_secret: null }
    : { strava_client_id: appClientId, strava_client_secret: encrypt(appClientSecret, key) };

  const { data: existing } = await db
    .from("users").select("id").eq("strava_athlete_id", athlete.id).maybeSingle();

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db.from("users").update({
      display_name: displayName,
      avatar_url: athlete.profile,
      strava_access_token: encrypt(tokens.accessToken, key),
      strava_refresh_token: encrypt(tokens.refreshToken, key),
      token_expires_at: expiresIso,
      ...appFields,
    }).eq("id", userId);
  } else {
    if (!fellowshipId) return res.redirect("/join?error=invite");
    const { data: created, error } = await db.from("users").insert({
      strava_athlete_id: athlete.id,
      display_name: displayName,
      avatar_url: athlete.profile,
      strava_access_token: encrypt(tokens.accessToken, key),
      strava_refresh_token: encrypt(tokens.refreshToken, key),
      token_expires_at: expiresIso,
      ...appFields,
    }).select("id").single();
    if (error || !created) return res.redirect("/?error=signup");
    userId = created.id;
    await db.from("fellowship_members").insert({ user_id: userId, fellowship_id: fellowshipId });
  }

  const session = await signSession(userId, getEnv("SESSION_SECRET"));
  res.setHeader("Set-Cookie", sessionCookie(session));
  return res.redirect("/");
}
