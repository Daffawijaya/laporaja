"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { RefListCard } from "@/components/ui/ref-list-card";
import { LiquidGlassTabs } from "@/components/ui/liquid-glass-tabs";
import { GlassSelect } from "@/components/ui/glass-select";
import { NAMA_BULAN } from "@/components/laporan/types";
import type { MonthStatus, UserMonthStat } from "@/lib/laporan/queries";

export type { UserMonthStat };

type FilterKey = "semua" | "belum" | "menunggu" | "revisi" | "selesai";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "belum", label: "Belum lapor" },
  { key: "menunggu", label: "Menunggu" },
  { key: "revisi", label: "Revisi" },
  { key: "selesai", label: "Selesai" },
];

const STATUS_LABEL: Record<MonthStatus, string> = {
  menunggu: "Menunggu review",
  revision: "Revisi",
  approved: "Selesai",
};

// Rekap bulan-dulu untuk superadmin: pilih bulan/tahun dulu, baru daftar
// SEMUA user bulan itu (termasuk yang belum ada laporan). Klik baris masuk
// ke detail bulanan user tersebut (?user=).
export function AdminMonthRecap({
  stats,
  bulan,
  tahun,
  showCounts = false,
}: {
  stats: UserMonthStat[];
  bulan: number;
  tahun: number;
  showCounts?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<FilterKey>("semua");
  const now = new Date();
  const startYear = Math.min(now.getFullYear() - 3, tahun);
  const endYear = Math.max(now.getFullYear() + 1, tahun);
  const tahunList: number[] = [];
  for (let y = startYear; y <= endYear; y++) tahunList.push(y);

  function goMonth(nextBulan: number, nextTahun: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("user");
    params.set("bulan", String(nextBulan));
    params.set("tahun", String(nextTahun));
    router.push(`/admin/laporan?${params.toString()}`);
  }

  // Filter dari search global titlebar (?q=), pola sama seperti daftar lain.
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const visible = stats.filter((stat) => {
    if (
      query &&
      !stat.nama.toLowerCase().includes(query) &&
      !stat.username.toLowerCase().includes(query)
    ) {
      return false;
    }
    if (filter === "belum") return stat.total === 0;
    if (filter === "menunggu") return stat.total > 0 && stat.status === "menunggu";
    if (filter === "revisi") return stat.total > 0 && stat.status === "revision";
    if (filter === "selesai") return stat.total > 0 && stat.status === "approved";
    return true;
  });

  const counts: Record<FilterKey, number> = {
    semua: stats.length,
    belum: stats.filter((stat) => stat.total === 0).length,
    menunggu: stats.filter((stat) => stat.total > 0 && stat.status === "menunggu").length,
    revisi: stats.filter((stat) => stat.total > 0 && stat.status === "revision").length,
    selesai: stats.filter((stat) => stat.total > 0 && stat.status === "approved").length,
  };

  return (
    <div className="w-full">
      {/* Satu baris: tab status di kiri, pilih bulan/tahun terdorong ke ujung
          kanan (justify-between). flex-wrap agar di layar sempit pilihan
          bulan/tahun turun ke baris sendiri, bukan terpotong. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LiquidGlassTabs
          ariaLabel="Filter status"
          value={filter}
          onChange={(key) => setFilter(key as FilterKey)}
          showCounts={showCounts}
          tabs={FILTERS.map((item) => ({
            key: item.key,
            label: item.label,
            count: counts[item.key],
          }))}
        />

        <div className="ml-auto flex items-center gap-2">
          <GlassSelect
            ariaLabel="Pilih bulan"
            value={String(bulan)}
            onChange={(next) => goMonth(Number(next), tahun)}
            options={NAMA_BULAN.map((nama, index) => ({
              value: String(index + 1),
              label: nama,
            }))}
            className="w-auto bg-white/85"
          />

          <GlassSelect
            ariaLabel="Pilih tahun"
            value={String(tahun)}
            onChange={(next) => goMonth(bulan, Number(next))}
            options={tahunList.map((y) => ({ value: String(y), label: String(y) }))}
            className="w-auto bg-white/85"
          />
        </div>
      </div>

      <RefListCard
        ariaLabel={`Laporan ${NAMA_BULAN[bulan - 1]} ${tahun}`}
        title={`Laporan ${NAMA_BULAN[bulan - 1]} ${tahun}`}
        className="mt-2"
        emptyText="Tidak ada user pada filter ini."
        items={visible.map((stat) => ({
          key: stat.id,
          title: stat.nama,
          subtitle:
            stat.total === 0 ? "Belum ada laporan bulan ini" : `${stat.total} kegiatan`,
          desc: stat.total === 0 ? "Belum lapor" : STATUS_LABEL[stat.status],
          href: `/admin/laporan?user=${stat.id}&bulan=${bulan}&tahun=${tahun}`,
        }))}
      />
    </div>
  );
}
