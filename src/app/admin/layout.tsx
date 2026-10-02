import { requireSuperadmin } from "@/lib/auth/session";
import { AuthShell } from "@/components/layout/auth-shell";

// Halaman privat: render saat request, jangan di-prerender waktu build
// (butuh env Supabase + cookie sesi yang tidak ada saat build).
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireSuperadmin();

  return (
    <AuthShell username={profile.username} role={profile.role}>
      {children}
    </AuthShell>
  );
}
