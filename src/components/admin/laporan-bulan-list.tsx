"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { ContentGrid } from "@/components/layout/content-grid";
import { LiquidGlassTabs } from "@/components/ui/liquid-glass-tabs";
import { RefListCard } from "@/components/ui/ref-list-card";
import {
  labelPeriode,
  labelStatusReview,
  type LaporanUserBulan,
  type Periode,
} from "@/lib/laporan-tambahan/queries";

// Filter tab status persis pola UserManager (Semua + tiap status, tanpa angka).
const FILTERS = [
  { key: "semua", label: "Semua" },
  { key: "menunggu", label: "Menunggu" },
  { key: "selesai", label: "Selesai" },
  { key: "revision", label: "Revisi" },
  { key: "approved", label: "Disetujui" },
];

// Lapis 2 admin: pengguna yang membuka satu bulan + tab filter status
// laporan. Klik baris masuk ke isian satu user satu bulan.
export function LaporanBulanList({
  rows,
  periode,
}: {
  rows: LaporanUserBulan[];
  periode: Periode;
}) {
  const [filter, setFilter] = useState("semua");

  // Filter dari search global titlebar (?q=).
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  const visible = rows.filter((row) => {
    if (query && !row.nama.toLowerCase().includes(query) && !row.username.toLowerCase().includes(query)) {
      return false;
    }
    if (filter !== "semua" && row.status !== filter) return false;
    return true;
  });

  const hitung = (status: string) => rows.filter((row) => row.status === status).length;

  return (
    <ContentGrid
      gapClassName="lg:gap-3"
      aside={
        <RefListCard
          ariaLabel="Ringkasan"
          items={[
            { key: "total", title: "Total pengguna", desc: String(rows.length) },
            { key: "menunggu", title: "Menunggu", desc: String(hitung("menunggu")) },
            { key: "selesai", title: "Selesai", desc: String(hitung("selesai")) },
            { key: "revision", title: "Revisi", desc: String(hitung("revision")) },
            { key: "approved", title: "Disetujui", desc: String(hitung("approved")) },
          ]}
        />
      }
    >
      {/* Bar filter tab persis UserManager (tanpa angka). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LiquidGlassTabs
          ariaLabel="Filter status laporan"
          value={filter}
          onChange={setFilter}
          tabs={FILTERS}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          className="mt-4"
          title={query || filter !== "semua" ? "Tidak ada hasil" : "Belum ada pengguna"}
          description={
            query
              ? `Tidak ada yang cocok dengan "${query}".`
              : filter !== "semua"
                ? `Tidak ada laporan berstatus ${labelStatusReview(filter)} di ${labelPeriode(periode)}.`
                : `Belum ada pengguna yang membuka ${labelPeriode(periode)}.`
          }
        />
      ) : (
        <RefListCard
          ariaLabel={`Pengguna ${labelPeriode(periode)}`}
          className="mt-4"
          items={visible.map((row) => ({
            key: row.id,
            title: row.nama,
            subtitle:
              row.total === 0
                ? `${row.bidangNama} · Tanpa tugas`
                : `${row.bidangNama} · ${row.terisi}/${row.total} section terisi`,
            desc: labelStatusReview(row.status),
            href: `/admin/laporan?tahun=${periode.tahun}&bulan=${periode.bulan}&user=${row.id}`,
          }))}
        />
      )}
    </ContentGrid>
  );
}
