import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

export function getServiceClient(): SupabaseClient {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
