"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Menjaga auth state client tetap sinkron dengan server.
// Setiap perubahan sesi (masuk, keluar, refresh token) memicu
// pemuatan ulang Server Component sehingga proteksi rute
// selalu membaca sesi terbaru dari cookie httpOnly.
export function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // INITIAL_SESSION hanya status awal, bukan perubahan. Merefresh di sini
      // berisiko memicu loop refresh yang mengaduk cookie sesi.
      if (event === "INITIAL_SESSION") return;
      router.refresh();
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
