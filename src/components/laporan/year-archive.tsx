import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { RefListCard } from "@/components/ui/ref-list-card";
import { NAMA_BULAN } from "@/components/laporan/types";
import type { MonthSummary } from "@/lib/laporan/queries";

// Arsip bulan-dulu untuk user: pilih tahun, daftar 12 bulan beserta
// ringkasannya, klik baris masuk ke detail bulan itu (?bulan=&tahun=).
// Bulan kosong tetap muncul agar polanya konsisten dengan rekap admin.
export function YearArchive({
  nama,
  tahun,
  summary,
}: {
  nama: string;
  tahun: number;
  summary: MonthSummary[];
}) {
  const now = new Date();
  const bulanBerjalan = now.getMonth() + 1;
  const tahunBerjalan = now.getFullYear();

  return (
    <div className="w-full">
      <p className="text-sm text-neutral-500 md:hidden">Selamat datang, {nama}</p>

      <div className="mt-2 flex items-center justify-between gap-3 md:mt-0">
        <Link
          href={`/laporan?tahun=${tahun - 1}`}
          aria-label={`Arsip ${tahun - 1}`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-sm text-muted-foreground transition-soft hover:text-accent"
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Link>
        <h2 className="text-[17px] font-semibold tracking-tight">
          {tahun}
          {tahun === tahunBerjalan && (
            <span className="ml-2 text-xs font-normal text-neutral-500">Tahun ini</span>
          )}
        </h2>
        <Link
          href={`/laporan?tahun=${tahun + 1}`}
          aria-label={`Arsip ${tahun + 1}`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-sm text-muted-foreground transition-soft hover:text-accent"
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </Link>
      </div>

      <RefListCard
        ariaLabel={`Arsip laporan ${tahun}`}
        title="Arsip Laporan"
        className="mt-2"
        emptyText="Belum ada data tahun ini."
        items={summary.map((row) => ({
          key: `${tahun}-${row.bulan}`,
          title: NAMA_BULAN[row.bulan - 1],
          subtitle:
            row.total === 0
              ? "Belum ada kegiatan"
              : `${row.total} kegiatan · ${row.disetujui} disetujui · ${row.revisi} revisi · ${row.menunggu} menunggu review`,
          desc:
            row.bulan === bulanBerjalan && tahun === tahunBerjalan ? "Bulan ini" : undefined,
          href: `/laporan?bulan=${row.bulan}&tahun=${tahun}`,
        }))}
      />
    </div>
  );
}
