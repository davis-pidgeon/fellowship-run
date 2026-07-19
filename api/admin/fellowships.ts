import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "node:crypto";
import { getServiceClient } from "../_lib/supabase.js";
import { requireAdminUserId } from "../_lib/admin.js";
import { encrypt } from "../_lib/crypto.js";
import { getEnv } from "../_lib/env.js";
import { ACTIVITY_TYPES } from "../../shared/activity-types.js";

const VALID_TYPES = new Set(ACTIVITY_TYPES.map((t) => t.key));

export function isValidActivityTypes(types: unknown): types is string[] {
  return (
    Array.isArray(types) &&
    types.length > 0 &&
    types.every((t) => typeof t === "string" && VALID_TYPES.has(t))
  );
}

export function isValidMultipliers(m: unknown): m is Record<string, number> {
  if (typeof m !== "object" || m === null || Array.isArray(m)) return false;
  return Object.values(m as Record<string, unknown>).every(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getServiceClient();
  const adminId = await requireAdminUserId(req, db as any);
  if (!adminId) return res.status(403).json({ error: "forbidden" });

  if (req.method === "GET") {
    const { data: fellowships } = await db
      .from("fellowship")
      .select("id, name, start_date, allowed_activity_types, activity_multipliers, invite_token, strava_client_id");
    const { data: members } = await db.from("fellowship_members").select("fellowship_id");
    const counts = new Map<string, number>();
    for (const m of members ?? []) counts.set(m.fellowship_id, (counts.get(m.fellowship_id) ?? 0) + 1);
    return res.status(200).json({
      fellowships: (fellowships ?? []).map((f) => ({
        id: f.id, name: f.name, startDate: f.start_date,
        allowedActivityTypes: f.allowed_activity_types,
        activityMultipliers: f.activity_multipliers ?? {},
        inviteToken: f.invite_token,
        hasCustomStravaApp: !!f.strava_client_id,
        memberCount: counts.get(f.id) ?? 0,
      })),
    });
  }

  if (req.method === "POST") {
    const name = (req.body?.name as string) || "";
    const startDate = (req.body?.startDate as string) || "2026-07-01";
    const allowedActivityTypes = req.body?.allowedActivityTypes;
    if (!name) return res.status(400).json({ error: "name required" });
    if (!isValidActivityTypes(allowedActivityTypes)) {
      return res.status(400).json({ error: "invalid activity types" });
    }
    const activityMultipliers = req.body?.activityMultipliers ?? {};
    if (!isValidMultipliers(activityMultipliers)) {
      return res.status(400).json({ error: "invalid multipliers" });
    }
    const stravaClientId = (req.body?.stravaClientId as string) || null;
    const stravaClientSecretRaw = (req.body?.stravaClientSecret as string) || null;
    const stravaClientSecret = stravaClientSecretRaw
      ? encrypt(stravaClientSecretRaw, getEnv("TOKEN_ENCRYPTION_KEY"))
      : null;

    const inviteToken = randomBytes(9).toString("base64url");
    const { data, error } = await db
      .from("fellowship")
      .insert({
        name, start_date: startDate, allowed_activity_types: allowedActivityTypes,
        activity_multipliers: activityMultipliers,
        invite_token: inviteToken, strava_client_id: stravaClientId, strava_client_secret: stravaClientSecret,
      })
      .select("id").single();
    if (error || !data) return res.status(500).json({ error: "could not create fellowship" });
    return res.status(201).json({ id: data.id, inviteToken });
  }

  if (req.method === "PATCH") {
    const id = req.body?.id as string | undefined;
    if (!id) return res.status(400).json({ error: "id required" });
    const update: Record<string, unknown> = {};
    if (typeof req.body?.name === "string") update.name = req.body.name;
    if (typeof req.body?.startDate === "string") update.start_date = req.body.startDate;
    if (req.body?.allowedActivityTypes !== undefined) {
      if (!isValidActivityTypes(req.body.allowedActivityTypes)) {
        return res.status(400).json({ error: "invalid activity types" });
      }
      update.allowed_activity_types = req.body.allowedActivityTypes;
    }
    if (req.body?.activityMultipliers !== undefined) {
      if (!isValidMultipliers(req.body.activityMultipliers)) {
        return res.status(400).json({ error: "invalid multipliers" });
      }
      update.activity_multipliers = req.body.activityMultipliers;
    }
    if (typeof req.body?.stravaClientId === "string") update.strava_client_id = req.body.stravaClientId || null;
    if (typeof req.body?.stravaClientSecret === "string" && req.body.stravaClientSecret) {
      update.strava_client_secret = encrypt(req.body.stravaClientSecret, getEnv("TOKEN_ENCRYPTION_KEY"));
    }
    const { error } = await db.from("fellowship").update(update).eq("id", id);
    if (error) return res.status(500).json({ error: "could not update fellowship" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
