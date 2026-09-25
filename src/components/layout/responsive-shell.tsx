"use client";

import { useSyncExternalStore } from "react";

import { DesktopWindow } from "@/components/layout/desktop-window";
import { MobileBottomnav } from "@/components/layout/mobile-bottomnav";
import { MobileTopbar } from "@/components/layout/mobile-topbar";
import type { Role } from "@/lib/supabase/database.types";

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getDesktopSnapshot() {
  return window.matchMedia("(min-width: 768px)").matches;
}

function getDesktopServerSnapshot() {
  return false;
}

// Memilih chrome mobile atau jendela desktop dari media query yang dibaca
// sinkron (tanpa kedip). Satu cabang saja yang mount agar tidak dobel.
export function ResponsiveShell({
  username,
  role,
  badgeCount,
  children,
}: {
  username: string;
  role: Role;
  badgeCount: number;
  children: React.ReactNode;
}) {
  // useSyncExternalStore: server render cabang mobile, hydration pakai
  // snapshot server (identik, tanpa mismatch), lalu baca viewport asli.
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    getDesktopSnapshot,
    getDesktopServerSnapshot
  );
  const initial = (username.charAt(0) || "?").toUpperCase();
  const bellHref = role === "superadmin" ? "/admin/laporan" : "/laporan/notifikasi";

  if (desktop) {
    return (
      <DesktopWindow role={role} username={username} badgeCount={badgeCount}>
        {children}
      </DesktopWindow>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <MobileTopbar badgeCount={badgeCount} bellHref={bellHref} initial={initial} />
      <main className="flex-1 px-4 pt-6 pb-28">{children}</main>
      <MobileBottomnav role={role} />
    </div>
  );
}
