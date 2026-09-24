import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminKegiatanDetail } from "@/components/admin/admin-kegiatan-detail";
import type { KegiatanItem } from "@/components/laporan/types";

export default async function AdminKegiatanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: kegiatan } = await supabase
    .from("kegiatan")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!kegiatan) notFound();

  const [{ data: owner }, { data: keteranganList }, { data: review }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nama, username")
      .eq("id", kegiatan.user_id)
      .maybeSingle(),
    supabase.from("keterangan_kegiatan").select("*").eq("kegiatan_id", id).order("urutan"),
    supabase.from("reviews").select("status, catatan").eq("kegiatan_id", id).maybeSingle(),
  ]);

  const item: KegiatanItem = {
    id: kegiatan.id,
    tanggal: kegiatan.tanggal,
    nama: kegiatan.nama_kegiatan,
    keterangan: keteranganList ?? [],
    review,
  };

  const [tahun, bulan] = kegiatan.tanggal.split("-").map(Number);
  const backHref = `/admin/laporan?user=${kegiatan.user_id}&bulan=${bulan}&tahun=${tahun}`;

  return (
    <AdminKegiatanDetail
      item={item}
      ownerNama={owner?.nama ?? "Pengguna"}
      ownerUsername={owner?.username ?? ""}
      backHref={backHref}
    />
  );
}
