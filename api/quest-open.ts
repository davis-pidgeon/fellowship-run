import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";
import { readSessionUserId } from "./_lib/http.js";

// Records that the current user has opened (picked up) a side-quest note, so it
// leaves the map and stays in their backpack across sessions and devices.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const questId = String(body.questId ?? "");
  if (!questId) return res.status(400).json({ error: "questId required" });

  const db = getServiceClient();
  const { data: user } = await db.from("users").select("opened_quests").eq("id", userId).maybeSingle();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const current: string[] = Array.isArray(user.opened_quests) ? user.opened_quests : [];
  const openedQuests = current.includes(questId) ? current : [...current, questId];
  if (openedQuests.length !== current.length) {
    await db.from("users").update({ opened_quests: openedQuests }).eq("id", userId);
  }
  return res.status(200).json({ openedQuests });
}
