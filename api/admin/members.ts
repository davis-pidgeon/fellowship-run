import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "../_lib/supabase.js";
import { requireAdminUserId } from "../_lib/admin.js";
import { canRemoveMembership } from "../../shared/fellowship-sync.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getServiceClient();
  const adminId = await requireAdminUserId(req, db as any);
  if (!adminId) return res.status(403).json({ error: "forbidden" });

  if (req.method === "GET") {
    const { data: users } = await db.from("users").select("id, display_name");
    const { data: memberships } = await db
      .from("fellowship_members")
      .select("user_id, fellowship_id, fellowship:fellowship_id(id, name)");
    const byUser = new Map<string, { id: string; name: string }[]>();
    for (const m of memberships ?? []) {
      const f = m.fellowship as unknown as { id: string; name: string } | null;
      if (!f) continue;
      const list = byUser.get(m.user_id) ?? [];
      list.push({ id: f.id, name: f.name });
      byUser.set(m.user_id, list);
    }
    return res.status(200).json({
      users: (users ?? []).map((u) => ({
        id: u.id, displayName: u.display_name, fellowships: byUser.get(u.id) ?? [],
      })),
    });
  }

  if (req.method === "POST") {
    const userId = req.body?.userId as string | undefined;
    const fellowshipId = req.body?.fellowshipId as string | undefined;
    if (!userId || !fellowshipId) return res.status(400).json({ error: "userId and fellowshipId required" });
    const { error } = await db
      .from("fellowship_members")
      .upsert({ user_id: userId, fellowship_id: fellowshipId }, { onConflict: "user_id,fellowship_id", ignoreDuplicates: true });
    if (error) return res.status(500).json({ error: "could not add member" });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const userId = req.body?.userId as string | undefined;
    const fellowshipId = req.body?.fellowshipId as string | undefined;
    if (!userId || !fellowshipId) return res.status(400).json({ error: "userId and fellowshipId required" });
    const { count } = await db
      .from("fellowship_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (!canRemoveMembership(count ?? 0)) {
      return res.status(409).json({ error: "last_membership" });
    }
    const { error } = await db
      .from("fellowship_members").delete()
      .eq("user_id", userId).eq("fellowship_id", fellowshipId);
    if (error) return res.status(500).json({ error: "could not remove member" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
