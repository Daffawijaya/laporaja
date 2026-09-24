import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env belum diisi. Salin .env.example menjadi .env.local lalu isi nilainya."
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
