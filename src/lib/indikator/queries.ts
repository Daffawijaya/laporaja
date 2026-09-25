import { createClient } from "@/lib/supabase/server";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { NAMA_BULAN } from "@/components/laporan/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type BrowserClient = ReturnType<typeof createBrowserClient>;

export interface IndikatorOption {
  id: string;
  nama: string;
  target: number;
  tahun: number;
  bulanMulai: number;
  bulanSelesai: number;
}

export interface IndikatorProgress extends IndikatorOption {
  bulanCount: number;
  perBulan: number;
  bulanIni: number;
  total: number;
}

export const NAMA_BULAN_SINGKAT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

// Label rentang periode: "Feb-Nov 2026".
export function formatPeriode(tahun: number, mulai: number, selesai: number): string {
  return `${NAMA_BULAN_SINGKAT[mulai - 1]}-${NAMA_BULAN_SINGKAT[selesai - 1]} ${tahun}`;
}

// Nama bulan panjang untuk label yang sudah ada.
export function namaBulanPanjang(bulan: number): string {
  return NAMA_BULAN[bulan - 1];
}

// Target per bulan = target total dibagi rata jumlah bulan.
// Tampil bulat bila pas, satu desimal bila tidak.
export function formatPerBulan(target: number, bulanCount: number): string {
  const value = target / bulanCount;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(".", ",");
}

function toOption(row: {
  id: string;
  nama: string;
  target: number;
  tahun: number;
  bulan_mulai: number;
  bulan_selesai: number;
}): IndikatorOption {
  return {
    id: row.id,
    nama: row.nama,
    target: row.target,
    tahun: row.tahun,
    bulanMulai: row.bulan_mulai,
    bulanSelesai: row.bulan_selesai,
  };
}

// Indikator yang berlaku untuk user: khusus user itu atau bidangnya.
// RLS juga membatasi ke baris itu, filter di sini menegaskan maksud.
export async function getApplicableIndikators(
  supabase: ServerClient,
  userId: string
): Promise<IndikatorOption[]> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("bidang_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error("Gagal memuat indikator. Coba lagi.");

  let query = supabase.from("indikator").select("*").order("nama");
  if (profile?.bidang_id) {
    query = query.or(`user_id.eq.${userId},bidang_id.eq.${profile.bidang_id}`);
  } else {
    query = query.eq("user_id", userId);
  }
  const { data, error } = await query;
  if (error) throw new Error("Gagal memuat indikator. Coba lagi.");
  return (data ?? []).map(toOption);
}

// Capaian per indikator: jumlah kegiatan tertaut dalam bulan yang dilihat
// dan total dalam periode indikator.
export async function getIndikatorProgress(
  supabase: ServerClient,
  userId: string,
  tahun: number,
  bulan: number
): Promise<IndikatorProgress[]> {
  const options = await getApplicableIndikators(supabase, userId);
  if (options.length === 0) return [];

  const { data: kegiatanList, error: kegiatanError } = await supabase
    .from("kegiatan")
    .select("id, tanggal")
    .eq("user_id", userId);
  if (kegiatanError) throw new Error("Gagal memuat capaian indikator. Coba lagi.");
  if (!kegiatanList || kegiatanList.length === 0) {
    return options.map((option) => ({
      ...option,
      bulanCount: option.bulanSelesai - option.bulanMulai + 1,
      perBulan: option.target / (option.bulanSelesai - option.bulanMulai + 1),
      bulanIni: 0,
      total: 0,
    }));
  }

  const tanggalById = new Map(kegiatanList.map((row) => [row.id, row.tanggal]));
  const { data: links, error: linksError } = await supabase
    .from("kegiatan_indikator")
    .select("kegiatan_id, indikator_id")
    .in("kegiatan_id", kegiatanList.map((row) => row.id));
  if (linksError) throw new Error("Gagal memuat capaian indikator. Coba lagi.");

  return options.map((option) => {
    const bulanCount = option.bulanSelesai - option.bulanMulai + 1;
    let bulanIni = 0;
    let total = 0;
    for (const link of links ?? []) {
      if (link.indikator_id !== option.id) continue;
      const tanggal = tanggalById.get(link.kegiatan_id);
      if (!tanggal) continue;
      const [y, m] = tanggal.split("-").map(Number);
      const dalamPeriode =
        y === option.tahun && m >= option.bulanMulai && m <= option.bulanSelesai;
      if (!dalamPeriode) continue;
      total += 1;
      if (y === tahun && m === bulan) bulanIni += 1;
    }
    return {
      ...option,
      bulanCount,
      perBulan: option.target / bulanCount,
      bulanIni,
      total,
    };
  });
}

// Ganti seluruh tautan indikator satu kegiatan (dipakai saat simpan form).
export async function replaceKegiatanIndikator(
  supabase: BrowserClient,
  kegiatanId: string,
  indikatorIds: string[]
): Promise<void> {
  const { error: hapusError } = await supabase
    .from("kegiatan_indikator")
    .delete()
    .eq("kegiatan_id", kegiatanId);
  if (hapusError) throw new Error("Gagal menyimpan indikator kegiatan. Coba lagi.");
  const unique = [...new Set(indikatorIds)];
  if (unique.length === 0) return;
  const { error: insertError } = await supabase.from("kegiatan_indikator").insert(
    unique.map((indikator_id) => ({ kegiatan_id: kegiatanId, indikator_id }))
  );
  if (insertError) {
    if (/tidak berlaku/i.test(insertError.message)) {
      throw new Error("Indikator tidak berlaku. Muat ulang lalu coba lagi.");
    }
    throw new Error("Gagal menyimpan indikator kegiatan. Coba lagi.");
  }
}
