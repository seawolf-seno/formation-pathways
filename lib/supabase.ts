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

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let client: SupabaseClient | undefined = global.__formationSupabase;

// Constructed lazily (not at module load) so importing this module -- e.g.
// via lib/queries.ts, which app/layout.tsx pulls into every route -- never
// throws for pages that don't touch admissions stories; only calling
// getSupabase() does. Cached to survive dev-mode hot reload, same pattern
// as lib/db.ts.
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createSupabase();
    if (process.env.NODE_ENV !== "production") {
      global.__formationSupabase = client;
    }
  }
  return client;
}
