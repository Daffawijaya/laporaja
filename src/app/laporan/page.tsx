import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { clampBulan, clampTahun, getMonthlyLaporan } from "@/lib/laporan/queries";
import { getIndikatorProgress } from "@/lib/indikator/queries";
import { MonthlyList } from "@/components/laporan/monthly-list";

// Halaman utama user adalah Monthly Activity List bulan berjalan.
// Bulan dan tahun dapat diubah lewat picker di dalam daftar.
export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string }>;
}) {
  const now = new Date();
  const params = await searchParams;
  const bulan = clampBulan(params.bulan, now.getMonth() + 1);
  const tahun = clampTahun(params.tahun, now.getFullYear());

  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");

  const supabase = await createClient();
  const [items, indikators] = await Promise.all([
    getMonthlyLaporan(supabase, user.id, tahun, bulan),
    getIndikatorProgress(supabase, user.id, tahun, bulan),
  ]);

  return (
    <MonthlyList
      userId={user.id}
      nama={profile.nama}
      tahun={tahun}
      bulan={bulan}
      items={items}
      indikators={indikators}
    />
  );
}
