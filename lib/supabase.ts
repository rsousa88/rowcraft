import { createClient } from "@supabase/supabase-js";

// Server-side client (uses service role — never expose to browser)
export function createSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
