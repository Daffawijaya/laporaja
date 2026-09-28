import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RefListCard } from "@/components/ui/ref-list-card";
import { assertOk } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { clampBulan, clampTahun, getMonthlyLaporan, getMonthlyReview, getUserMonthStats } from "@/lib/laporan/queries";
import { NAMA_BULAN } from "@/components/laporan/types";
import { AdminLaporanFilter } from "@/components/admin/admin-laporan-filter";
import { AdminMonthRecap } from "@/components/admin/admin-month-recap";
import { AdminMonthlyList } from "@/components/admin/admin-monthly-list";
import { AdminMonthlyReview } from "@/components/admin/admin-monthly-review";
import { ContentGrid } from "@/components/layout/content-grid";

// Alur bulan-dulu: tanpa ?user= tampil rekap sebulan semua user (termasuk
// yang belum ada laporan). Klik baris masuk ke detail bulanan user.
export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; bulan?: string; tahun?: string }>;
}) {
  const now = new Date();
  const params = await searchParams;
  const bulan = clampBulan(params.bulan, now.getMonth() + 1);
  const tahun = clampTahun(params.tahun, now.getFullYear());

  const supabase = await createClient();
  const { data: users, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, nama")
    .eq("role", "user")
    .order("nama");
  assertOk(profilesError, "Gagal memuat data pengguna. Coba lagi.");
  const userList = users ?? [];
  const selectedId = typeof params.user === "string" ? params.user : "";
  const selected = userList.find((user) => user.id === selectedId) ?? null;
  const labelBulan = `${NAMA_BULAN[bulan - 1]} ${tahun}`;

  // Lapis 2: detail bulanan satu user (tampilan lama + tombol kembali).
  if (selected) {
    const [items, monthly] = await Promise.all([
      getMonthlyLaporan(supabase, selected.id, tahun, bulan),
      getMonthlyReview(supabase, selected.id, tahun, bulan),
    ]);
    const revisiKegiatan = items.filter((item) => item.review?.status === "revision").length;
    return (
      <div className="w-full">
        <div className="md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">Laporan User</h1>
          <p className="mt-1 text-sm text-muted-foreground">Rekap {labelBulan}</p>
        </div>

        <div className="mt-5 md:mt-1">
          <div className="mb-3 flex items-center gap-3">
            <div className="ref-icon-btn-liquid shrink-0 bg-white/85! dark:bg-[rgb(28_28_30/0.85)]!">
              <Link
                href={`/admin/laporan?bulan=${bulan}&tahun=${tahun}`}
                aria-label={`Kembali ke rekap ${labelBulan}`}
                className="ref-icon-btn-plain"
              >
                <ChevronLeft aria-hidden="true" className="size-5" />
              </Link>
            </div>
            <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
              {selected.nama}
            </h2>
          </div>
          <ContentGrid
            gapClassName="lg:gap-3"
            aside={
              <section aria-label="Filter laporan" className="ref-card p-4 pb-6">
                <h2 className="text-sm font-semibold">Filter</h2>
                <div className="mt-2 rounded-2xl bg-neutral-50 p-3 dark:bg-white/5">
                  <AdminLaporanFilter
                    users={userList.map((user) => ({ id: user.id, nama: user.nama, username: user.username }))}
                    selectedUserId={selected.id}
                    bulan={bulan}
                    tahun={tahun}
                  />
                </div>
              </section>
            }
          >
            {/* Judul + Export di luar kartu: judul kiri, tombol kanan. */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 md:mt-0">
              <h2 className="text-[17px] font-semibold tracking-tight">
                Evaluasi Kegiatan Bulan {labelBulan}
              </h2>
              <Button asChild variant="default" className="w-full rounded-full sm:w-auto">
                <Link
                  href={`/admin/laporan/export?user=${selected.id}&bulan=${bulan}&tahun=${tahun}`}
                >
                  <Download aria-hidden="true" />
                  Export PDF
                </Link>
              </Button>
            </div>
            <RefListCard
              ariaLabel={`Kegiatan ${selected.nama} ${labelBulan}`}
              className="mt-2"
            >
              <AdminMonthlyList items={items} />
            </RefListCard>
            <AdminMonthlyReview
              userId={selected.id}
              userNama={selected.nama}
              tahun={tahun}
              bulan={bulan}
              labelBulan={labelBulan}
              initial={monthly}
              revisiKegiatan={revisiKegiatan}
            />
          </ContentGrid>
        </div>
      </div>
    );
  }

  // Lapis 1: rekap sebulan semua user (ikut status bulanan).
  const stats = await getUserMonthStats(supabase, userList, tahun, bulan);

  const sudahLapor = stats.filter((stat) => stat.total > 0).length;
  const belumLapor = stats.filter((stat) => stat.total === 0).length;
  const perluReview = stats.filter(
    (stat) => stat.total > 0 && stat.status !== "approved"
  ).length;

  return (
    <div className="w-full">
      <div className="md:hidden">
        <h1 className="text-xl font-semibold tracking-tight">Laporan User</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rekap {labelBulan} semua user.
        </p>
      </div>

      <div className="mt-5 md:mt-1">
        <ContentGrid
          gapClassName="lg:gap-3"
          aside={
            // Tanpa judul: kartu ini sudah jelas dari isinya, dan judulnya
            // bikin kartu terlihat lebih tinggi dari isi yang cuma 4 baris.
            // aria-label tetap dipertahankan untuk pembaca layar.
            <RefListCard ariaLabel="Ringkasan bulan ini">
              <ul className="divide-y divide-neutral-200/70 text-sm dark:divide-white/10">
                <li className="flex items-center justify-between gap-3 px-1 pb-3">
                  <span className="text-sm font-medium">Total user</span>
                  <span className="shrink-0 text-xs text-neutral-500">{stats.length}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-1 py-3">
                  <span className="text-sm font-medium">Sudah lapor</span>
                  <span className="shrink-0 text-xs text-neutral-500">{sudahLapor}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-1 py-3">
                  <span className="text-sm font-medium">Belum lapor</span>
                  <span className="shrink-0 text-xs text-neutral-500">{belumLapor}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-1 pt-3">
                  <span className="text-sm font-medium">Perlu review</span>
                  <span className="shrink-0 text-xs text-neutral-500">{perluReview}</span>
                </li>
              </ul>
            </RefListCard>
          }
        >
          {userList.length === 0 ? (
            <div className="ref-card p-4 pb-6">
              <h2 className="text-sm font-semibold">Laporan</h2>
              <div className="mt-2">
                <EmptyState
                  title="Belum ada user"
                  description="Tambahkan user lewat halaman Pengguna."
                />
              </div>
            </div>
          ) : (
            <AdminMonthRecap stats={stats} bulan={bulan} tahun={tahun} />
          )}
        </ContentGrid>
      </div>
    </div>
  );
}
