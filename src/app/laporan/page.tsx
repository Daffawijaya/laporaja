import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getTugasUser } from "@/lib/laporan-tambahan/queries";
import { LaporanTambahanSection } from "@/components/laporan/laporan-tambahan-section";
import { EmptyState } from "@/components/ui/empty-state";

// Halaman laporan user: daftar section dinamis yang wajib diisi sesuai
// bidangnya (tabel, esai, judul). Tanpa bulan, tanpa kalender.
export default async function LaporanPage() {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");

  const supabase = await createClient();
  const tugas = await getTugasUser(supabase, user.id, profile.bidang_id);

  return (
    <div className="w-full">
      <p className="text-sm text-neutral-500 md:hidden">Selamat datang, {profile.nama}</p>
      {tugas.length === 0 ? (
        <EmptyState
          className="mt-2"
          title="Belum ada tugas"
          description="Belum ada section untuk bidangmu. Hubungi admin bila seharusnya ada."
        />
      ) : (
        <LaporanTambahanSection userId={user.id} tugas={tugas} />
      )}
    </div>
  );
}
