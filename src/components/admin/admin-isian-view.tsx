import { EmptyState } from "@/components/ui/empty-state";
import { RefListCard } from "@/components/ui/ref-list-card";
import { formatTanggalPanjang } from "@/components/laporan/types";
import { GambarNilaiTampil } from "@/components/laporan/gambar-nilai";
import { parseGambarNilai } from "@/lib/laporan-tambahan/queries";
import type { TugasLaporan } from "@/lib/laporan-tambahan/queries";
import { RevisiBarisButton } from "@/components/admin/revisi-baris-button";

// Nilai tanggal (YYYY-MM-DD) ditampilkan sebagai "hari, tanggal bulan tahun".
function formatSel(tipe: string, raw: string): string {
  if (!raw) return "-";
  if (tipe === "image") return parseGambarNilai(raw)?.deskripsi || "Gambar";
  if (tipe !== "date") return raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  try {
    return formatTanggalPanjang(raw);
  } catch {
    return raw;
  }
}

// Isian satu user untuk admin: baca-saja (tabel, esai, judul) + tombol
// Revisi per baris tabel (tanda + catatan revisi per baris).
export function AdminIsianView({
  tugas,
  revisiAwal,
}: {
  tugas: TugasLaporan[];
  /** Petunjuk baris → catatan revisi yang sedang aktif. */
  revisiAwal: Record<string, string>;
}) {
  if (tugas.length === 0) {
    return (
      <EmptyState
        title="Belum ada tugas"
        description="Tidak ada section untuk bidang user ini."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {tugas.map((item) => (
        <RefListCard key={item.id} ariaLabel={item.judul} title={item.judul}>
          {item.format === "judul" ? (
            item.deskripsi ? (
              <p className="px-1 text-sm whitespace-pre-wrap text-neutral-500">
                {item.deskripsi}
              </p>
            ) : (
              <p className="px-1 text-sm text-neutral-500">-</p>
            )
          ) : item.format === "esai" ? (
            item.kolom.length <= 1 ? (
              (() => {
                const kolomId = item.kolom[0]?.id ?? "";
                const teks = item.baris[0] ? (item.baris[0].nilai[kolomId] ?? "") : "";
                return teks ? (
                  <p className="px-1 text-sm whitespace-pre-wrap">{teks}</p>
                ) : (
                  <p className="px-1 text-sm text-neutral-500">Belum diisi.</p>
                );
              })()
            ) : item.baris.length === 0 ? (
              <p className="px-1 text-sm text-neutral-500">Belum diisi.</p>
            ) : (
              <div className="flex flex-col gap-3 px-1">
                {item.kolom.map((col) => (
                  <div key={col.id}>
                    <p className="text-sm font-semibold">{col.label}</p>
                    <p className="mt-0.5 text-sm whitespace-pre-wrap">
                      {item.baris[0]?.nilai[col.id] || "-"}
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : item.baris.length === 0 ? (
            <p className="px-1 text-sm text-neutral-500">Belum diisi.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-xs">
                <thead>
                  <tr className="text-left text-neutral-500">
                    {item.kolom.map((col) => (
                      <th key={col.id} scope="col" className="px-2 py-1.5 font-medium">
                        {col.label}
                      </th>
                    ))}
                    <th scope="col" className="w-24 px-2 py-1.5">
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/70 dark:divide-white/10">
                  {item.baris.map((row) => (
                    <tr key={row.id} className="align-top">
                    {item.kolom.map((col) => (
                      <td key={col.id} className="px-2 py-1.5 whitespace-pre-wrap">
                        {col.tipe === "image" ? (
                          (() => {
                            const parsed = parseGambarNilai(row.nilai[col.id] ?? "");
                            return parsed ? (
                              <GambarNilaiTampil
                                path={parsed.gambar}
                                deskripsi={parsed.deskripsi}
                                ukuran="md"
                              />
                            ) : (
                              "-"
                            );
                          })()
                        ) : (
                          formatSel(col.tipe, row.nilai[col.id] ?? "")
                        )}
                      </td>
                    ))}
                      <td className="px-2 py-1.5 text-right">
                        <RevisiBarisButton
                          barisId={row.id}
                          catatanAwal={revisiAwal[row.id] ?? null}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </RefListCard>
      ))}
    </div>
  );
}
