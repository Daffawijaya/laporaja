import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  getBulanUser,
  getStatusReview,
  getTugasUser,
  labelPeriode,
  type Periode,
} from "@/lib/laporan-tambahan/queries";
import { LaporanTambahanSection } from "@/components/laporan/laporan-tambahan-section";
import { DaftarBulan } from "@/components/laporan/daftar-bulan";
import { EmptyState } from "@/components/ui/empty-state";
import { SimpanTeks } from "@/components/ui/simpan-teks";

// Halaman laporan user. Lapis 1: daftar bulan (tambah sendiri lewat
// dropdown) komponen list RefListCard. Lapis 2 (?tahun&bulan): form
// section dinamis khusus bulan itu.
export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ tahun?: string; bulan?: string }>;
}) {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");

  const params = await searchParams;
  const tahun = Number(params.tahun ?? "");
  const bulan = Number(params.bulan ?? "");
  const periodeValid =
    Number.isInteger(tahun) &&
    Number.isInteger(bulan) &&
    tahun >= 2000 &&
    tahun <= 2100 &&
    bulan >= 1 &&
    bulan <= 12;

  const supabase = await createClient();

  if (periodeValid) {
    const periode: Periode = { tahun, bulan };
    const [tugas, statusAwal] = await Promise.all([
      getTugasUser(supabase, user.id, profile.bidang_id, periode),
      getStatusReview(supabase, user.id, periode),
    ]);
    // Tanda revisi per baris dari admin (tabel belum dimigrasi = kosong).
    const barisIds = tugas.flatMap((item) => item.baris.map((row) => row.id));
    const revisiAwal: Record<string, string> = {};
    if (barisIds.length > 0) {
      const { data: revisiRows } = await supabase
        .from("revisi_baris")
        .select("baris_id, catatan")
        .in("baris_id", barisIds);
      for (const row of revisiRows ?? []) revisiAwal[row.baris_id] = row.catatan;
    }
    return (
      <div className="w-full">
        <div className="mb-3 flex items-center gap-3">
          <div className="ref-icon-btn-liquid shrink-0 bg-white/85! dark:bg-[rgb(28_28_30/0.85)]!">
            <Link
              href="/laporan"
              aria-label="Kembali ke daftar bulan"
              className="ref-icon-btn-plain"
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </Link>
          </div>
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
            {labelPeriode(periode)}
          </h2>
          <span className="shrink-0 md:hidden">
            <SimpanTeks />
          </span>
        </div>
        {tugas.length === 0 ? (
          <EmptyState
            className="mt-2"
            title="Belum ada tugas"
            description="Belum ada section untuk bidangmu. Hubungi admin bila seharusnya ada."
          />
        ) : (
          <LaporanTambahanSection userId={user.id} tugas={tugas} periode={periode} statusAwal={statusAwal} revisiAwal={revisiAwal} />
        )}
      </div>
    );
  }

  const bulanList = await getBulanUser(supabase, user.id, profile.bidang_id);

  return (
    <div className="w-full">
      <p className="text-sm text-neutral-500 md:hidden">Selamat datang, {profile.nama}</p>
      <div className="mt-5 md:mt-1">
        <DaftarBulan userId={user.id} initial={bulanList} />
      </div>
    </div>
  );
}
