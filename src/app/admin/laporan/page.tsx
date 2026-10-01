import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RefListCard } from "@/components/ui/ref-list-card";
import { assertOk } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { clampBulan, clampTahun, getMonthlyLaporan, getMonthlyReview, getUserMonthStats } from "@/lib/laporan/queries";
import { getSectionBelumTerisi, getTugasBelumTerisi } from "@/lib/laporan-tambahan/queries";
import { getIndikatorProgress } from "@/lib/indikator/queries";
import { NAMA_BULAN } from "@/components/laporan/types";
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
    .select("id, username, nama, bidang_id")
    .eq("role", "user")
    .order("nama");
  assertOk(profilesError, "Gagal memuat data pengguna. Coba lagi.");
  const userList = users ?? [];
  const selectedId = typeof params.user === "string" ? params.user : "";
  const selected = userList.find((user) => user.id === selectedId) ?? null;
  const labelBulan = `${NAMA_BULAN[bulan - 1]} ${tahun}`;

  // Lapis 2: detail bulanan satu user (tampilan lama + tombol kembali).
  if (selected) {
    const [items, monthly, indikators, tugasBelum, sectionBelum] = await Promise.all([
      getMonthlyLaporan(supabase, selected.id, tahun, bulan),
      getMonthlyReview(supabase, selected.id, tahun, bulan),
      getIndikatorProgress(supabase, selected.id, tahun, bulan),
      getTugasBelumTerisi(supabase, selected.id, selected.bidang_id),
      getSectionBelumTerisi(supabase, selected.id, selected.bidang_id, tahun, bulan),
    ]);
    // Nama bidang untuk jabatan penilai (tidak lagi hardcode).
    let bidangNama: string | null = null;
    if (selected.bidang_id) {
      const { data: bidang } = await supabase
        .from("bidang")
        .select("nama")
        .eq("id", selected.bidang_id)
        .maybeSingle();
      bidangNama = bidang?.nama ?? null;
    }
    // Sub bidang user (boleh banyak) untuk jabatan:
    // "Tenaga Ahli Pendamping Bidang Sub1, Sub2" (tanpa kurung).
    const { data: subs } = await supabase
      .from("user_sub_bidang")
      .select("nama")
      .eq("user_id", selected.id)
      .order("nama");
    const subNama = (subs ?? []).map((sub) => sub.nama).filter(Boolean);
    const jabatan = [
      "Tenaga Ahli Pendamping",
      bidangNama,
      subNama.length > 0 ? subNama.join(", ") : null,
    ]
      .filter(Boolean)
      .join(" ");
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
              // Jarak antar kartu disamakan dengan kolom utama (mt-4).
              <div className="flex flex-col gap-4">
                {/* Info penilai (hardcode dulu): gaya list sama seperti kartu lain. */}
                <RefListCard ariaLabel="Info evaluasi">
                  <ul className="divide-y divide-neutral-200/70 text-sm dark:divide-white/10">
                    <li className="flex items-center justify-between gap-3 px-1 pb-3">
                      <span className="text-sm font-medium">Bulan</span>
                      <span className="shrink-0 text-xs text-neutral-500">
                        {NAMA_BULAN[bulan - 1]}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 px-1 py-3">
                      <span className="text-sm font-medium">Tahun</span>
                      <span className="shrink-0 text-xs text-neutral-500">{tahun}</span>
                    </li>
                    <li className="flex items-center justify-between gap-3 px-1 py-3">
                      <span className="text-sm font-medium">Nama</span>
                    <span className="max-w-[65%] text-right text-xs text-neutral-500">
                      {selected.nama}
                    </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 px-1 py-3">
                      <span className="text-sm font-medium">Jabatan</span>
                    <span className="max-w-[65%] text-right text-xs text-neutral-500">
                      {jabatan}
                    </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 px-1 pt-3">
                      <span className="text-sm font-medium">Unit Kerja</span>
                      <span className="max-w-[65%] text-right text-xs text-neutral-500">
                        Diskop UKM Kutai Kartanegara - Bidang Pemberdayaan Usaha Mikro (PUM)
                      </span>
                    </li>
                  </ul>
                </RefListCard>

                {/* Capaian indikator: jumlah kegiatan bulan ini per indikator. */}
                {indikators.length > 0 && (
                  <RefListCard ariaLabel="Indikator" title="Indikator">
                    <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
                      {indikators.map((indikator, idx) => {
                        const persen =
                          indikator.target == null
                            ? 0
                            : Math.min(100, Math.round((indikator.bulanIni / indikator.target) * 100));
                        const pad =
                          idx === 0
                            ? "px-1 pb-3"
                            : idx === indikators.length - 1
                              ? "px-1 pt-3"
                              : "px-1 py-3";
                        return (
                          <li key={indikator.id} className={pad}>
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="min-w-0 truncate text-sm font-medium">
                                {indikator.nama}
                              </p>
                              <p className="shrink-0 text-sm text-neutral-500">
                                {indikator.target == null
                                  ? `${indikator.bulanIni}`
                                  : `${indikator.bulanIni} dari ${indikator.target}`}
                              </p>
                            </div>
                            {indikator.target != null && (
                              <div
                                role="progressbar"
                                aria-valuenow={indikator.bulanIni}
                                aria-valuemin={0}
                                aria-valuemax={indikator.target}
                                aria-label={`Capaian ${indikator.nama}`}
                                className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                              >
                                <div
                                  className="h-full rounded-full bg-accent"
                                  style={{ width: `${persen}%` }}
                                />
                              </div>
                            )}
                            <p className="mt-1.5 text-xs text-neutral-500">
                              {indikator.target == null
                                ? "Target belum diatur"
                                : `Target ${indikator.target} per bulan`}
                              {" · "}
                              total {indikator.total}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </RefListCard>
                )}
              </div>
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
              tugasBelum={tugasBelum}
              sectionBelum={sectionBelum}
            />
          </ContentGrid>
        </div>
      </div>
    );
  }

  // Lapis 1: rekap sebulan semua user (ikut status bulanan).
  const stats = await getUserMonthStats(supabase, userList, tahun, bulan);

  const semua = stats.length;
  const belum = stats.filter((stat) => stat.total === 0).length;
  const menunggu = stats.filter(
    (stat) => stat.total > 0 && stat.status === "menunggu"
  ).length;
  const revisi = stats.filter(
    (stat) => stat.total > 0 && stat.status === "revision"
  ).length;
  const selesai = stats.filter(
    (stat) => stat.total > 0 && stat.status === "approved"
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
                  <span className="text-sm font-medium">Semua</span>
                  <span className="shrink-0 text-xs text-neutral-500">{semua}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-1 py-3">
                  <span className="text-sm font-medium">Belum lapor</span>
                  <span className="shrink-0 text-xs text-neutral-500">{belum}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-1 py-3">
                  <span className="text-sm font-medium">Menunggu review</span>
                  <span className="shrink-0 text-xs text-neutral-500">{menunggu}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-1 py-3">
                  <span className="text-sm font-medium">Revisi</span>
                  <span className="shrink-0 text-xs text-neutral-500">{revisi}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-1 pt-3">
                  <span className="text-sm font-medium">Selesai</span>
                  <span className="shrink-0 text-xs text-neutral-500">{selesai}</span>
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
