import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "@/config/env";
import type { Database } from "@/lib/supabase/database.types";

let client: SupabaseClient<Database> | undefined;

export function getSupabaseServerClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("O cliente Supabase privilegiado só pode ser executado no servidor.");
  }
  if (!client) {
    const env = getEnv();
    client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "auraplay-api" } },
    });
  }

  return client;
}
