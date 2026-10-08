import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { AuthShell } from "@/components/layout/auth-shell";
import { getTugasUser, labelPeriode, type Periode } from "@/lib/laporan-tambahan/queries";
import { Button } from "@/components/ui/button";
import { RefListCard } from "@/components/ui/ref-list-card";

// Butuh cookie sesi: render saat request, jangan di-prerender waktu build.
export const dynamic = "force-dynamic";

// Beranda user: sapaan + ketuntasan laporan bulan berjalan + jalan pintas
// ke halaman Laporan. (Superadmin tetap ke /admin.)
export default async function Home() {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");
  if (profile.role === "superadmin") redirect("/admin");

  const sekarang = new Date();
  const periode: Periode = { tahun: sekarang.getFullYear(), bulan: sekarang.getMonth() + 1 };
  const supabase = await createClient();
  const tugas = await getTugasUser(supabase, user.id, profile.bidang_id, periode);
  const total = tugas.length;
  const terisi = tugas.filter((item) => item.terisi).length;
  const href = `/laporan?tahun=${periode.tahun}&bulan=${periode.bulan}`;

  return (
    <AuthShell username={profile.username} role={profile.role}>
      <div className="w-full">
        <p className="text-sm text-neutral-500 md:hidden">Selamat datang, {profile.nama}</p>
        <div className="mt-5 md:mt-1">
          <RefListCard ariaLabel="Ringkasan laporan" title={`Halo, ${profile.nama}`}>
            <p className="px-1 pb-3 text-sm text-neutral-500">
              Laporan {labelPeriode(periode)}: {total === 0 ? "belum ada tugas" : `${terisi}/${total} section terisi`}.
            </p>
            <div className="flex justify-end px-1">
              <Button asChild className="rounded-full">
                <Link href={total === 0 ? "/laporan" : href}>
                  {terisi === total && total > 0 ? "Lihat laporan" : "Isi laporan"}
                </Link>
              </Button>
            </div>
          </RefListCard>
        </div>
      </div>
    </AuthShell>
  );
}
