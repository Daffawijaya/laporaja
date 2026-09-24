"use client";

import { useMemo } from "react";
import Link from "next/link";

import { ReviewBadge } from "@/components/laporan/review-badge";
import {
  NAMA_BULAN,
  formatTanggalPanjang,
  pad2,
  tanggalISO,
  type KegiatanItem,
} from "@/components/laporan/types";

// Daftar bulanan baca-saja untuk superadmin. Tanpa tombol tambah/ubah/hapus.
export function AdminMonthlyList({
  tahun,
  bulan,
  items,
}: {
  tahun: number;
  bulan: number;
  items: KegiatanItem[];
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, KegiatanItem[]>();
    for (const item of items) {
      const list = map.get(item.tanggal) ?? [];
      list.push(item);
      map.set(item.tanggal, list);
    }
    return map;
  }, [items]);

  const dayCount = new Date(tahun, bulan, 0).getDate();

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">
        {NAMA_BULAN[bulan - 1]} {tahun}
      </h2>

      <div className="mt-4 flex flex-col gap-6">
        {Array.from({ length: dayCount }, (_, i) => {
          const hari = i + 1;
          const tanggal = tanggalISO(tahun, bulan, hari);
          const daftar = grouped.get(tanggal) ?? [];
          if (daftar.length === 0) return null;
          return (
            <section key={tanggal} aria-label={formatTanggalPanjang(tanggal)}>
              <h3 className="text-sm font-semibold">
                {pad2(hari)} {NAMA_BULAN[bulan - 1]}
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {daftar.map((item) => (
                  <li
                    key={item.id}
                    className="shadow-subtle rounded-lg border border-border bg-white px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/admin/laporan/${item.id}`}
                        className="min-w-0 flex-1 text-sm font-medium hover:text-accent"
                      >
                        {item.nama}
                      </Link>
                      <ReviewBadge status={item.review?.status ?? null} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.keterangan.length === 0
                        ? "Belum ada keterangan"
                        : `${item.keterangan.length} keterangan`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {items.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Belum ada kegiatan pada bulan ini.
        </p>
      )}
    </div>
  );
}
