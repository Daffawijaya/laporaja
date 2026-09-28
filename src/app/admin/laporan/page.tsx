import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RefListCard } from "@/components/ui/ref-list-card";
import { assertOk } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { clampBulan, clampTahun, getMonthlyLaporan } from "@/lib/laporan/queries";
import { NAMA_BULAN } from "@/components/laporan/types";
import { AdminLaporanFilter } from "@/components/admin/admin-laporan-filter";
import { AdminMonthRecap, type UserMonthStat } from "@/components/admin/admin-month-recap";
import { AdminMonthlyList } from "@/components/admin/admin-monthly-list";
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
    const items = await getMonthlyLaporan(supabase, selected.id, tahun, bulan);
    return (
      <div className="w-full">
        <div className="md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">Laporan User</h1>
          <p className="mt-1 text-sm text-muted-foreground">Rekap {labelBulan}</p>
        </div>

        <div className="mt-5 md:mt-1">
          <div className="mb-3 flex items-center gap-3">
            <div className="ref-icon-btn-liquid shrink-0 bg-white/50! dark:bg-[rgb(28_28_30/0.85)]!">
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
            {/* Nama user sudah pindah ke baris tombol kembali di atas,
                jadi card ini tanpa judul luar. */}
            <RefListCard
              ariaLabel={`Kegiatan ${selected.nama} ${labelBulan}`}
              className="mt-2 md:mt-0"
            >
              {/* Baris header kartu, sama seperti baris tombol di /laporan. */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
                <p className="min-w-0 text-sm text-neutral-500">
                  {selected.username} · {labelBulan}
                </p>
                <Button asChild variant="default" className="w-full rounded-full sm:w-auto">
                  <Link
                    href={`/admin/laporan/export?user=${selected.id}&bulan=${bulan}&tahun=${tahun}`}
                  >
                    <Download aria-hidden="true" />
                    Export PDF
                  </Link>
                </Button>
              </div>

              <AdminMonthlyList items={items} />
            </RefListCard>
          </ContentGrid>
        </div>
      </div>
    );
  }

  // Lapis 1: rekap sebulan semua user.
  let stats: UserMonthStat[] = [];
  if (userList.length > 0) {
    const userIds = userList.map((user) => user.id);
    const firstDay = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
    const lastDate = new Date(tahun, bulan, 0).getDate();
    const lastDay = `${tahun}-${String(bulan).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
    const kegiatanResult = await supabase
      .from("kegiatan")
      .select("id, user_id")
      .in("user_id", userIds)
      .gte("tanggal", firstDay)
      .lte("tanggal", lastDay);
    assertOk(kegiatanResult.error, "Gagal memuat rekap bulanan. Coba lagi.");
    const kegiatanBulanIni = kegiatanResult.data ?? [];
    const idsBulanIni = kegiatanBulanIni.map((kegiatan) => kegiatan.id);
    let statusByKegiatan = new Map<string, string>();
    if (idsBulanIni.length > 0) {
      const reviewsResult = await supabase
        .from("reviews")
        .select("kegiatan_id, status")
        .in("kegiatan_id", idsBulanIni);
      assertOk(reviewsResult.error, "Gagal memuat rekap bulanan. Coba lagi.");
      statusByKegiatan = new Map(
        (reviewsResult.data ?? []).map((review) => [review.kegiatan_id, review.status])
      );
    }
    const agregat = new Map<string, { total: number; disetujui: number; revisi: number }>();
    for (const kegiatan of kegiatanBulanIni) {
      const row = agregat.get(kegiatan.user_id) ?? { total: 0, disetujui: 0, revisi: 0 };
      row.total += 1;
      const status = statusByKegiatan.get(kegiatan.id);
      if (status === "approved") row.disetujui += 1;
      else if (status === "revision") row.revisi += 1;
      agregat.set(kegiatan.user_id, row);
    }
    stats = userList.map((user) => {
      const row = agregat.get(user.id) ?? { total: 0, disetujui: 0, revisi: 0 };
      return {
        id: user.id,
        nama: user.nama,
        username: user.username,
        total: row.total,
        disetujui: row.disetujui,
        revisi: row.revisi,
        menunggu: row.total - row.disetujui - row.revisi,
      };
    });
  }

  const sudahLapor = stats.filter((stat) => stat.total > 0).length;
  const belumLapor = stats.filter((stat) => stat.total === 0).length;
  const perluReview = stats.filter((stat) => stat.menunggu > 0).length;

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
