import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase";
import { readSessionUserId } from "./_lib/http";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const db = getServiceClient();
  const { data: user } = await db
    .from("users")
    .select("id, display_name, avatar_url, chosen_character, total_miles, fellowship_id")
    .eq("id", userId).maybeSingle();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const { data: fellowship } = await db
    .from("fellowship").select("id, name").eq("id", user.fellowship_id).single();

  const { data: members } = await db
    .from("users")
    .select("id, display_name, chosen_character, total_miles")
    .eq("fellowship_id", user.fellowship_id);

  const memberList = (members ?? []).map((m) => ({
    id: m.id, displayName: m.display_name,
    chosenCharacter: m.chosen_character, totalMiles: m.total_miles,
  }));
  const fellowshipMiles = memberList.reduce((s, m) => s + (m.totalMiles ?? 0), 0);

  return res.status(200).json({
    user: {
      id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url,
      chosenCharacter: user.chosen_character, totalMiles: user.total_miles,
    },
    fellowship: { id: fellowship!.id, name: fellowship!.name },
    members: memberList,
    fellowshipMiles,
  });
}
