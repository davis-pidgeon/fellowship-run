import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase";
import { readSessionUserId } from "./_lib/http";
import { CHARACTERS } from "../shared/characters";
import type { CharacterKey } from "../shared/types";

const VALID = new Set(CHARACTERS.map((c) => c.key));

export function isValidCharacter(key: string): key is CharacterKey {
  return VALID.has(key as CharacterKey);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const character = req.body?.character as string | undefined;
  if (!character || !isValidCharacter(character)) {
    return res.status(400).json({ error: "invalid character" });
  }

  const db = getServiceClient();
  await db.from("users").update({ chosen_character: character }).eq("id", userId);
  return res.status(200).json({ ok: true });
}
