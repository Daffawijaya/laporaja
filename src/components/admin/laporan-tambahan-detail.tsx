"use client";

import { RefListCard } from "@/components/ui/ref-list-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTanggalPanjang } from "@/components/laporan/types";
import type { LaporanDetailAdmin } from "@/lib/laporan-tambahan/queries";

// Nilai tanggal (YYYY-MM-DD) ditampilkan sebagai "hari, tanggal bulan tahun".
function formatNilai(tipe: string, raw: string | null | undefined): string {
  if (!raw) return "-";
  if (tipe !== "date") return raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  try {
    return formatTanggalPanjang(raw);
  } catch {
    return raw;
  }
}

// Detail satu laporan tambahan untuk admin: definisi kolom + status isi
// per user target + seluruh baris isian yang dikelompokkan per pengisi.
export function LaporanTambahanDetail({ detail }: { detail: LaporanDetailAdmin }) {
  const belum = detail.target.filter((user) => !user.terisi);
  const barisByUser = new Map<string, typeof detail.baris>();
  for (const row of detail.baris) {
    const arr = barisByUser.get(row.userNama || row.username) ?? [];
    arr.push(row);
    barisByUser.set(row.userNama || row.username, arr);
  }

  return (
    <div className="w-full">
      <RefListCard ariaLabel="Status pengisian">
        {detail.deskripsi && (
          <p className="mb-3 px-1 text-sm whitespace-pre-wrap text-neutral-500">
            {detail.deskripsi}
          </p>
        )}
        <ul className="divide-y divide-neutral-200/70 text-sm dark:divide-white/10">
          <li className="flex items-center justify-between gap-3 px-1 pb-3">
            <span className="text-sm font-medium">Kolom isian</span>
            <span className="shrink-0 text-xs text-neutral-500">
              {detail.kolom.length} kolom
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 px-1 py-3">
            <span className="text-sm font-medium">Bidang</span>
            <span className="max-w-[65%] text-right text-xs text-neutral-500">
              {detail.bidang.map((bidang) => bidang.nama).join(", ") || "-"}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 px-1 pt-3">
            <span className="text-sm font-medium">Terisi</span>
            <span className="shrink-0 text-xs text-neutral-500">
              {detail.target.length === 0
                ? "Belum ada user target"
                : `${detail.target.length - belum.length}/${detail.target.length} user`}
            </span>
          </li>
        </ul>
        {detail.kolom.length > 0 && (
          <p className="mt-3 px-1 text-xs text-neutral-500">
            {detail.kolom.map((col) => `${col.label}${col.wajib ? "" : " (opsional)"}`).join(" · ")}
          </p>
        )}
        {belum.length > 0 && (
          <p className="mt-2 px-1 text-xs text-neutral-500">
            Belum mengisi: {belum.map((user) => user.nama).join(", ")}.
          </p>
        )}
      </RefListCard>

      <RefListCard ariaLabel="Baris isian" title="Baris isian" className="mt-4">
        {detail.baris.length === 0 ? (
          <EmptyState
            title="Belum ada isian"
            description="User bidang terkait belum mengisi laporan ini."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {[...barisByUser.entries()].map(([nama, rows]) => (
              <section key={nama} aria-label={`Isian ${nama}`}>
                <p className="px-1 text-sm font-medium">
                  {nama}
                  <span className="ml-2 text-xs font-normal text-neutral-500">
                    {rows.length} baris
                  </span>
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-xs">
                    <thead>
                      <tr className="text-left text-neutral-500">
                        <th scope="col" className="w-8 px-2 py-1.5 font-medium">No</th>
                        {detail.kolom.map((col) => (
                          <th key={col.id} scope="col" className="px-2 py-1.5 font-medium">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200/70 dark:divide-white/10">
                      {rows.map((row, index) => (
                        <tr key={row.id} className="align-top">
                          <td className="px-2 py-1.5 text-neutral-500">{index + 1}</td>
                          {detail.kolom.map((col) => (
                            <td key={col.id} className="px-2 py-1.5 whitespace-pre-wrap">
                              {formatNilai(col.tipe, row.nilai[col.id])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </RefListCard>
    </div>
  );
}
