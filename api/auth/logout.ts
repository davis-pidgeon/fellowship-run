import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CLEAR_COOKIE } from "../_lib/http";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Set-Cookie", CLEAR_COOKIE);
  return res.status(204).end();
}
