import { DesktopNavbar } from "@/components/layout/desktop-navbar";
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
      <DesktopNavbar role={role} username={username} badgeCount={badgeCount} />
      <MobileTopbar badgeCount={badgeCount} bellHref={bellHref} initial={initial} />
      <main className="flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-6 md:pb-10">{children}</main>
      <MobileBottomnav role={role} />
    </div>
  );
}
