"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { RefListCard } from "@/components/ui/ref-list-card";
import { LiquidGlassTabs } from "@/components/ui/liquid-glass-tabs";
import { Select } from "@/components/ui/select";
import { NAMA_BULAN } from "@/components/laporan/types";

export interface UserMonthStat {
  id: string;
  nama: string;
  username: string;
  total: number;
  disetujui: number;
  revisi: number;
  menunggu: number;
}

type FilterKey = "semua" | "lapor" | "belum" | "review";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "lapor", label: "Sudah lapor" },
  { key: "belum", label: "Belum lapor" },
  { key: "review", label: "Perlu review" },
];

// Rekap bulan-dulu untuk superadmin: pilih bulan/tahun dulu, baru daftar
// SEMUA user bulan itu (termasuk yang belum ada laporan). Klik baris masuk
// ke detail bulanan user tersebut (?user=).
export function AdminMonthRecap({
  stats,
  bulan,
  tahun,
}: {
  stats: UserMonthStat[];
  bulan: number;
  tahun: number;
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
    if (filter === "lapor") return stat.total > 0;
    if (filter === "belum") return stat.total === 0;
    if (filter === "review") return stat.menunggu > 0;
    return true;
  });

  const count = {
    semua: stats.length,
    lapor: stats.filter((stat) => stat.total > 0).length,
    belum: stats.filter((stat) => stat.total === 0).length,
    review: stats.filter((stat) => stat.menunggu > 0).length,
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Pilih bulan"
          value={bulan}
          onChange={(event) => goMonth(Number(event.target.value), tahun)}
          className="w-auto"
        >
          {NAMA_BULAN.map((nama, index) => (
            <option key={nama} value={index + 1}>
              {nama}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Pilih tahun"
          value={tahun}
          onChange={(event) => goMonth(bulan, Number(event.target.value))}
          className="w-auto"
        >
          {tahunList.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-3">
        <LiquidGlassTabs
          ariaLabel="Filter status"
          value={filter}
          onChange={(key) => setFilter(key as FilterKey)}
          tabs={FILTERS.map((item) => ({
            key: item.key,
            label: `${item.label} (${count[item.key]})`,
          }))}
        />
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
            stat.total === 0
              ? "Belum ada laporan bulan ini"
              : `${stat.total} kegiatan · ${stat.disetujui} disetujui · ${stat.revisi} revisi · ${stat.menunggu} menunggu review`,
          desc:
            stat.total === 0
              ? "Belum lapor"
              : stat.menunggu > 0
                ? `${stat.menunggu} menunggu`
                : "Selesai",
          href: `/admin/laporan?user=${stat.id}&bulan=${bulan}&tahun=${tahun}`,
        }))}
      />
    </div>
  );
}
