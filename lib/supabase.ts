import { createClient, SupabaseClient } from "@supabase/supabase-js";

declare global {
  var __formationSupabase: SupabaseClient | undefined;
}

function createSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.local.example to .env.local and fill them in."
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// Reuse a single client across hot reloads in dev, same pattern as lib/db.ts.
export const supabase = global.__formationSupabase ?? createSupabase();
if (process.env.NODE_ENV !== "production") {
  global.__formationSupabase = supabase;
}
