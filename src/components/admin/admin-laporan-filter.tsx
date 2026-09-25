"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui/select";
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
      <Select
        aria-label="Pilih user"
        value={selectedUserId}
        onChange={(event) => go({ user: event.target.value })}
        className="w-auto max-w-full"
      >
        <option value="">Pilih user</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.nama} ({user.username})
          </option>
        ))}
      </Select>

      <Select
        aria-label="Pilih bulan"
        value={bulan}
        onChange={(event) => go({ bulan: Number(event.target.value) })}
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
        onChange={(event) => go({ tahun: Number(event.target.value) })}
        className="w-auto"
      >
        {tahunList.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}
