import { createClient } from "@/lib/supabase/server";
import type { KegiatanItem } from "@/components/laporan/types";
import type { MonthlyReviewStatus } from "@/lib/supabase/database.types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type MonthStatus = MonthlyReviewStatus;

export interface MonthlyReviewState {
  rekomendasi: string | null;
  /** Status baris monthly_reviews; 'menunggu' bila baris belum ada. */
  status: MonthStatus;
  /** Catatan revisi admin untuk rekomendasi. */
  catatan: string | null;
}

// Satu review bulanan milik user (rata-rata belum ada barisnya = menunggu).
export async function getMonthlyReview(
  supabase: ServerClient,
  userId: string,
  tahun: number,
  bulan: number
): Promise<MonthlyReviewState> {
  const { data, error } = await supabase
    .from("monthly_reviews")
    .select("rekomendasi, status, catatan")
    .eq("user_id", userId)
    .eq("tahun", tahun)
    .eq("bulan", bulan)
    .maybeSingle();
  if (error) throw new Error("Gagal memuat status laporan bulanan. Coba lagi.");
  return {
    rekomendasi: data?.rekomendasi ?? null,
    status: data?.status ?? "menunggu",
    catatan: data?.catatan ?? null,
  };
}

// Status turunan satu bulan: approved > revision > menunggu. Revisi dihitung
// dari rekomendasi maupun sisa revisi per-kegiatan yang masih aktif.
export function deriveMonthStatus(
  monthly: Pick<MonthlyReviewState, "status">,
  revisiKegiatan: number
): MonthStatus {
  if (monthly.status === "approved") return "approved";
  if (monthly.status === "revision" || revisiKegiatan > 0) return "revision";
  return "menunggu";
}

// Kunci "YYYY-MM" dari kolom tanggal ISO.
function monthKeyFromTanggal(tanggal: string): string | null {
  const ym = String(tanggal).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(ym) ? ym : null;
}

function monthKey(tahun: number, bulan: number): string {
  return `${tahun}-${String(bulan).padStart(2, "0")}`;
}

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

// Jumlah LAPORAN BULANAN milik user yang butuh perhatian (badge bel):
// berstatus revisi (rekomendasi maupun sisa revisi per-kegiatan), di luar
// yang sudah disetujui.
export async function countRevision(
  supabase: ServerClient,
  userId: string
): Promise<number> {
  const { data: kegiatanList, error: kegiatanError } = await supabase
    .from("kegiatan")
    .select("id, tanggal")
    .eq("user_id", userId);
  if (kegiatanError) throw new Error("Gagal memuat notifikasi. Coba lagi.");
  const list = kegiatanList ?? [];
  if (list.length === 0) return 0;
  const tanggalById = new Map(list.map((kegiatan) => [kegiatan.id, kegiatan.tanggal]));
  const ids = [...tanggalById.keys()];
  const [reviewResult, monthlyResult] = await Promise.all([
    supabase.from("reviews").select("kegiatan_id").in("kegiatan_id", ids).eq("status", "revision"),
    supabase.from("monthly_reviews").select("tahun, bulan, status").eq("user_id", userId),
  ]);
  if (reviewResult.error || monthlyResult.error) {
    throw new Error("Gagal memuat notifikasi. Coba lagi.");
  }
  const approved = new Set(
    (monthlyResult.data ?? [])
      .filter((row) => row.status === "approved")
      .map((row) => monthKey(row.tahun, row.bulan))
  );
  const perlu = new Set<string>();
  for (const row of monthlyResult.data ?? []) {
    if (row.status === "revision") perlu.add(monthKey(row.tahun, row.bulan));
  }
  for (const review of reviewResult.data ?? []) {
    const ym = monthKeyFromTanggal(tanggalById.get(review.kegiatan_id) ?? "");
    if (ym) perlu.add(ym);
  }
  let count = 0;
  for (const ym of perlu) {
    if (!approved.has(ym)) count += 1;
  }
  return count;
}

// Jumlah LAPORAN BULANAN (pasangan user-bulan berisi kegiatan) yang belum
// disetujui (badge bel superadmin). Boolean menunggu per laporan orang.
export async function countPendingReview(supabase: ServerClient): Promise<number> {
  const [{ data: kegiatanList, error: kegiatanError }, { data: approvedList, error: approvedError }] =
    await Promise.all([
      supabase.from("kegiatan").select("user_id, tanggal"),
      supabase.from("monthly_reviews").select("user_id, tahun, bulan").eq("status", "approved"),
    ]);
  if (kegiatanError || approvedError) {
    throw new Error("Gagal memuat notifikasi. Coba lagi.");
  }
  const approved = new Set(
    (approvedList ?? []).map((row) => `${row.user_id}|${monthKey(row.tahun, row.bulan)}`)
  );
  const menunggu = new Set<string>();
  for (const kegiatan of kegiatanList ?? []) {
    const ym = monthKeyFromTanggal(kegiatan.tanggal);
    if (!ym) continue;
    const key = `${kegiatan.user_id}|${ym}`;
    if (!approved.has(key)) menunggu.add(key);
  }
  return menunggu.size;
}

export interface RevisiBulan {
  tahun: number;
  bulan: number;
  /** Catatan revisi admin untuk rekomendasi (bila ada). */
  catatan: string | null;
  /** Sisa kegiatan berstatus revisi pada bulan itu. */
  revisiKegiatan: number;
}

// Daftar laporan bulanan user yang berstatus revisi untuk halaman notifikasi.
export async function getRevisionList(
  supabase: ServerClient,
  userId: string
): Promise<RevisiBulan[]> {
  const { data: kegiatanList, error: kegiatanError } = await supabase
    .from("kegiatan")
    .select("id, tanggal")
    .eq("user_id", userId);
  if (kegiatanError) throw new Error("Gagal memuat notifikasi. Coba lagi.");
  const list = kegiatanList ?? [];
  const tanggalById = new Map(list.map((kegiatan) => [kegiatan.id, kegiatan.tanggal]));
  const ids = [...tanggalById.keys()];
  const [reviewResult, monthlyResult] =
    ids.length === 0
      ? [{ data: [], error: null }, await supabase.from("monthly_reviews").select("tahun, bulan, status, catatan").eq("user_id", userId)]
      : await Promise.all([
          supabase.from("reviews").select("kegiatan_id").in("kegiatan_id", ids).eq("status", "revision"),
          supabase.from("monthly_reviews").select("tahun, bulan, status, catatan").eq("user_id", userId),
        ]);
  if (reviewResult.error || monthlyResult.error) {
    throw new Error("Gagal memuat notifikasi. Coba lagi.");
  }
  const monthlyByKey = new Map(
    (monthlyResult.data ?? []).map((row) => [monthKey(row.tahun, row.bulan), row])
  );
  const agregat = new Map<string, RevisiBulan>();
  function ensure(tahun: number, bulan: number): RevisiBulan {
    const key = monthKey(tahun, bulan);
    let row = agregat.get(key);
    if (!row) {
      row = { tahun, bulan, catatan: null, revisiKegiatan: 0 };
      agregat.set(key, row);
    }
    return row;
  }
  for (const row of monthlyResult.data ?? []) {
    if (row.status !== "revision") continue;
    ensure(row.tahun, row.bulan).catatan = row.catatan;
  }
  for (const review of reviewResult.data ?? []) {
    const ym = monthKeyFromTanggal(tanggalById.get(review.kegiatan_id) ?? "");
    if (!ym) continue;
    const [tahun, bulan] = ym.split("-").map(Number);
    ensure(tahun, bulan).revisiKegiatan += 1;
  }
  // Yang sudah disetujui tidak ikut (selesai).
  return [...agregat.values()]
    .filter((row) => monthlyByKey.get(monthKey(row.tahun, row.bulan))?.status !== "approved")
    .sort((a, b) => b.tahun - a.tahun || b.bulan - a.bulan);
}

export interface MonthSummary {
  bulan: number;
  total: number;
  disetujui: number;
  revisi: number;
  menunggu: number;
  /** Status bulanan turunan (boolean menunggu per laporan orang). */
  status: MonthStatus;
}

// Rekap satu tahun milik user: hitungan kegiatan + status review per bulan.
// Dipakai arsip bulan-dulu di halaman laporan user (selalu 12 baris,
// bulan kosong tetap muncul dengan nol agar bisa diklik).
export async function getYearlySummary(
  supabase: ServerClient,
  userId: string,
  tahun: number
): Promise<MonthSummary[]> {
  const [{ data: kegiatanList, error: kegiatanError }, { data: monthlyList, error: monthlyError }] =
    await Promise.all([
      supabase
        .from("kegiatan")
        .select("id, tanggal")
        .eq("user_id", userId)
        .gte("tanggal", `${tahun}-01-01`)
        .lte("tanggal", `${tahun}-12-31`),
      supabase.from("monthly_reviews").select("tahun, bulan, status").eq("user_id", userId).eq("tahun", tahun),
    ]);
  if (kegiatanError || monthlyError) throw new Error("Gagal memuat rekap tahunan. Coba lagi.");
  const list = kegiatanList ?? [];
  const statusById = new Map<string, string>();
  if (list.length > 0) {
    const { data: reviewList, error: reviewError } = await supabase
      .from("reviews")
      .select("kegiatan_id, status")
      .in(
        "kegiatan_id",
        list.map((kegiatan) => kegiatan.id)
      );
    if (reviewError) throw new Error("Gagal memuat rekap tahunan. Coba lagi.");
    for (const review of reviewList ?? []) {
      statusById.set(review.kegiatan_id, review.status);
    }
  }
  const monthlyByBulan = new Map(
    (monthlyList ?? []).map((row) => [row.bulan, row.status])
  );
  const summary: MonthSummary[] = Array.from({ length: 12 }, (_, index) => ({
    bulan: index + 1,
    total: 0,
    disetujui: 0,
    revisi: 0,
    menunggu: 0,
    status: "menunggu",
  }));
  for (const kegiatan of list) {
    const bulan = parseInt(String(kegiatan.tanggal).slice(5, 7), 10);
    if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) continue;
    const row = summary[bulan - 1];
    row.total += 1;
    const status = statusById.get(kegiatan.id);
    if (status === "approved") row.disetujui += 1;
    else if (status === "revision") row.revisi += 1;
    else row.menunggu += 1;
  }
  for (const row of summary) {
    row.status = deriveMonthStatus(
      { status: monthlyByBulan.get(row.bulan) ?? "menunggu" },
      row.revisi
    );
  }
  return summary;
}

export interface UserMonthStat {
  id: string;
  nama: string;
  username: string;
  total: number;
  /** Sisa revisi per-kegiatan yang masih aktif bulan itu. */
  revisiKegiatan: number;
  /** Status bulanan turunan. */
  status: MonthStatus;
}

// Status bulanan semua user untuk rekap superadmin (dipakai halaman
// admin/laporan lapis 1 dan dashboard admin).
export async function getUserMonthStats(
  supabase: ServerClient,
  users: { id: string; nama: string; username: string }[],
  tahun: number,
  bulan: number
): Promise<UserMonthStat[]> {
  if (users.length === 0) return [];
  const userIds = users.map((user) => user.id);
  const firstDay = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
  const lastDate = new Date(tahun, bulan, 0).getDate();
  const lastDay = `${tahun}-${String(bulan).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
  const [{ data: kegiatanList, error: kegiatanError }, { data: monthlyList, error: monthlyError }] =
    await Promise.all([
      supabase.from("kegiatan").select("id, user_id").in("user_id", userIds).gte("tanggal", firstDay).lte("tanggal", lastDay),
      supabase.from("monthly_reviews").select("user_id, status").eq("tahun", tahun).eq("bulan", bulan).in("user_id", userIds),
    ]);
  if (kegiatanError || monthlyError) throw new Error("Gagal memuat rekap bulanan. Coba lagi.");
  const kegiatanBulanIni = kegiatanList ?? [];
  const idsBulanIni = kegiatanBulanIni.map((kegiatan) => kegiatan.id);
  const revisionIds = new Set<string>();
  if (idsBulanIni.length > 0) {
    const { data: reviewList, error: reviewError } = await supabase
      .from("reviews")
      .select("kegiatan_id")
      .in("kegiatan_id", idsBulanIni)
      .eq("status", "revision");
    if (reviewError) throw new Error("Gagal memuat rekap bulanan. Coba lagi.");
    for (const review of reviewList ?? []) revisionIds.add(review.kegiatan_id);
  }
  const totalByUser = new Map<string, number>();
  const revisiByUser = new Map<string, number>();
  for (const kegiatan of kegiatanBulanIni) {
    totalByUser.set(kegiatan.user_id, (totalByUser.get(kegiatan.user_id) ?? 0) + 1);
    if (revisionIds.has(kegiatan.id)) {
      revisiByUser.set(kegiatan.user_id, (revisiByUser.get(kegiatan.user_id) ?? 0) + 1);
    }
  }
  const monthlyByUser = new Map(
    (monthlyList ?? []).map((row) => [row.user_id, row.status])
  );
  return users.map((user) => {
    const total = totalByUser.get(user.id) ?? 0;
    const revisiKegiatan = revisiByUser.get(user.id) ?? 0;
    return {
      id: user.id,
      nama: user.nama,
      username: user.username,
      total,
      revisiKegiatan,
      status: deriveMonthStatus({ status: monthlyByUser.get(user.id) ?? "menunggu" }, revisiKegiatan),
    };
  });
}

