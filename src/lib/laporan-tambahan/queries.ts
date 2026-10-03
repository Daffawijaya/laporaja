import type { createClient } from "@/lib/supabase/server";
import type { KolomTipe, LaporanFormat, LaporanTambahanKolomRow, MonthlyReviewStatus } from "@/lib/supabase/database.types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type { KolomTipe, LaporanFormat, MonthlyReviewStatus };

export interface KolomDef {
  id: string;
  label: string;
  tipe: KolomTipe;
  wajib: boolean;
}

export interface BarisIsi {
  id: string;
  bulan: number;
  tahun: number;
  nilai: Record<string, string>;
}

/** Periode bulanan laporan user. */
export interface Periode {
  tahun: number;
  bulan: number;
}

export function labelPeriode(periode: Periode): string {
  const nama = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ][periode.bulan - 1] ?? `Bulan ${periode.bulan}`;
  return `${nama} ${periode.tahun}`;
}

export interface TugasLaporan {
  id: string;
  judul: string;
  deskripsi: string | null;
  /** Bentuk isian: tabel (baris-baris kolom), esai (satu teks panjang), atau judul (pembatas). */
  format: LaporanFormat;
  bidang: { id: string; nama: string }[];
  kolom: KolomDef[];
  baris: BarisIsi[];
  /** Terisi bila user punya minimal 1 baris. */
  terisi: boolean;
}

// Nilai kolom gambar disimpan sebagai JSON: {"gambar": path storage,
// "deskripsi": teks}. Keduanya wajib diisi.
export const GAMBAR_DESKRIPSI_MAKS = 1000;

export interface GambarNilai {
  gambar: string;
  deskripsi: string;
}

// Urai nilai JSON kolom gambar; null bila kosong/rusak.
export function parseGambarNilai(raw: string): GambarNilai | null {
  const teks = (raw ?? "").trim();
  if (!teks) return null;
  try {
    const parsed: unknown = JSON.parse(teks);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const gambar = typeof record.gambar === "string" ? record.gambar.trim() : "";
    const deskripsi = typeof record.deskripsi === "string" ? record.deskripsi.trim() : "";
    if (!gambar && !deskripsi) return null;
    return { gambar, deskripsi };
  } catch {
    return null;
  }
}

// Validasi nilai satu baris mengikuti definisi kolom admin.
// Kolom wajib harus terisi; tanggal YYYY-MM-DD; angka numerik;
// gambar = JSON {gambar, deskripsi} yang keduanya wajib.
export function cleanNilai(
  kolom: Pick<LaporanTambahanKolomRow, "id" | "label" | "tipe" | "wajib">[],
  input: Record<string, string>
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const col of kolom) {
    const value = (input[col.id] ?? "").trim();
    if (col.tipe === "image") {
      const gambar = parseGambarNilai(value);
      if (!gambar) {
        if (col.wajib) throw new Error(`Kolom "${col.label}" wajib diisi (gambar + deskripsi).`);
        cleaned[col.id] = "";
        continue;
      }
      if (!gambar.gambar || !gambar.deskripsi) {
        const kurang = !gambar.gambar ? "gambar" : "deskripsi";
        throw new Error(`Kolom "${col.label}": ${kurang} wajib diisi.`);
      }
      if (gambar.deskripsi.length > GAMBAR_DESKRIPSI_MAKS) {
        throw new Error(`Kolom "${col.label}" deskripsi maksimal ${GAMBAR_DESKRIPSI_MAKS} karakter.`);
      }
      cleaned[col.id] = JSON.stringify({ gambar: gambar.gambar, deskripsi: gambar.deskripsi });
      continue;
    }
    if (col.wajib && value.length === 0) {
      throw new Error(`Kolom "${col.label}" wajib diisi.`);
    }
    if (value.length > 0) {
      if (col.tipe === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`Kolom "${col.label}" harus berupa tanggal.`);
      }
      if (col.tipe === "number" && !/^-?\d+(\.\d+)?$/.test(value)) {
        throw new Error(`Kolom "${col.label}" harus berupa angka.`);
      }
      if (value.length > 2000) {
        throw new Error(`Kolom "${col.label}" maksimal 2000 karakter.`);
      }
    }
    cleaned[col.id] = value;
  }
  return cleaned;
}

async function namaBidang(
  supabase: ServerClient,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from("bidang").select("id, nama").in("id", ids);
  if (error) throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
  for (const row of data ?? []) map.set(row.id, row.nama);
  return map;
}

// Tugas wajib user: laporan yang tertaut ke bidangnya beserta definisi
// kolom dan baris yang sudah ia isi pada satu periode bulan (atau semua
// periode bila tanpa filter). Selesai = punya minimal 1 baris.
export async function getTugasUser(
  supabase: ServerClient,
  userId: string,
  bidangId: string | null,
  periode?: Periode | null
): Promise<TugasLaporan[]> {
  if (!bidangId) return [];
  const { data: links, error: linkError } = await supabase
    .from("laporan_tambahan_bidang")
    .select("laporan_id")
    .eq("bidang_id", bidangId);
  if (linkError) throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
  const ids = [...new Set((links ?? []).map((row) => row.laporan_id))];
  if (ids.length === 0) return [];

  const barisQuery = supabase
    .from("laporan_tambahan_baris")
    .select("id, laporan_id, bulan, tahun")
    .in("laporan_id", ids)
    .eq("user_id", userId)
    .order("laporan_id")
    .order("urutan");
  const [laporanResult, kolomResult, barisResult] = await Promise.all([
    supabase.from("laporan_tambahan").select("id, judul, deskripsi, format, urutan").in("id", ids).order("urutan").order("judul"),
    supabase
      .from("laporan_tambahan_kolom")
      .select("id, laporan_id, label, tipe, wajib")
      .in("laporan_id", ids)
      .order("laporan_id")
      .order("urutan"),
    periode
      ? barisQuery.eq("tahun", periode.tahun).eq("bulan", periode.bulan)
      : barisQuery,
  ]);
  if (laporanResult.error || kolomResult.error || barisResult.error) {
    throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
  }
  const laporanList = laporanResult.data ?? [];
  if (laporanList.length === 0) return [];

  const barisIds = (barisResult.data ?? []).map((row) => row.id);
  const nilaiByBaris = new Map<string, Record<string, string>>();
  if (barisIds.length > 0) {
    const { data: nilaiList, error: nilaiError } = await supabase
      .from("laporan_tambahan_nilai")
      .select("baris_id, kolom_id, nilai")
      .in("baris_id", barisIds);
    if (nilaiError) throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
    for (const nilai of nilaiList ?? []) {
      const map = nilaiByBaris.get(nilai.baris_id) ?? {};
      map[nilai.kolom_id] = nilai.nilai;
      nilaiByBaris.set(nilai.baris_id, map);
    }
  }

  const { data: semuaLink, error: semuaLinkError } = await supabase
    .from("laporan_tambahan_bidang")
    .select("laporan_id, bidang_id")
    .in("laporan_id", ids);
  if (semuaLinkError) throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
  const namaMap = await namaBidang(
    supabase,
    [...new Set((semuaLink ?? []).map((row) => row.bidang_id))]
  );
  const bidangByLaporan = new Map<string, { id: string; nama: string }[]>();
  for (const link of semuaLink ?? []) {
    const arr = bidangByLaporan.get(link.laporan_id) ?? [];
    arr.push({ id: link.bidang_id, nama: namaMap.get(link.bidang_id) ?? "" });
    bidangByLaporan.set(link.laporan_id, arr);
  }

  const kolomByLaporan = new Map<string, KolomDef[]>();
  for (const col of kolomResult.data ?? []) {
    const arr = kolomByLaporan.get(col.laporan_id) ?? [];
    arr.push({ id: col.id, label: col.label, tipe: col.tipe, wajib: col.wajib });
    kolomByLaporan.set(col.laporan_id, arr);
  }
  const barisByLaporan = new Map<string, BarisIsi[]>();
  for (const row of barisResult.data ?? []) {
    const arr = barisByLaporan.get(row.laporan_id) ?? [];
    arr.push({ id: row.id, bulan: row.bulan, tahun: row.tahun, nilai: nilaiByBaris.get(row.id) ?? {} });
    barisByLaporan.set(row.laporan_id, arr);
  }
  return laporanList.map((row) => {
    const baris = barisByLaporan.get(row.id) ?? [];
    const format = (row.format ?? "tabel") as LaporanFormat;
    return {
      id: row.id,
      judul: row.judul,
      deskripsi: row.deskripsi,
      // Blok judul hanya pembatas: tidak wajib diisi.
      format,
      bidang: bidangByLaporan.get(row.id) ?? [],
      kolom: kolomByLaporan.get(row.id) ?? [],
      baris,
      terisi: format === "judul" || baris.length > 0,
    };
  });
}

export interface BulanItem {
  tahun: number;
  bulan: number;
  status: string;
  /** Section terisi pada bulan itu (blok judul selalu terhitung). */
  terisi: number;
  total: number;
}

// Status review satu bulan milik user. Tanpa baris = masih menunggu
// (belum ditandai selesai).
export async function getStatusReview(
  supabase: ServerClient,
  userId: string,
  periode: Periode
): Promise<MonthlyReviewStatus> {
  const { data, error } = await supabase
    .from("monthly_reviews")
    .select("status")
    .eq("user_id", userId)
    .eq("tahun", periode.tahun)
    .eq("bulan", periode.bulan)
    .maybeSingle();
  if (error) throw new Error("Gagal memuat status laporan. Coba lagi.");
  return (data?.status ?? "menunggu") as MonthlyReviewStatus;
}

// Daftar bulan laporan milik user beserta ketuntasan isiannya.
export async function getBulanUser(
  supabase: ServerClient,
  userId: string,
  bidangId: string | null
): Promise<BulanItem[]> {
  const { data: bulanList, error: bulanError } = await supabase
    .from("monthly_reviews")
    .select("tahun, bulan, status")
    .eq("user_id", userId)
    .order("tahun", { ascending: false })
    .order("bulan", { ascending: false });
  if (bulanError) throw new Error("Gagal memuat daftar bulan. Coba lagi.");
  if (!bidangId) {
    return (bulanList ?? []).map((row) => ({
      tahun: row.tahun,
      bulan: row.bulan,
      status: row.status,
      terisi: 0,
      total: 0,
    }));
  }
  const [linkResult, laporanResult, barisResult] = await Promise.all([
    supabase.from("laporan_tambahan_bidang").select("laporan_id").eq("bidang_id", bidangId),
    supabase.from("laporan_tambahan").select("id, format"),
    supabase.from("laporan_tambahan_baris").select("laporan_id, tahun, bulan").eq("user_id", userId),
  ]);
  if (linkResult.error || laporanResult.error || barisResult.error) {
    throw new Error("Gagal memuat daftar bulan. Coba lagi.");
  }
  const tugasan = new Set((linkResult.data ?? []).map((row) => row.laporan_id));
  const judulOtomatis = new Set(
    (laporanResult.data ?? []).filter((row) => row.format === "judul").map((row) => row.id)
  );
  const isiPerBulan = new Map<string, Set<string>>();
  for (const row of barisResult.data ?? []) {
    const kunci = `${row.tahun}-${row.bulan}`;
    const set = isiPerBulan.get(kunci) ?? new Set<string>();
    set.add(row.laporan_id);
    isiPerBulan.set(kunci, set);
  }
  return (bulanList ?? []).map((row) => {
    const isian = isiPerBulan.get(`${row.tahun}-${row.bulan}`) ?? new Set<string>();
    let terisi = 0;
    for (const id of tugasan) {
      if (judulOtomatis.has(id) || isian.has(id)) terisi += 1;
    }
    return {
      tahun: row.tahun,
      bulan: row.bulan,
      status: row.status,
      terisi,
      total: tugasan.size,
    };
  });
}

export interface LaporanAdminItem {
  id: string;
  kind: "tambahan";
  judul: string;
  /** Deskripsi laporan dinamis. */
  deskripsi: string | null;
  /** Posisi susun di builder admin. */
  urutan: number;
  /** Bentuk isian laporan dinamis. */
  format: LaporanFormat;
  bidang: { id: string; nama: string }[];
  jumlahKolom: number;
  jumlahBaris: number;
  targetUser: number;
  terisiUser: number;
}

// Daftar semua laporan tambahan untuk halaman admin.
export async function getLaporanListAdmin(
  supabase: ServerClient
): Promise<LaporanAdminItem[]> {
  const { data: laporanList, error: laporanError } = await supabase
    .from("laporan_tambahan")
    .select("id, judul, deskripsi, format, urutan")
    .order("urutan")
    .order("judul");
  if (laporanError) throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
  const list = laporanList ?? [];
  if (list.length === 0) return [];

  const ids = list.map((row) => row.id);
  const [linkResult, kolomResult, barisResult, bidangResult] = await Promise.all([
    supabase.from("laporan_tambahan_bidang").select("laporan_id, bidang_id").in("laporan_id", ids),
    supabase.from("laporan_tambahan_kolom").select("laporan_id").in("laporan_id", ids),
    supabase.from("laporan_tambahan_baris").select("laporan_id, user_id").in("laporan_id", ids),
    supabase.from("bidang").select("id, nama").order("nama"),
  ]);
  if (linkResult.error || kolomResult.error || barisResult.error || bidangResult.error) {
    throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
  }
  const namaByBidang = new Map((bidangResult.data ?? []).map((row) => [row.id, row.nama]));
  const bidangByLaporan = new Map<string, { id: string; nama: string }[]>();
  const bidangIds = new Set<string>();
  for (const link of linkResult.data ?? []) {
    const arr = bidangByLaporan.get(link.laporan_id) ?? [];
    arr.push({ id: link.bidang_id, nama: namaByBidang.get(link.bidang_id) ?? "" });
    bidangByLaporan.set(link.laporan_id, arr);
    bidangIds.add(link.bidang_id);
  }
  const kolomByLaporan = new Map<string, number>();
  for (const col of kolomResult.data ?? []) {
    kolomByLaporan.set(col.laporan_id, (kolomByLaporan.get(col.laporan_id) ?? 0) + 1);
  }
  const pengisiByLaporan = new Map<string, Set<string>>();
  const jumlahByLaporan = new Map<string, number>();
  for (const row of barisResult.data ?? []) {
    const set = pengisiByLaporan.get(row.laporan_id) ?? new Set<string>();
    set.add(row.user_id);
    pengisiByLaporan.set(row.laporan_id, set);
    jumlahByLaporan.set(row.laporan_id, (jumlahByLaporan.get(row.laporan_id) ?? 0) + 1);
  }
  const targetByBidang = new Map<string, number>();
  if (bidangIds.size > 0) {
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("bidang_id")
      .eq("role", "user")
      .in("bidang_id", [...bidangIds]);
    if (usersError) throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
    for (const user of users ?? []) {
      if (!user.bidang_id) continue;
      targetByBidang.set(user.bidang_id, (targetByBidang.get(user.bidang_id) ?? 0) + 1);
    }
  }

  return list.map((row) => {
    const bidang = bidangByLaporan.get(row.id) ?? [];
    const targetUser = bidang.reduce((sum, item) => sum + (targetByBidang.get(item.id) ?? 0), 0);
    return {
      id: row.id,
      kind: "tambahan" as const,
      judul: row.judul,
      deskripsi: row.deskripsi,
      urutan: row.urutan ?? 0,
      format: (row.format ?? "tabel") as LaporanFormat,
      bidang,
      jumlahKolom: kolomByLaporan.get(row.id) ?? 0,
      jumlahBaris: jumlahByLaporan.get(row.id) ?? 0,
      targetUser,
      terisiUser: pengisiByLaporan.get(row.id)?.size ?? 0,
    };
  });
}

// Nilai pengaturan umum (mis. unit_kerja). Kosong bila baris belum ada.
export async function getPengaturan(
  supabase: ServerClient,
  kunci: string
): Promise<string> {
  const { data, error } = await supabase
    .from("pengaturan")
    .select("nilai")
    .eq("kunci", kunci)
    .maybeSingle();
  if (error) throw new Error("Gagal memuat pengaturan. Coba lagi.");
  return data?.nilai ?? "";
}

// Rekap isian semua user: jumlah section tertaut vs terisi per user.
//Dipakai daftar admin (tanpa bulan: penugasan permanen).
export interface IsianRekap {
  id: string;
  nama: string;
  username: string;
  bidangNama: string;
  total: number;
  terisi: number;
}

export async function getIsianRekap(supabase: ServerClient): Promise<IsianRekap[]> {
  const { data: users, error: usersError } = await supabase
    .from("profiles")
    .select("id, nama, username, bidang_id")
    .eq("role", "user")
    .order("nama");
  if (usersError) throw new Error("Gagal memuat rekap isian. Coba lagi.");
  const list = users ?? [];
  if (list.length === 0) return [];

  const [bidangResult, laporanResult, linkResult, barisResult] = await Promise.all([
    supabase.from("bidang").select("id, nama"),
    supabase.from("laporan_tambahan").select("id, format"),
    supabase.from("laporan_tambahan_bidang").select("laporan_id, bidang_id"),
    supabase.from("laporan_tambahan_baris").select("laporan_id, user_id"),
  ]);
  if (bidangResult.error || laporanResult.error || linkResult.error || barisResult.error) {
    throw new Error("Gagal memuat rekap isian. Coba lagi.");
  }
  const namaByBidang = new Map((bidangResult.data ?? []).map((row) => [row.id, row.nama]));
  const judulFormat = new Set(
    (laporanResult.data ?? []).filter((row) => row.format === "judul").map((row) => row.id)
  );
  const tugaskan = new Map<string, Set<string>>();
  for (const link of linkResult.data ?? []) {
    const set = tugaskan.get(link.bidang_id) ?? new Set<string>();
    set.add(link.laporan_id);
    tugaskan.set(link.bidang_id, set);
  }
  const isiOleh = new Map<string, Set<string>>();
  for (const row of barisResult.data ?? []) {
    const set = isiOleh.get(row.user_id) ?? new Set<string>();
    set.add(row.laporan_id);
    isiOleh.set(row.user_id, set);
  }
  return list.map((user) => {
    const tugasan = user.bidang_id ? [...(tugaskan.get(user.bidang_id) ?? [])] : [];
    const isian = isiOleh.get(user.id) ?? new Set<string>();
    return {
      id: user.id,
      nama: user.nama,
      username: user.username,
      bidangNama: (user.bidang_id && namaByBidang.get(user.bidang_id)) || "Tanpa bidang",
      total: tugasan.length,
      terisi: tugasan.filter((id) => judulFormat.has(id) || isian.has(id)).length,
    };
  });
}

// Matriks target builder: semua bidang + jumlah user per bidang (role user)
// untuk hitung ulang target saat bidang dicentang di panel aside.
export async function getBidangTargetMatrix(
  supabase: ServerClient
): Promise<{ semuaBidang: { id: string; nama: string }[]; userCountByBidang: Record<string, number> }> {
  const [bidangResult, userResult] = await Promise.all([
    supabase.from("bidang").select("id, nama").order("nama"),
    supabase.from("profiles").select("bidang_id").eq("role", "user"),
  ]);
  if (bidangResult.error || userResult.error) {
    throw new Error("Gagal memuat bidang. Coba lagi.");
  }
  const userCountByBidang: Record<string, number> = {};
  for (const user of userResult.data ?? []) {
    if (!user.bidang_id) continue;
    userCountByBidang[user.bidang_id] = (userCountByBidang[user.bidang_id] ?? 0) + 1;
  }
  return { semuaBidang: bidangResult.data ?? [], userCountByBidang };
}

export interface BuilderKolom {
  id: string;
  label: string;
  tipe: KolomTipe;
}

export interface BuilderItem extends LaporanAdminItem {
  /** Definisi kolom laporan (urut tampil). */
  kolom: BuilderKolom[];
}

// Semua laporan dinamis untuk editor builder beserta kolomnya, terurut
// susunan builder. Satu panggilan untuk seluruh kartu form.
export async function getSectionBuilderData(
  supabase: ServerClient
): Promise<BuilderItem[]> {
  const dinamis = await getLaporanListAdmin(supabase);
  const ids = dinamis.map((item) => item.id);
  const kolomByLaporan = new Map<string, BuilderKolom[]>();
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("laporan_tambahan_kolom")
      .select("id, laporan_id, label, tipe")
      .in("laporan_id", ids)
      .order("laporan_id")
      .order("urutan");
    if (error) throw new Error("Gagal memuat section. Coba lagi.");
    for (const col of data ?? []) {
      const arr = kolomByLaporan.get(col.laporan_id) ?? [];
      arr.push({ id: col.id, label: col.label, tipe: col.tipe });
      kolomByLaporan.set(col.laporan_id, arr);
    }
  }
  return dinamis
    .map((item) => ({
      ...item,
      kolom: kolomByLaporan.get(item.id) ?? [],
    }))
    .sort((a, b) => a.urutan - b.urutan);
}

// Label status review bulanan (dipakai daftar bulan user + filter admin).
export function labelStatusReview(status: string): string {
  if (status === "approved") return "Disetujui";
  if (status === "revision") return "Revisi";
  if (status === "selesai") return "Selesai";
  return "Menunggu";
}

export interface BulanAdminItem {
  tahun: number;
  bulan: number;
  /** Pengguna yang membuka bulan ini. */
  userCount: number;
}

// Daftar bulan yang dibuka para pengguna (lapis 1 admin): distinct
// tahun-bulan dari monthly_reviews beserta jumlah penggunanya.
export async function getBulanAdmin(supabase: ServerClient): Promise<BulanAdminItem[]> {
  const { data, error } = await supabase
    .from("monthly_reviews")
    .select("tahun, bulan, user_id");
  if (error) throw new Error("Gagal memuat daftar bulan. Coba lagi.");
  const penggunaPerBulan = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const kunci = `${row.tahun}-${row.bulan}`;
    const set = penggunaPerBulan.get(kunci) ?? new Set<string>();
    set.add(row.user_id);
    penggunaPerBulan.set(kunci, set);
  }
  return [...penggunaPerBulan]
    .map(([kunci, pengguna]) => {
      const [tahun, bulan] = kunci.split("-").map(Number);
      return { tahun, bulan, userCount: pengguna.size };
    })
    .sort((a, b) => b.tahun - a.tahun || b.bulan - a.bulan);
}

export interface LaporanUserBulan {
  id: string;
  nama: string;
  username: string;
  bidangNama: string;
  status: MonthlyReviewStatus;
  /** Section terisi pada bulan itu (blok judul selalu terhitung). */
  terisi: number;
  total: number;
}

// Pengguna yang membuka satu bulan beserta status + ketuntasan isiannya
// (lapis 2 admin). Hanya pengguna yang punya baris review bulan itu.
export async function getLaporanUserBulan(
  supabase: ServerClient,
  periode: Periode
): Promise<LaporanUserBulan[]> {
  const { data: users, error: usersError } = await supabase
    .from("profiles")
    .select("id, nama, username, bidang_id")
    .eq("role", "user")
    .order("nama");
  if (usersError) throw new Error("Gagal memuat pengguna. Coba lagi.");
  const list = users ?? [];
  if (list.length === 0) return [];

  const [reviewResult, linkResult, laporanResult, barisResult, bidangResult] =
    await Promise.all([
      supabase
        .from("monthly_reviews")
        .select("user_id, status")
        .eq("tahun", periode.tahun)
        .eq("bulan", periode.bulan),
      supabase.from("laporan_tambahan_bidang").select("laporan_id, bidang_id"),
      supabase.from("laporan_tambahan").select("id, format"),
      supabase
        .from("laporan_tambahan_baris")
        .select("laporan_id, user_id")
        .eq("tahun", periode.tahun)
        .eq("bulan", periode.bulan),
      supabase.from("bidang").select("id, nama"),
    ]);
  if (
    reviewResult.error ||
    linkResult.error ||
    laporanResult.error ||
    barisResult.error ||
    bidangResult.error
  ) {
    throw new Error("Gagal memuat laporan bulan. Coba lagi.");
  }
  const statusByUser = new Map(
    (reviewResult.data ?? []).map((row) => [row.user_id, row.status as MonthlyReviewStatus])
  );
  const tugasanPerBidang = new Map<string, Set<string>>();
  for (const link of linkResult.data ?? []) {
    const set = tugasanPerBidang.get(link.bidang_id) ?? new Set<string>();
    set.add(link.laporan_id);
    tugasanPerBidang.set(link.bidang_id, set);
  }
  const judulOtomatis = new Set(
    (laporanResult.data ?? []).filter((row) => row.format === "judul").map((row) => row.id)
  );
  const isiOleh = new Map<string, Set<string>>();
  for (const row of barisResult.data ?? []) {
    const set = isiOleh.get(row.user_id) ?? new Set<string>();
    set.add(row.laporan_id);
    isiOleh.set(row.user_id, set);
  }
  const namaByBidang = new Map((bidangResult.data ?? []).map((row) => [row.id, row.nama]));

  return list
    .filter((user) => statusByUser.has(user.id))
    .map((user) => {
      const tugasan = user.bidang_id
        ? [...(tugasanPerBidang.get(user.bidang_id) ?? [])]
        : [];
      const isian = isiOleh.get(user.id) ?? new Set<string>();
      return {
        id: user.id,
        nama: user.nama,
        username: user.username,
        bidangNama:
          (user.bidang_id && namaByBidang.get(user.bidang_id)) || "Tanpa bidang",
        status: statusByUser.get(user.id) ?? "menunggu",
        total: tugasan.length,
        terisi: tugasan.filter((id) => judulOtomatis.has(id) || isian.has(id)).length,
      };
    });
}
