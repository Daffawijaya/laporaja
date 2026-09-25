"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

// Penanda agar keluar secara sengaja tidak dianggap sesi berakhir.
export const MANUAL_SIGNOUT_KEY = "laporaja:manual-signout";

// Menjaga auth state client tetap sinkron dengan server.
// Setiap perubahan sesi (masuk, keluar, refresh token) memicu
// pemuatan ulang Server Component sehingga proteksi rute
// selalu membaca sesi terbaru dari cookie httpOnly.
export function AuthListener() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // INITIAL_SESSION hanya status awal, bukan perubahan. Merefresh di sini
      // berisiko memicu loop refresh yang mengaduk cookie sesi.
      if (event === "INITIAL_SESSION") return;

      if (event === "SIGNED_OUT") {
        // Keluar lewat tombol sudah menangani pengalihan sendiri.
        if (window.sessionStorage.getItem(MANUAL_SIGNOUT_KEY) === "1") {
          window.sessionStorage.removeItem(MANUAL_SIGNOUT_KEY);
          return;
        }
        if (pathname === "/login") return;
        // Sesi berakhir tanpa aksi pengguna: antar kembali ke halaman masuk
        // dengan keterangan singkat.
        router.replace("/login?expired=1");
        return;
      }

      router.refresh();
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [router, pathname]);

  return null;
}
