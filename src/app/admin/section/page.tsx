import { createClient } from "@/lib/supabase/server";
import {
  getBidangTargetMatrix,
  getPengaturan,
  getSectionBuilderData,
} from "@/lib/laporan-tambahan/queries";
import { SectionBuilder } from "@/components/admin/section-builder";
import { SimpanTeks } from "@/components/ui/simpan-teks";

// Builder section dinamis: susun + ubah langsung di kartu, tambah lewat
// rel, bidang pengisi di panel kanan.
export default async function SectionPage() {
  const supabase = await createClient();

  const [semua, matrix, unitKerja, jabatanAwalan, infoJudul] = await Promise.all([
    getSectionBuilderData(supabase),
    getBidangTargetMatrix(supabase),
    getPengaturan(supabase, "unit_kerja"),
    getPengaturan(supabase, "jabatan_awalan"),
    getPengaturan(supabase, "info_judul"),
  ]);

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
        />
      </div>
    </div>
  );
}
