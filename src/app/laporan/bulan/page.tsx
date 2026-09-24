import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { clampBulan, clampTahun, getMonthlyLaporan } from "@/lib/laporan/queries";
import { MonthPicker } from "@/components/laporan/month-picker";
import { MonthlyList } from "@/components/laporan/monthly-list";

// Daftar kegiatan per tanggal dalam satu bulan (Monthly Activity List).
export default async function LaporanBulanPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string }>;
}) {
  const now = new Date();
  const params = await searchParams;
  const bulan = clampBulan(params.bulan, now.getMonth() + 1);
  const tahun = clampTahun(params.tahun, now.getFullYear());

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");

  const items = await getMonthlyLaporan(supabase, user.id, tahun, bulan);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/laporan"
        className="transition-soft inline-flex min-h-[44px] items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Dashboard
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="sr-only">Laporan bulanan</h1>
        <MonthPicker bulan={bulan} tahun={tahun} />
      </div>
      <div className="mt-6">
        <MonthlyList userId={user.id} tahun={tahun} bulan={bulan} items={items} />
      </div>
    </div>
  );
}
