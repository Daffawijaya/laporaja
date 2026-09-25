import { notFound, redirect } from "next/navigation";
import { assertOk } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getApplicableIndikators } from "@/lib/indikator/queries";
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

  const { data: kegiatan, error: kegiatanError } = await supabase
    .from("kegiatan")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  assertOk(kegiatanError, "Gagal memuat kegiatan. Coba lagi.");
  if (!kegiatan) notFound();

  const [keteranganResult, reviewResult, linksResult, indikators] = await Promise.all([
    supabase
      .from("keterangan_kegiatan")
      .select("*")
      .eq("kegiatan_id", id)
      .order("urutan"),
    supabase.from("reviews").select("status, catatan").eq("kegiatan_id", id).maybeSingle(),
    supabase.from("kegiatan_indikator").select("indikator_id").eq("kegiatan_id", id),
    getApplicableIndikators(supabase, user.id),
  ]);
  assertOk(
    keteranganResult.error ?? reviewResult.error ?? linksResult.error,
    "Gagal memuat keterangan kegiatan. Coba lagi."
  );
  const keteranganList = keteranganResult.data;
  const review = reviewResult.data;

  const item: KegiatanItem = {
    id: kegiatan.id,
    tanggal: kegiatan.tanggal,
    nama: kegiatan.nama_kegiatan,
    keterangan: keteranganList ?? [],
    review,
    indikatorIds: (linksResult.data ?? []).map((link) => link.indikator_id),
  };

  const [tahun, bulan] = kegiatan.tanggal.split("-").map(Number);
  const backHref = `/laporan?bulan=${bulan}&tahun=${tahun}`;

  return <KegiatanDetail userId={user.id} item={item} backHref={backHref} indikators={indikators} />;
}
