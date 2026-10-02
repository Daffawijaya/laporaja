import { ResponsiveShell } from "@/components/layout/responsive-shell";
import type { Role } from "@/lib/supabase/database.types";

export function AuthShell({
  username,
  role,
  children,
}: {
  username: string;
  role: Role;
  children: React.ReactNode;
}) {
  return (
    <ResponsiveShell username={username} role={role}>
      {children}
    </ResponsiveShell>
  );
}
