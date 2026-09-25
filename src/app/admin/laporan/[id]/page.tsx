import { notFound } from "next/navigation";
import { assertOk } from "@/lib/errors";
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

  const { data: kegiatan, error: kegiatanError } = await supabase
    .from("kegiatan")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  assertOk(kegiatanError, "Gagal memuat kegiatan. Coba lagi.");
  if (!kegiatan) notFound();

  const [ownerResult, keteranganResult, reviewResult, linksResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("nama, username")
      .eq("id", kegiatan.user_id)
      .maybeSingle(),
    supabase.from("keterangan_kegiatan").select("*").eq("kegiatan_id", id).order("urutan"),
    supabase.from("reviews").select("status, catatan").eq("kegiatan_id", id).maybeSingle(),
    supabase
      .from("kegiatan_indikator")
      .select("indikator_id, indikator(nama)")
      .eq("kegiatan_id", id),
  ]);
  assertOk(
    ownerResult.error ?? keteranganResult.error ?? reviewResult.error ?? linksResult.error,
    "Gagal memuat detail kegiatan. Coba lagi."
  );
  const owner = ownerResult.data;
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
  const indikatorNames = (linksResult.data ?? [])
    .map((link) => {
      const rel = link.indikator as unknown as { nama: string } | null;
      return rel?.nama ?? "";
    })
    .filter((nama) => nama.length > 0);

  const [tahun, bulan] = kegiatan.tanggal.split("-").map(Number);
  const backHref = `/admin/laporan?user=${kegiatan.user_id}&bulan=${bulan}&tahun=${tahun}`;

  return (
    <AdminKegiatanDetail
      item={item}
      ownerNama={owner?.nama ?? "Pengguna"}
      ownerUsername={owner?.username ?? ""}
      backHref={backHref}
      indikatorNames={indikatorNames}
    />
  );
}
