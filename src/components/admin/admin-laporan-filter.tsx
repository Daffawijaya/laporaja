"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { NAMA_BULAN } from "@/components/laporan/types";

export interface UserOption {
  id: string;
  nama: string;
  username: string;
}

const selectClass =
  "shadow-subtle transition-soft min-h-[44px] rounded-md border border-border bg-white px-3 text-sm text-foreground";

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
  const tahunList: number[] = [];
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) {
    tahunList.push(y);
  }

  function go(next: { user?: string; bulan?: number; tahun?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("user", next.user ?? selectedUserId);
    params.set("bulan", String(next.bulan ?? bulan));
    params.set("tahun", String(next.tahun ?? tahun));
    router.push(`/admin/laporan?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="filter-user" className="sr-only">
        Pilih user
      </label>
      <select
        id="filter-user"
        value={selectedUserId}
        onChange={(event) => go({ user: event.target.value })}
        className={`${selectClass} max-w-full`}
      >
        <option value="">Pilih user</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.nama} ({user.username})
          </option>
        ))}
      </select>

      <label htmlFor="filter-bulan" className="sr-only">
        Pilih bulan
      </label>
      <select
        id="filter-bulan"
        value={bulan}
        onChange={(event) => go({ bulan: Number(event.target.value) })}
        className={selectClass}
      >
        {NAMA_BULAN.map((nama, index) => (
          <option key={nama} value={index + 1}>
            {nama}
          </option>
        ))}
      </select>

      <label htmlFor="filter-tahun" className="sr-only">
        Pilih tahun
      </label>
      <select
        id="filter-tahun"
        value={tahun}
        onChange={(event) => go({ tahun: Number(event.target.value) })}
        className={selectClass}
      >
        {tahunList.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
