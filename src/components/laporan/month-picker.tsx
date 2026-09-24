"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { NAMA_BULAN } from "@/components/laporan/types";

export function MonthPicker({
  bulan,
  tahun,
}: {
  bulan: number;
  tahun: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const now = new Date();
  const tahunList: number[] = [];
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) {
    tahunList.push(y);
  }

  function go(nextBulan: number, nextTahun: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("bulan", String(nextBulan));
    params.set("tahun", String(nextTahun));
    router.push(`/laporan/bulan?${params.toString()}`);
  }

  const selectClass =
    "shadow-subtle transition-soft min-h-[44px] rounded-md border border-border bg-white px-3 text-sm text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="pilih-bulan" className="sr-only">
        Pilih bulan
      </label>
      <select
        id="pilih-bulan"
        value={bulan}
        onChange={(event) => go(Number(event.target.value), tahun)}
        className={selectClass}
      >
        {NAMA_BULAN.map((nama, index) => (
          <option key={nama} value={index + 1}>
            {nama}
          </option>
        ))}
      </select>

      <label htmlFor="pilih-tahun" className="sr-only">
        Pilih tahun
      </label>
      <select
        id="pilih-tahun"
        value={tahun}
        onChange={(event) => go(bulan, Number(event.target.value))}
        className={selectClass}
      >
        {tahunList.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => go(now.getMonth() + 1, now.getFullYear())}
        className="transition-soft flex min-h-[44px] items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Bulan ini
      </button>
    </div>
  );
}
