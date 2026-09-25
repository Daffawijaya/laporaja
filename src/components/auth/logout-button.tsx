"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { MANUAL_SIGNOUT_KEY } from "@/components/auth/auth-listener";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      // Tandai keluar sengaja agar tidak ditampilkan sebagai sesi berakhir.
      window.sessionStorage.setItem(MANUAL_SIGNOUT_KEY, "1");
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Diabaikan: pengguna tetap diarahkan ke halaman masuk.
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <Button
      variant="ghost"
      onClick={handleLogout}
      disabled={busy}
      aria-label="Keluar dari aplikasi"
    >
      <LogOut aria-hidden="true" />
      {busy ? "Keluar..." : "Keluar"}
    </Button>
  );
}
