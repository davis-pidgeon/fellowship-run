import type { VercelRequest, VercelResponse } from "@vercel/node";
import { exchangeCode } from "../_lib/strava.js";
import { encrypt } from "../_lib/crypto.js";
import { signSession } from "../_lib/session.js";
import { sessionCookie } from "../_lib/http.js";
import { getServiceClient } from "../_lib/supabase.js";
import { getEnv } from "../_lib/env.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string | undefined;
  const inviteToken = req.query.state as string | undefined;
  if (!code) return res.redirect("/?error=oauth");

  let tokens: Awaited<ReturnType<typeof exchangeCode>>["tokens"];
  let athlete: Awaited<ReturnType<typeof exchangeCode>>["athlete"];
  try {
    ({ tokens, athlete } = await exchangeCode(code, {
      clientId: getEnv("STRAVA_CLIENT_ID"),
      clientSecret: getEnv("STRAVA_CLIENT_SECRET"),
    }));
  } catch {
    return res.redirect("/?error=oauth");
  }

  const db = getServiceClient();
  const key = getEnv("TOKEN_ENCRYPTION_KEY");
  const displayName = `${athlete.firstname} ${athlete.lastname}`.trim();
  const expiresIso = new Date(tokens.expiresAt * 1000).toISOString();

  // Existing user?
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
    }).eq("id", userId);
  } else {
    // New user must present a valid invite token
    const { data: fellowship } = inviteToken
      ? await db.from("fellowship").select("id").eq("invite_token", inviteToken).maybeSingle()
      : { data: null };
    if (!fellowship) return res.redirect("/join?error=invite");

    const { data: created, error } = await db.from("users").insert({
      strava_athlete_id: athlete.id,
      display_name: displayName,
      avatar_url: athlete.profile,
      fellowship_id: fellowship.id,
      strava_access_token: encrypt(tokens.accessToken, key),
      strava_refresh_token: encrypt(tokens.refreshToken, key),
      token_expires_at: expiresIso,
    }).select("id").single();
    if (error || !created) return res.redirect("/?error=signup");
    userId = created.id;
  }

  const session = await signSession(userId, getEnv("SESSION_SECRET"));
  res.setHeader("Set-Cookie", sessionCookie(session));
  return res.redirect("/");
}
