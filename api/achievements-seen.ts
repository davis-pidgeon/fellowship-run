import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";
import { readSessionUserId } from "./_lib/http.js";

// Records which achievements the user has already been shown a notification for,
// so an earned badge only pops once (across sessions and devices).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (!ids.length) return res.status(400).json({ error: "ids required" });

  const db = getServiceClient();
  const { data: user } = await db.from("users").select("notified_achievements").eq("id", userId).maybeSingle();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const current: string[] = Array.isArray(user.notified_achievements) ? user.notified_achievements : [];
  const notifiedAchievements = [...new Set([...current, ...ids])];
  if (notifiedAchievements.length !== current.length) {
    await db.from("users").update({ notified_achievements: notifiedAchievements }).eq("id", userId);
  }
  return res.status(200).json({ notifiedAchievements });
}
