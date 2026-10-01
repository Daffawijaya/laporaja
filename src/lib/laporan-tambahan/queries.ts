import type { createClient } from "@/lib/supabase/server";
import type { SectionKode, KolomTipe, LaporanFormat, LaporanTambahanKolomRow } from "@/lib/supabase/database.types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type { KolomTipe, LaporanFormat };

export interface KolomDef {
  id: string;
  label: string;
  tipe: KolomTipe;
  wajib: boolean;
}

export interface BarisIsi {
  id: string;
  nilai: Record<string, string>;
}

export interface TugasLaporan {
  id: string;
  judul: string;
  deskripsi: string | null;
  /** Bentuk isian: tabel (baris-baris kolom) atau esai (satu teks panjang). */
  format: LaporanFormat;
  bidang: { id: string; nama: string }[];
  kolom: KolomDef[];
  baris: BarisIsi[];
  /** Terisi bila user punya minimal 1 baris. */
  terisi: boolean;
}

// Validasi nilai satu baris mengikuti definisi kolom admin.
// Kolom wajib harus terisi; tanggal YYYY-MM-DD; angka numerik.
export function cleanNilai(
  kolom: Pick<LaporanTambahanKolomRow, "id" | "label" | "tipe" | "wajib">[],
  input: Record<string, string>
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const col of kolom) {
    const value = (input[col.id] ?? "").trim();
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
// kolom dan baris yang sudah ia isi. Penugasan permanen (tanpa periode);
// selesai = punya minimal 1 baris.
export async function getTugasUser(
  supabase: ServerClient,
  userId: string,
  bidangId: string | null
): Promise<TugasLaporan[]> {
  if (!bidangId) return [];
  const { data: links, error: linkError } = await supabase
    .from("laporan_tambahan_bidang")
    .select("laporan_id")
    .eq("bidang_id", bidangId);
  if (linkError) throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
  const ids = [...new Set((links ?? []).map((row) => row.laporan_id))];
  if (ids.length === 0) return [];

  const [laporanResult, kolomResult, barisResult] = await Promise.all([
    supabase.from("laporan_tambahan").select("id, judul, deskripsi, format, urutan").in("id", ids).order("urutan").order("judul"),
    supabase
      .from("laporan_tambahan_kolom")
      .select("id, laporan_id, label, tipe, wajib")
      .in("laporan_id", ids)
      .order("laporan_id")
      .order("urutan"),
    supabase
      .from("laporan_tambahan_baris")
      .select("id, laporan_id")
      .in("laporan_id", ids)
      .eq("user_id", userId)
      .order("laporan_id")
      .order("urutan"),
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
    arr.push({ id: row.id, nilai: nilaiByBaris.get(row.id) ?? {} });
    barisByLaporan.set(row.laporan_id, arr);
  }
  return laporanList.map((row) => {
    const baris = barisByLaporan.get(row.id) ?? [];
    return {
      id: row.id,
      judul: row.judul,
      deskripsi: row.deskripsi,
      format: (row.format ?? "tabel") as LaporanFormat,
      bidang: bidangByLaporan.get(row.id) ?? [],
      kolom: kolomByLaporan.get(row.id) ?? [],
      baris,
      terisi: baris.length > 0,
    };
  });
}

// Judul tugas wajib yang BELUM terisi user (tanpa periode — penugasan
// permanen). Dipakai pengunci tombol Setujui di review admin.
export async function getTugasBelumTerisi(
  supabase: ServerClient,
  userId: string,
  bidangId: string | null
): Promise<string[]> {
  const tugas = await getTugasUser(supabase, userId, bidangId);
  return tugas.filter((item) => !item.terisi).map((item) => item.judul);
}

export interface LaporanAdminItem {
  id: string;
  /** 'tambahan' = baris laporan_tambahan, 'section' = master laporan_section (id = kode). */
  kind: "tambahan" | "section";
  judul: string;
  /** Posisi susun di builder admin (antar kedua jenis). */
  urutan: number;
  /** Bentuk isian laporan dinamis; null untuk section tetap. */
  format: LaporanFormat | null;
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
    .select("id, judul, format, urutan")
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

// Urutan tampil laporan section yang bermakna (bukan alfabetis).
const SECTION_ORDER = ["kegiatan", "rekomendasi"];

// Daftar laporan section untuk halaman admin: master + tautan bidang +
// hitung user target per bidang. Ketuntasan (terisiUser) tidak bermakna
// tanpa konteks bulan, jadi selalu 0 dan tidak ditampilkan.
export async function getLaporanSectionListAdmin(
  supabase: ServerClient
): Promise<LaporanAdminItem[]> {
  const { data: master, error: masterError } = await supabase
    .from("laporan_section")
    .select("kode, judul, urutan")
    .order("urutan");
  if (masterError) throw new Error("Gagal memuat laporan section. Coba lagi.");
  const list = master ?? [];
  if (list.length === 0) return [];

  const [linkResult, bidangResult, userResult] = await Promise.all([
    supabase.from("laporan_section_bidang").select("kode, bidang_id"),
    supabase.from("bidang").select("id, nama").order("nama"),
    supabase.from("profiles").select("bidang_id").eq("role", "user"),
  ]);
  if (linkResult.error || bidangResult.error || userResult.error) {
    throw new Error("Gagal memuat laporan section. Coba lagi.");
  }
  const namaByBidang = new Map((bidangResult.data ?? []).map((row) => [row.id, row.nama]));
  const bidangByKode = new Map<string, { id: string; nama: string }[]>();
  for (const link of linkResult.data ?? []) {
    const arr = bidangByKode.get(link.kode) ?? [];
    arr.push({ id: link.bidang_id, nama: namaByBidang.get(link.bidang_id) ?? "" });
    bidangByKode.set(link.kode, arr);
  }
  const targetByBidang = new Map<string, number>();
  for (const user of userResult.data ?? []) {
    if (!user.bidang_id) continue;
    targetByBidang.set(user.bidang_id, (targetByBidang.get(user.bidang_id) ?? 0) + 1);
  }
  return list
    .map((row) => {
      const bidang = bidangByKode.get(row.kode) ?? [];
      return {
        id: row.kode,
        kind: "section" as const,
        judul: row.judul,
        urutan: row.urutan ?? SECTION_ORDER.indexOf(row.kode) * 10,
        format: null,
        bidang,
        jumlahKolom: 0,
        jumlahBaris: 0,
        targetUser: bidang.reduce((sum, item) => sum + (targetByBidang.get(item.id) ?? 0), 0),
        terisiUser: 0,
      };
    })
    .sort(
      (a, b) =>
        a.urutan - b.urutan ||
        SECTION_ORDER.indexOf(a.id) - SECTION_ORDER.indexOf(b.id)
    );
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

// Judul section wajib (bidang user tertaut) yang BELUM tuntas di bulan
// itu. Aturan tuntas: kegiatan = ≥1 kegiatan; rekomendasi = rekomendasi
// terisi. Dipakai pengunci tombol Setujui di review admin.
export async function getSectionBelumTerisi(
  supabase: ServerClient,
  userId: string,
  bidangId: string | null,
  tahun: number,
  bulan: number
): Promise<string[]> {
  if (!bidangId) return [];
  const { data: links, error: linkError } = await supabase
    .from("laporan_section_bidang")
    .select("kode")
    .eq("bidang_id", bidangId);
  if (linkError) throw new Error("Gagal memuat laporan section. Coba lagi.");
  const KODE_VALID: ReadonlySet<string> = new Set(["kegiatan", "rekomendasi"]);
  const kodes: SectionKode[] = [...new Set((links ?? []).map((row) => row.kode))].filter(
    (kode): kode is SectionKode => KODE_VALID.has(kode)
  );
  if (kodes.length === 0) return [];

  const { data: master, error: masterError } = await supabase
    .from("laporan_section")
    .select("kode, judul")
    .in("kode", kodes);
  if (masterError) throw new Error("Gagal memuat laporan section. Coba lagi.");
  const judulByKode = new Map<SectionKode, string>((master ?? []).map((row) => [row.kode, row.judul]));
  const judul = (kode: SectionKode) => judulByKode.get(kode) ?? kode;

  const mm = String(bulan).padStart(2, "0");
  const firstDay = `${tahun}-${mm}-01`;
  const lastDay = `${tahun}-${mm}-${String(new Date(tahun, bulan, 0).getDate()).padStart(2, "0")}`;

  const belum: string[] = [];
  let kegiatanIds: string[] | null = null;
  async function idsKegiatanBulan(): Promise<string[]> {
    if (kegiatanIds !== null) return kegiatanIds;
    const { data, error } = await supabase
      .from("kegiatan")
      .select("id")
      .eq("user_id", userId)
      .gte("tanggal", firstDay)
      .lte("tanggal", lastDay);
    if (error) throw new Error("Gagal memuat laporan section. Coba lagi.");
    kegiatanIds = (data ?? []).map((row) => row.id);
    return kegiatanIds;
  }

  if (kodes.includes("kegiatan") && (await idsKegiatanBulan()).length === 0) {
    belum.push(judul("kegiatan"));
  }
  if (kodes.includes("rekomendasi")) {
    const { data: review, error: reviewError } = await supabase
      .from("monthly_reviews")
      .select("rekomendasi")
      .eq("user_id", userId)
      .eq("tahun", tahun)
      .eq("bulan", bulan)
      .maybeSingle();
    if (reviewError) throw new Error("Gagal memuat laporan section. Coba lagi.");
    if (!review?.rekomendasi?.trim()) belum.push(judul("rekomendasi"));
  }
  return belum;
}

export interface BarisDenganUser {
  id: string;
  userNama: string;
  username: string;
  nilai: Record<string, string>;
}

export interface TargetDenganStatus {
  id: string;
  nama: string;
  username: string;
  terisi: boolean;
}

export interface LaporanDetailAdmin {
  id: string;
  judul: string;
  deskripsi: string | null;
  bidang: { id: string; nama: string }[];
  kolom: KolomDef[];
  baris: BarisDenganUser[];
  target: TargetDenganStatus[];
}

// Detail satu laporan untuk admin: definisi kolom + semua baris
// + status isi per user target.
export async function getLaporanDetailAdmin(
  supabase: ServerClient,
  laporanId: string
): Promise<LaporanDetailAdmin | null> {
  const { data: laporan, error: laporanError } = await supabase
    .from("laporan_tambahan")
    .select("id, judul, deskripsi")
    .eq("id", laporanId)
    .maybeSingle();
  if (laporanError) throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
  if (!laporan) return null;

  const [linkResult, kolomResult, barisResult] = await Promise.all([
    supabase.from("laporan_tambahan_bidang").select("bidang_id").eq("laporan_id", laporanId),
    supabase
      .from("laporan_tambahan_kolom")
      .select("id, label, tipe, wajib")
      .eq("laporan_id", laporanId)
      .order("urutan"),
    supabase
      .from("laporan_tambahan_baris")
      .select("id, user_id")
      .eq("laporan_id", laporanId)
      .order("user_id")
      .order("urutan"),
  ]);
  if (linkResult.error || kolomResult.error || barisResult.error) {
    throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
  }
  const bidangIds = (linkResult.data ?? []).map((row) => row.bidang_id);
  const barisList = barisResult.data ?? [];
  const kolom = (kolomResult.data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    tipe: row.tipe,
    wajib: row.wajib,
  }));
  const userIds = [...new Set(barisList.map((row) => row.user_id))];

  const nilaiByBaris = new Map<string, Record<string, string>>();
  if (barisList.length > 0) {
    const { data: nilaiList, error: nilaiError } = await supabase
      .from("laporan_tambahan_nilai")
      .select("baris_id, kolom_id, nilai")
      .in(
        "baris_id",
        barisList.map((row) => row.id)
      );
    if (nilaiError) throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
    for (const nilai of nilaiList ?? []) {
      const map = nilaiByBaris.get(nilai.baris_id) ?? {};
      map[nilai.kolom_id] = nilai.nilai;
      nilaiByBaris.set(nilai.baris_id, map);
    }
  }

  const [bidangResult, userResult, targetResult] = await Promise.all([
    bidangIds.length > 0
      ? supabase.from("bidang").select("id, nama").in("id", bidangIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? supabase.from("profiles").select("id, nama, username").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    bidangIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, nama, username")
          .eq("role", "user")
          .in("bidang_id", bidangIds)
          .order("nama")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bidangResult.error || userResult.error || targetResult.error) {
    throw new Error("Gagal memuat laporan tambahan. Coba lagi.");
  }
  const namaByUser = new Map(
    (userResult.data ?? []).map((row) => [row.id, { nama: row.nama, username: row.username }])
  );
  const terisiSet = new Set(userIds);
  return {
    id: laporan.id,
    judul: laporan.judul,
    deskripsi: laporan.deskripsi,
    bidang: (bidangResult.data ?? []).map((row) => ({ id: row.id, nama: row.nama })),
    kolom,
    baris: barisList.map((row) => ({
      id: row.id,
      userNama: namaByUser.get(row.user_id)?.nama ?? "",
      username: namaByUser.get(row.user_id)?.username ?? "",
      nilai: nilaiByBaris.get(row.id) ?? {},
    })),
    target: (targetResult.data ?? []).map((row) => ({
      id: row.id,
      nama: row.nama,
      username: row.username,
      terisi: terisiSet.has(row.id),
    })),
  };
}

export interface SectionEditData {
  kode: string;
  judul: string;
  bidangList: { id: string; nama: string }[];
  linkedIds: string[];
}

// Data form ubah section tetap: master + semua bidang + tautan awal.
export async function getSectionEditData(
  supabase: ServerClient,
  kode: string
): Promise<SectionEditData | null> {
  const { data: master, error: masterError } = await supabase
    .from("laporan_section")
    .select("kode, judul")
    .eq("kode", kode as SectionKode)
    .maybeSingle();
  if (masterError) throw new Error("Gagal memuat section. Coba lagi.");
  if (!master) return null;

  const [bidangResult, linkResult] = await Promise.all([
    supabase.from("bidang").select("id, nama").order("nama"),
    supabase.from("laporan_section_bidang").select("bidang_id").eq("kode", kode as SectionKode),
  ]);
  if (bidangResult.error || linkResult.error) {
    throw new Error("Gagal memuat section. Coba lagi.");
  }
  return {
    kode: master.kode,
    judul: master.judul,
    bidangList: bidangResult.data ?? [],
    linkedIds: (linkResult.data ?? []).map((row) => row.bidang_id),
  };
}

export interface LaporanEditData {
  id: string;
  judul: string;
  format: LaporanFormat;
  kolom: { id: string; label: string; tipe: KolomTipe }[];
  bidangList: { id: string; nama: string }[];
  linkedIds: string[];
}

// Data form ubah laporan dinamis: judul + kolom + semua bidang + tautan.
export async function getLaporanEditData(
  supabase: ServerClient,
  laporanId: string
): Promise<LaporanEditData | null> {
  const { data: laporan, error: laporanError } = await supabase
    .from("laporan_tambahan")
    .select("id, judul, format")
    .eq("id", laporanId)
    .maybeSingle();
  if (laporanError) throw new Error("Gagal memuat section. Coba lagi.");
  if (!laporan) return null;

  const [kolomResult, bidangResult, linkResult] = await Promise.all([
    supabase
      .from("laporan_tambahan_kolom")
      .select("id, label, tipe")
      .eq("laporan_id", laporanId)
      .order("urutan"),
    supabase.from("bidang").select("id, nama").order("nama"),
    supabase.from("laporan_tambahan_bidang").select("bidang_id").eq("laporan_id", laporanId),
  ]);
  if (kolomResult.error || bidangResult.error || linkResult.error) {
    throw new Error("Gagal memuat section. Coba lagi.");
  }
  return {
    id: laporan.id,
    judul: laporan.judul,
    format: (laporan.format ?? "tabel") as LaporanFormat,
    kolom: (kolomResult.data ?? []).map((row) => ({ id: row.id, label: row.label, tipe: row.tipe })),
    bidangList: bidangResult.data ?? [],
    linkedIds: (linkResult.data ?? []).map((row) => row.bidang_id),
  };
}

export interface BuilderKolom {
  id: string;
  label: string;
  tipe: KolomTipe;
}

export interface BuilderItem extends LaporanAdminItem {
  /** Definisi kolom laporan dinamis (urut tampil); kosong untuk section tetap. */
  kolom: BuilderKolom[];
}

// Semua section untuk editor builder: tetap + dinamis beserta kolomnya,
// terurut susunan builder. Satu panggilan untuk seluruh kartu form.
export async function getSectionBuilderData(
  supabase: ServerClient
): Promise<BuilderItem[]> {
  const [dinamis, tetap] = await Promise.all([
    getLaporanListAdmin(supabase),
    getLaporanSectionListAdmin(supabase),
  ]);
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
  return [...tetap, ...dinamis]
    .map((item) => ({
      ...item,
      kolom: item.kind === "tambahan" ? (kolomByLaporan.get(item.id) ?? []) : [],
    }))
    .sort((a, b) => a.urutan - b.urutan);
}
