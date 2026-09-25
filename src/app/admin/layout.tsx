import { requireSuperadmin } from "@/lib/auth/session";
import { AuthShell } from "@/components/layout/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { countPendingReview } from "@/lib/laporan/queries";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireSuperadmin();
  const supabase = await createClient();
  const badge = await countPendingReview(supabase);

  return (
    <AuthShell username={profile.username} role={profile.role} badgeCount={badge}>
      {children}
    </AuthShell>
  );
}
