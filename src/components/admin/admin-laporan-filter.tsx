"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { GlassSelect } from "@/components/ui/glass-select";
import { NAMA_BULAN } from "@/components/laporan/types";

export interface UserOption {
  id: string;
  nama: string;
  username: string;
}

export function AdminLaporanFilter({
  users,
  selectedUserId,
  bulan,
  tahun,
}: {
  users: UserOption[];
  selectedUserId: string;
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

  function go(next: { user?: string; bulan?: number; tahun?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("user", next.user ?? selectedUserId);
    params.set("bulan", String(next.bulan ?? bulan));
    params.set("tahun", String(next.tahun ?? tahun));
    router.push(`/admin/laporan?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <GlassSelect
        ariaLabel="Pilih user"
        value={selectedUserId}
        onChange={(next) => go({ user: next })}
        options={[
          { value: "", label: "Pilih user" },
          ...users.map((user) => ({
            value: user.id,
            label: `${user.nama} (${user.username})`,
          })),
        ]}
        className="w-auto max-w-full"
      />

      <GlassSelect
        ariaLabel="Pilih bulan"
        value={String(bulan)}
        onChange={(next) => go({ bulan: Number(next) })}
        options={NAMA_BULAN.map((nama, index) => ({
          value: String(index + 1),
          label: nama,
        }))}
        className="w-auto"
      />

      <GlassSelect
        ariaLabel="Pilih tahun"
        value={String(tahun)}
        onChange={(next) => go({ tahun: Number(next) })}
        options={tahunList.map((y) => ({ value: String(y), label: String(y) }))}
        className="w-auto"
      />
    </div>
  );
}
