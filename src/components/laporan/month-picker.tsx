"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
  const startYear = Math.min(now.getFullYear() - 3, tahun);
  const endYear = Math.max(now.getFullYear() + 1, tahun);
  const tahunList: number[] = [];
  for (let y = startYear; y <= endYear; y++) tahunList.push(y);

  const isCurrent = bulan === now.getMonth() + 1 && tahun === now.getFullYear();

  function go(nextBulan: number, nextTahun: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("bulan", String(nextBulan));
    params.set("tahun", String(nextTahun));
    router.push(`/laporan?${params.toString()}`);
  }

  function shift(delta: number) {
    const total = tahun * 12 + (bulan - 1) + delta;
    go((total % 12) + 1, Math.floor(total / 12));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={() => shift(-1)}
        aria-label="Bulan sebelumnya"
      >
        <ChevronLeft aria-hidden="true" />
      </Button>

      <Select
        aria-label="Pilih bulan"
        value={bulan}
        onChange={(event) => go(Number(event.target.value), tahun)}
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
        onChange={(event) => go(bulan, Number(event.target.value))}
        className="w-auto"
      >
        {tahunList.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>

      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={() => shift(1)}
        aria-label="Bulan berikutnya"
      >
        <ChevronRight aria-hidden="true" />
      </Button>

      {!isCurrent && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => go(now.getMonth() + 1, now.getFullYear())}
        >
          Bulan ini
        </Button>
      )}
    </div>
  );
}
