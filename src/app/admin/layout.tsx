import { requireSuperadmin } from "@/lib/auth/session";
import { AuthShell } from "@/components/layout/auth-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireSuperadmin();

  return <AuthShell username={profile.username}>{children}</AuthShell>;
}
