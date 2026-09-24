import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KegiatanDetail } from "@/components/laporan/kegiatan-detail";
import type { KegiatanItem } from "@/components/laporan/types";

export default async function KegiatanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");

  const { data: kegiatan } = await supabase
    .from("kegiatan")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!kegiatan) notFound();

  const [{ data: keteranganList }, { data: review }] = await Promise.all([
    supabase
      .from("keterangan_kegiatan")
      .select("*")
      .eq("kegiatan_id", id)
      .order("urutan"),
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
  const backHref = `/laporan/bulan?bulan=${bulan}&tahun=${tahun}`;

  return <KegiatanDetail userId={user.id} item={item} backHref={backHref} />;
}
