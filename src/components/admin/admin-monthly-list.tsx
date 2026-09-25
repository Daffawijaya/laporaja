"use client";

import { useMemo } from "react";
import Link from "next/link";

import { ReviewBadge } from "@/components/laporan/review-badge";
import { formatHariTanggal, type KegiatanItem } from "@/components/laporan/types";

// Daftar bulanan baca-saja untuk superadmin. Tanpa tombol tambah/ubah/hapus.
export function AdminMonthlyList({
  items,
}: {
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

  const days = useMemo(() => [...grouped.keys()].sort(), [grouped]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada kegiatan pada bulan ini.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((tanggal) => {
        const daftar = grouped.get(tanggal) ?? [];
        return (
          <section key={tanggal} aria-label={formatHariTanggal(tanggal)}>
            <h2 className="text-sm font-semibold">{formatHariTanggal(tanggal)}</h2>
            <ul className="panel mt-2 divide-y divide-border overflow-hidden rounded-lg">
              {daftar.map((item) => (
                <li key={item.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/laporan/${item.id}`}
                      className="min-w-0 flex-1 text-sm font-medium transition-soft hover:text-accent"
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
                  {item.review?.status === "revision" && item.review.catatan && (
                    <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                      {item.review.catatan}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
