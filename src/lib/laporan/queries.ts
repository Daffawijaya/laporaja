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

  const { data: kegiatanList, error: kegiatanError } = await supabase
    .from("kegiatan")
    .select("*")
    .eq("user_id", userId)
    .gte("tanggal", firstDay)
    .lte("tanggal", lastDay)
    .order("tanggal")
    .order("created_at");
  if (kegiatanError) throw new Error("Gagal memuat daftar kegiatan. Coba lagi.");

  const ids = (kegiatanList ?? []).map((kegiatan) => kegiatan.id);
  const keteranganByKegiatan = new Map<string, KegiatanItem["keterangan"]>();
  const reviewByKegiatan = new Map<string, KegiatanItem["review"]>();
  const indikatorByKegiatan = new Map<string, string[]>();

  if (ids.length > 0) {
    const [keteranganResult, reviewResult, indikatorResult] = await Promise.all([
      supabase
        .from("keterangan_kegiatan")
        .select("*")
        .in("kegiatan_id", ids)
        .order("kegiatan_id")
        .order("urutan"),
      supabase.from("reviews").select("kegiatan_id, status, catatan").in("kegiatan_id", ids),
      supabase.from("kegiatan_indikator").select("kegiatan_id, indikator_id").in("kegiatan_id", ids),
    ]);
    if (keteranganResult.error || reviewResult.error || indikatorResult.error) {
      throw new Error("Gagal memuat keterangan kegiatan. Coba lagi.");
    }
    const keteranganList = keteranganResult.data;
    const reviewList = reviewResult.data;
    for (const row of keteranganList ?? []) {
      const list = keteranganByKegiatan.get(row.kegiatan_id) ?? [];
      list.push(row);
      keteranganByKegiatan.set(row.kegiatan_id, list);
    }
    for (const review of reviewList ?? []) {
      reviewByKegiatan.set(review.kegiatan_id, review);
    }
    for (const link of indikatorResult.data ?? []) {
      const list = indikatorByKegiatan.get(link.kegiatan_id) ?? [];
      list.push(link.indikator_id);
      indikatorByKegiatan.set(link.kegiatan_id, list);
    }
  }

  return (kegiatanList ?? []).map((kegiatan) => ({
    id: kegiatan.id,
    tanggal: kegiatan.tanggal,
    nama: kegiatan.nama_kegiatan,
    keterangan: keteranganByKegiatan.get(kegiatan.id) ?? [],
    review: reviewByKegiatan.get(kegiatan.id) ?? null,
    indikatorIds: indikatorByKegiatan.get(kegiatan.id) ?? [],
  }));
}

// Jumlah kegiatan milik user yang berstatus revisi (badge bel mobile).
export async function countRevision(
  supabase: ServerClient,
  userId: string
): Promise<number> {
  const { data: kegiatanList, error: kegiatanError } = await supabase
    .from("kegiatan")
    .select("id")
    .eq("user_id", userId);
  if (kegiatanError) throw new Error("Gagal memuat notifikasi. Coba lagi.");
  const ids = (kegiatanList ?? []).map((kegiatan) => kegiatan.id);
  if (ids.length === 0) return 0;
  const { count, error: reviewError } = await supabase
    .from("reviews")
    .select("kegiatan_id", { count: "exact", head: true })
    .in("kegiatan_id", ids)
    .eq("status", "revision");
  if (reviewError) throw new Error("Gagal memuat notifikasi. Coba lagi.");
  return count ?? 0;
}

// Jumlah kegiatan tanpa review (badge bel mobile superadmin).
export async function countPendingReview(supabase: ServerClient): Promise<number> {
  const [{ data: kegiatanList, error: kegiatanError }, { data: reviewList, error: reviewError }] =
    await Promise.all([
      supabase.from("kegiatan").select("id"),
      supabase.from("reviews").select("kegiatan_id"),
    ]);
  if (kegiatanError || reviewError) {
    throw new Error("Gagal memuat notifikasi. Coba lagi.");
  }
  const reviewed = new Set((reviewList ?? []).map((review) => review.kegiatan_id));
  return (kegiatanList ?? []).filter((kegiatan) => !reviewed.has(kegiatan.id)).length;
}

export interface RevisiItem {
  id: string;
  tanggal: string;
  nama: string;
  catatan: string | null;
}

// Daftar kegiatan user yang berstatus revisi untuk halaman notifikasi.
export async function getRevisionList(
  supabase: ServerClient,
  userId: string
): Promise<RevisiItem[]> {
  const { data: kegiatanList, error: kegiatanError } = await supabase
    .from("kegiatan")
    .select("id, tanggal, nama_kegiatan")
    .eq("user_id", userId)
    .order("tanggal", { ascending: false });
  if (kegiatanError) throw new Error("Gagal memuat notifikasi. Coba lagi.");
  const ids = (kegiatanList ?? []).map((kegiatan) => kegiatan.id);
  if (ids.length === 0) return [];
  const { data: reviewList, error: reviewError } = await supabase
    .from("reviews")
    .select("kegiatan_id, catatan")
    .in("kegiatan_id", ids)
    .eq("status", "revision");
  if (reviewError) throw new Error("Gagal memuat notifikasi. Coba lagi.");
  const catatanById = new Map(
    (reviewList ?? []).map((review) => [review.kegiatan_id, review.catatan])
  );
  return (kegiatanList ?? [])
    .filter((kegiatan) => catatanById.has(kegiatan.id))
    .map((kegiatan) => ({
      id: kegiatan.id,
      tanggal: kegiatan.tanggal,
      nama: kegiatan.nama_kegiatan,
      catatan: catatanById.get(kegiatan.id) ?? null,
    }));
}
