import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { MobileBottomnav } from "@/components/layout/mobile-bottomnav";
import { MobileTopbar } from "@/components/layout/mobile-topbar";
import type { Role } from "@/lib/supabase/database.types";

export function AuthShell({
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
  const initial = (username.charAt(0) || "?").toUpperCase();
  const bellHref = role === "superadmin" ? "/admin/laporan" : "/laporan/notifikasi";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass-bar sticky top-0 z-20 hidden md:block">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 md:px-8">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-tight transition-soft hover:opacity-70"
          >
            LaporAja
          </Link>
          <div className="flex items-center gap-1">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {username}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <MobileTopbar badgeCount={badgeCount} bellHref={bellHref} initial={initial} />
      <main className="flex-1 px-4 pt-6 pb-28 md:px-8 md:py-10">{children}</main>
      <MobileBottomnav role={role} />
    </div>
  );
}
