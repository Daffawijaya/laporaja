import type { Database } from "@/lib/supabase/database.types";

export type KeteranganRow = Database["public"]["Tables"]["keterangan_kegiatan"]["Row"];
export type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

export interface KegiatanItem {
  id: string;
  tanggal: string;
  nama: string;
  keterangan: KeteranganRow[];
  review: Pick<ReviewRow, "status" | "catatan"> | null;
}

export const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function tanggalISO(tahun: number, bulan: number, hari: number): string {
  return `${tahun}-${pad2(bulan)}-${pad2(hari)}`;
}

export function formatTanggalPanjang(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const tanggal = new Date(y, m - 1, d);
  const hari = tanggal.toLocaleDateString("id-ID", { weekday: "long" });
  return `${hari}, ${pad2(d)} ${NAMA_BULAN[m - 1]} ${y}`;
}
