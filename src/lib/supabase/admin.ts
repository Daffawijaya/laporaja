import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Client service role untuk pekerjaan server tepercaya (kelola Auth dan profil).
// Hanya boleh dipakai di Server Actions / Route Handlers. Jangan impor dari
// Client Component karena service role key tidak boleh sampai ke browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Env belum lengkap. Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local."
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
