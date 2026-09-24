import { createClient } from "@/lib/supabase/server";
import type { KegiatanItem } from "@/components/laporan/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export function clampBulan(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 12
    ? (n as number)
    : fallback;
}

export function clampTahun(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  return Number.isInteger(n) && (n as number) >= 2000 && (n as number) <= 2100
    ? (n as number)
    : fallback;
}

// Mengambil kegiatan satu bulan beserta keterangan (urut) dan review.
// Dipakai halaman user (milik sendiri) dan halaman review superadmin.
export async function getMonthlyLaporan(
  supabase: ServerClient,
  userId: string,
  tahun: number,
  bulan: number
): Promise<KegiatanItem[]> {
  const firstDay = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
  const lastDate = new Date(tahun, bulan, 0).getDate();
  const lastDay = `${tahun}-${String(bulan).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;

  const { data: kegiatanList } = await supabase
    .from("kegiatan")
    .select("*")
    .eq("user_id", userId)
    .gte("tanggal", firstDay)
    .lte("tanggal", lastDay)
    .order("tanggal")
    .order("created_at");

  const ids = (kegiatanList ?? []).map((kegiatan) => kegiatan.id);
  const keteranganByKegiatan = new Map<string, KegiatanItem["keterangan"]>();
  const reviewByKegiatan = new Map<string, KegiatanItem["review"]>();

  if (ids.length > 0) {
    const [{ data: keteranganList }, { data: reviewList }] = await Promise.all([
      supabase
        .from("keterangan_kegiatan")
        .select("*")
        .in("kegiatan_id", ids)
        .order("kegiatan_id")
        .order("urutan"),
      supabase.from("reviews").select("kegiatan_id, status, catatan").in("kegiatan_id", ids),
    ]);
    for (const row of keteranganList ?? []) {
      const list = keteranganByKegiatan.get(row.kegiatan_id) ?? [];
      list.push(row);
      keteranganByKegiatan.set(row.kegiatan_id, list);
    }
    for (const review of reviewList ?? []) {
      reviewByKegiatan.set(review.kegiatan_id, review);
    }
  }

  return (kegiatanList ?? []).map((kegiatan) => ({
    id: kegiatan.id,
    tanggal: kegiatan.tanggal,
    nama: kegiatan.nama_kegiatan,
    keterangan: keteranganByKegiatan.get(kegiatan.id) ?? [],
    review: reviewByKegiatan.get(kegiatan.id) ?? null,
  }));
}
