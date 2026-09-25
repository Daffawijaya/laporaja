import { ResponsiveShell } from "@/components/layout/responsive-shell";
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
  return (
    <ResponsiveShell username={username} role={role} badgeCount={badgeCount}>
      {children}
    </ResponsiveShell>
  );
}
