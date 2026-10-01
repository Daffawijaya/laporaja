import { createClient } from "@/lib/supabase/server";
import { LaporanTambahanCreate } from "@/components/admin/laporan-tambahan-create";

// Halaman penuh buat section.
export default async function LaporanTambahanBaruPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("bidang").select("id, nama").order("nama");

  return (
    <div className="w-full">
      <div className="md:hidden">
        <h1 className="text-xl font-semibold tracking-tight">Buat Section</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Judul, kolom isian, dan bidang yang wajib mengisi.
        </p>
      </div>
      <div className="mt-5 md:mt-1">
        <LaporanTambahanCreate bidangList={data ?? []} />
      </div>
    </div>
  );
}
