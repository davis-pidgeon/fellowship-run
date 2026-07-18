import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const db = getServiceClient();
  const token = req.query.token as string | undefined;
  if (!token) return res.status(400).json({ valid: false });
  const { data } = await db
    .from("fellowship").select("name, strava_client_id")
    .eq("invite_token", token).maybeSingle();
  return res.status(200).json({
    valid: !!data,
    fellowshipName: data?.name,
    stravaClientId: data?.strava_client_id ?? null,
  });
}
