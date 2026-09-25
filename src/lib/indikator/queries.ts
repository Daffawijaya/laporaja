import { createClient } from "@/lib/supabase/server";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type BrowserClient = ReturnType<typeof createBrowserClient>;

// Indikator milik user: nama dan target jumlah per bulan (bisa belum diatur).
export interface IndikatorOption {
  id: string;
  nama: string;
  target: number | null;
}

// Capaian: jumlah kegiatan tertaut pada bulan yang dilihat dan total semua.
export interface IndikatorProgress extends IndikatorOption {
  bulanIni: number;
  total: number;
}

function toOption(row: { id: string; nama: string; target_bulanan: number | null }): IndikatorOption {
  return { id: row.id, nama: row.nama, target: row.target_bulanan };
}

// Indikator yang berlaku untuk user: global, miliknya, atau milik bidangnya.
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
    query = query.or(
      `user_id.eq.${userId},bidang_id.eq.${profile.bidang_id},and(bidang_id.is.null,user_id.is.null)`
    );
  } else {
    query = query.or(`user_id.eq.${userId},and(bidang_id.is.null,user_id.is.null)`);
  }
  const { data, error } = await query;
  if (error) throw new Error("Gagal memuat indikator. Coba lagi.");
  return (data ?? []).map(toOption);
}

// Capaian per indikator: tautan pada bulan yang dilihat dan total semua waktu.
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
    return options.map((option) => ({ ...option, bulanIni: 0, total: 0 }));
  }

  const tanggalById = new Map(kegiatanList.map((row) => [row.id, row.tanggal]));
  const { data: links, error: linksError } = await supabase
    .from("kegiatan_indikator")
    .select("kegiatan_id, indikator_id")
    .in("kegiatan_id", kegiatanList.map((row) => row.id));
  if (linksError) throw new Error("Gagal memuat capaian indikator. Coba lagi.");

  return options.map((option) => {
    let bulanIni = 0;
    let total = 0;
    for (const link of links ?? []) {
      if (link.indikator_id !== option.id) continue;
      const tanggal = tanggalById.get(link.kegiatan_id);
      if (!tanggal) continue;
      total += 1;
      const [y, m] = tanggal.split("-").map(Number);
      if (y === tahun && m === bulan) bulanIni += 1;
    }
    return { ...option, bulanIni, total };
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
