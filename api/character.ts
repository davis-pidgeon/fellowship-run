import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase.js";
import { readSessionUserId } from "./_lib/http.js";
import { CHARACTERS, MARKER_COLORS } from "../shared/characters.js";
import type { CharacterKey } from "../shared/types.js";

const VALID = new Set(CHARACTERS.map((c) => c.key));
const VALID_COLORS = new Set(MARKER_COLORS.map((c) => c.hex));

export function isValidCharacter(key: string): key is CharacterKey {
  return VALID.has(key as CharacterKey);
}

export function isValidColor(hex: string): boolean {
  return VALID_COLORS.has(hex);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const character = req.body?.character as string | undefined;
  if (!character || !isValidCharacter(character)) {
    return res.status(400).json({ error: "invalid character" });
  }

  const color = req.body?.color as string | undefined;
  if (!color || !isValidColor(color)) {
    return res.status(400).json({ error: "invalid color" });
  }

  const db = getServiceClient();
  await db.from("users").update({ chosen_character: character, color }).eq("id", userId);
  return res.status(200).json({ ok: true });
}
