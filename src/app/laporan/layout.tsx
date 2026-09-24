import { requireUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/layout/auth-shell";

export default async function LaporanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser();

  return <AuthShell username={profile.username}>{children}</AuthShell>;
}
