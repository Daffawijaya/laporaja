import { createClient } from "@/lib/supabase/server";
import { assertOk } from "@/lib/errors";
import { AdminNav } from "@/components/admin/admin-nav";
import { IndikatorManager, type IndikatorRow } from "@/components/admin/indikator-manager";

export default async function IndikatorPage() {
  const supabase = await createClient();
  const [indikatorResult, bidangResult, profilesResult, kegiatanResult] =
    await Promise.all([
      supabase.from("indikator").select("*").order("tahun").order("nama"),
      supabase.from("bidang").select("*").order("nama"),
      supabase.from("profiles").select("id, nama, username, bidang_id").order("nama"),
      supabase.from("kegiatan").select("id, tanggal"),
    ]);
  assertOk(indikatorResult.error, "Gagal memuat indikator. Coba lagi.");
  assertOk(bidangResult.error, "Gagal memuat data bidang. Coba lagi.");
  assertOk(profilesResult.error, "Gagal memuat data pengguna. Coba lagi.");
  assertOk(kegiatanResult.error, "Gagal memuat capaian. Coba lagi.");

  const indikators = indikatorResult.data ?? [];
  const bidangList = bidangResult.data ?? [];
  const profiles = profilesResult.data ?? [];
  const kegiatanList = kegiatanResult.data ?? [];

  const bidangNama = new Map(bidangList.map((bidang) => [bidang.id, bidang.nama]));
  const tanggalByKegiatan = new Map(kegiatanList.map((row) => [row.id, row.tanggal]));

  // Capaian total per indikator: tautan kegiatan yang tanggalnya dalam periode.
  const capaian = new Map<string, number>();
  if (kegiatanList.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from("kegiatan_indikator")
      .select("kegiatan_id, indikator_id")
      .in("kegiatan_id", kegiatanList.map((row) => row.id));
    assertOk(linksError, "Gagal memuat capaian. Coba lagi.");
    for (const indikator of indikators) {
      let count = 0;
      for (const link of links ?? []) {
        if (link.indikator_id !== indikator.id) continue;
        const tanggal = tanggalByKegiatan.get(link.kegiatan_id);
        if (!tanggal) continue;
        const [y, m] = tanggal.split("-").map(Number);
        if (y === indikator.tahun && m >= indikator.bulan_mulai && m <= indikator.bulan_selesai) {
          count += 1;
        }
      }
      capaian.set(indikator.id, count);
    }
  }

  const items: IndikatorRow[] = indikators.map((indikator) => ({
    id: indikator.id,
    nama: indikator.nama,
    target: indikator.target,
    tahun: indikator.tahun,
    bulanMulai: indikator.bulan_mulai,
    bulanSelesai: indikator.bulan_selesai,
    scopeLabel: indikator.bidang_id
      ? `Bidang ${bidangNama.get(indikator.bidang_id) ?? ""}`
      : (() => {
          const owner = profiles.find((profile) => profile.id === indikator.user_id);
          return owner ? `${owner.nama} (${owner.username})` : "User dihapus";
        })(),
    capaian: capaian.get(indikator.id) ?? 0,
  }));

  return (
    <div className="mx-auto w-full max-w-2xl">
      <AdminNav />
      <h1 className="text-xl font-semibold tracking-tight">Indikator</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Target kinerja per bidang atau per user. User menandai kegiatan yang memenuhinya.
      </p>
      <div className="mt-6">
        <IndikatorManager
          initial={items}
          bidangOptions={bidangList.map((bidang) => ({ id: bidang.id, nama: bidang.nama }))}
          userOptions={profiles.map((profile) => ({
            id: profile.id,
            nama: profile.nama,
            username: profile.username,
            bidangNama: profile.bidang_id ? (bidangNama.get(profile.bidang_id) ?? null) : null,
          }))}
        />
      </div>
    </div>
  );
}
