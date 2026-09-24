import { requireSuperadmin } from "@/lib/auth/session";
import { AuthShell } from "@/components/layout/auth-shell";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireSuperadmin();

  return (
    <AuthShell username={profile.username}>
      <AdminNav />
      {children}
    </AuthShell>
  );
}
