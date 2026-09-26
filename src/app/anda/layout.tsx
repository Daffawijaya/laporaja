import { requireUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/layout/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { countPendingReview, countRevision } from "@/lib/laporan/queries";

// Halaman privat: render saat request, jangan di-prerender waktu build
// (butuh env Supabase + cookie sesi yang tidak ada saat build).
export const dynamic = "force-dynamic";

export default async function AndaLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUser();
  const supabase = await createClient();
  const badge =
    profile.role === "superadmin"
      ? await countPendingReview(supabase)
      : await countRevision(supabase, user.id);

  return (
    <AuthShell username={profile.username} role={profile.role} badgeCount={badge}>
      {children}
    </AuthShell>
  );
}
