"use client";

import { useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { RefListCard } from "@/components/ui/ref-list-card";
import { labelPeriode, type Periode } from "@/lib/laporan-tambahan/queries";

export interface AdminBulanRow extends Periode {
  subtitle: string;
  desc?: string;
  href: string;
}

// Daftar bulan lapis 1 admin (semua bulan / bulan satu user): disaring
// search navbar (?q=) by label periode. Hasilnya list seperti biasa.
export function AdminBulanList({
  rows,
  ariaLabel,
  emptyText,
}: {
  rows: AdminBulanRow[];
  ariaLabel: string;
  emptyText: string;
}) {
  // Filter dari search navbar (?q=).
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const visible = query
    ? rows.filter((row) => labelPeriode(row).toLowerCase().includes(query))
    : rows;

  if (visible.length === 0) {
    return (
      <EmptyState
        title={query ? "Tidak ada hasil" : "Belum ada bulan"}
        description={
          query ? `Tidak ada bulan yang cocok dengan "${query}".` : emptyText
        }
      />
    );
  }

  return (
    <RefListCard
      ariaLabel={ariaLabel}
      items={visible.map((row) => ({
        key: `${row.tahun}-${row.bulan}`,
        title: labelPeriode(row),
        subtitle: row.subtitle,
        desc: row.desc,
        href: row.href,
      }))}
    />
  );
}
