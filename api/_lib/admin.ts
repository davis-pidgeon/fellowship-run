import { readSessionUserId } from "./http.js";

export interface AdminLookup {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{ data: { is_admin: boolean } | null }>;
      };
    };
  };
}

export async function requireAdminUserId(
  req: { headers: Record<string, string | string[] | undefined> },
  db: AdminLookup
): Promise<string | null> {
  const userId = await readSessionUserId(req);
  if (!userId) return null;
  const { data } = await db.from("users").select("is_admin").eq("id", userId).maybeSingle();
  if (!data?.is_admin) return null;
  return userId;
}
