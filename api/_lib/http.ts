import { verifySession } from "./session.js";
import { getEnv } from "./env.js";

export const SESSION_COOKIE = "fr_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  }
  return out;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export const CLEAR_COOKIE = `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

export async function readSessionUserId(req: {
  headers: Record<string, string | string[] | undefined>;
}): Promise<string | null> {
  const raw = req.headers.cookie;
  const cookieHeader = Array.isArray(raw) ? raw.join("; ") : raw;
  const token = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!token) return null;
  const session = await verifySession(token, getEnv("SESSION_SECRET"));
  return session?.userId ?? null;
}
