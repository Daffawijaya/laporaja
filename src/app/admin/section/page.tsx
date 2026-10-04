import { createClient } from "@/lib/supabase/server";
import {
  getBidangTargetMatrix,
  getPengaturan,
  getSectionBuilderData,
} from "@/lib/laporan-tambahan/queries";
import { SectionBuilder } from "@/components/admin/section-builder";
import { SimpanTeks } from "@/components/ui/simpan-teks";
import type { TtdItem } from "@/components/anda/tanda-tangan-editor";

// Builder section dinamis: susun + ubah langsung di kartu, tambah lewat
// rel, bidang pengisi di panel kanan. Kartu tanda tangan statis paling bawah.
export default async function SectionPage() {
  const supabase = await createClient();

  const [semua, matrix, unitKerja, jabatanAwalan, infoJudul, ttdMentah] = await Promise.all([
    getSectionBuilderData(supabase),
    getBidangTargetMatrix(supabase),
    getPengaturan(supabase, "unit_kerja"),
    getPengaturan(supabase, "jabatan_awalan"),
    getPengaturan(supabase, "info_judul"),
    getPengaturan(supabase, "ttd_daftar"),
  ]);

  // Daftar tanda tangan (JSON di pengaturan "ttd_daftar"): rusak/kosong = [].
  // Entri lama belum punya pangkat/NIP.
  let ttdDaftar: TtdItem[] = [];
  try {
    const parsed: unknown = ttdMentah ? JSON.parse(ttdMentah) : [];
    if (Array.isArray(parsed)) {
      ttdDaftar = parsed
        .filter(
          (item): item is TtdItem =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as TtdItem).nama === "string" &&
            typeof (item as TtdItem).jabatan === "string" &&
            typeof (item as TtdItem).gambar === "string"
        )
        .map((item) => ({
          nama: item.nama,
          jabatan: item.jabatan,
          pangkat: typeof item.pangkat === "string" ? item.pangkat : "",
          nip: typeof item.nip === "string" ? item.nip : "",
          gambar: item.gambar,
        }));
    }
  } catch {
    ttdDaftar = [];
  }

  return (
    <div className="w-full">
      <div className="md:hidden">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Section</h1>
          <SimpanTeks />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Susun format laporan dinamis per bidang.
        </p>
      </div>
      <div className="mt-5 md:mt-1">
        <SectionBuilder
          initialItems={semua}
          bidangList={matrix.semuaBidang}
          userCountByBidang={matrix.userCountByBidang}
          jabatanAwal={jabatanAwalan}
          unitKerjaAwal={unitKerja}
          infoJudulAwal={infoJudul || "Info Laporan"}
          ttdAwal={ttdDaftar}
        />
      </div>
    </div>
  );
}
