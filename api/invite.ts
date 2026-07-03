import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "node:crypto";
import { getServiceClient } from "./_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getServiceClient();

  if (req.method === "POST") {
    const name = (req.body?.name as string) || "The Fellowship";
    const inviteToken = randomBytes(9).toString("base64url");
    const { data, error } = await db
      .from("fellowship").insert({ name, invite_token: inviteToken })
      .select("id").single();
    if (error || !data) return res.status(500).json({ error: "could not create fellowship" });
    return res.status(201).json({ inviteToken, fellowshipId: data.id });
  }

  if (req.method === "GET") {
    const token = req.query.token as string | undefined;
    if (!token) return res.status(400).json({ valid: false });
    const { data } = await db
      .from("fellowship").select("name").eq("invite_token", token).maybeSingle();
    return res.status(200).json({ valid: !!data, fellowshipName: data?.name });
  }

  return res.status(405).end();
}
