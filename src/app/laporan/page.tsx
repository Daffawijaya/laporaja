import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { clampBulan, clampTahun, getMonthlyLaporan, getMonthlyReview, getYearlySummary } from "@/lib/laporan/queries";
import { getTugasUser } from "@/lib/laporan-tambahan/queries";
import { getIndikatorProgress } from "@/lib/indikator/queries";
import { MonthlyList } from "@/components/laporan/monthly-list";
import { YearArchive } from "@/components/laporan/year-archive";

// Alur bulan-dulu: tanpa ?bulan= tampil arsip 12 bulan tahun terpilih.
// Dengan ?bulan= tampil detail bulanan seperti sebelumnya (link lama aman).
export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string }>;
}) {
  const now = new Date();
  const params = await searchParams;

  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");

  const supabase = await createClient();

  if (params.bulan === undefined) {
    const tahun = clampTahun(params.tahun, now.getFullYear());
    const summary = await getYearlySummary(supabase, user.id, tahun);
    return <YearArchive nama={profile.nama} tahun={tahun} summary={summary} />;
  }

  const bulan = clampBulan(params.bulan, now.getMonth() + 1);
  const tahun = clampTahun(params.tahun, now.getFullYear());

  const [items, indikators, monthlyReview, tugasTambahan, sectionIndikator] =
    await Promise.all([
      getMonthlyLaporan(supabase, user.id, tahun, bulan),
      getIndikatorProgress(supabase, user.id, tahun, bulan),
      getMonthlyReview(supabase, user.id, tahun, bulan),
      getTugasUser(supabase, user.id, profile.bidang_id),
      // Blok indikator tampil bila bidang user tertaut ke sectionnya.
      // Tanpa bidang: tampil seperti dulu.
      profile.bidang_id
        ? supabase
            .from("laporan_section_bidang")
            .select("kode")
            .eq("kode", "indikator")
            .eq("bidang_id", profile.bidang_id)
            .maybeSingle()
        : Promise.resolve({ data: { kode: "indikator" } }),
    ]);

  return (
    <MonthlyList
      userId={user.id}
      nama={profile.nama}
      tahun={tahun}
      bulan={bulan}
      items={items}
      indikators={indikators}
      initialReview={monthlyReview}
      tugasTambahan={tugasTambahan}
      tampilIndikator={!!sectionIndikator.data}
    />
  );
}
