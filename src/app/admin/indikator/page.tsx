import { createClient } from "@/lib/supabase/server";
import { assertOk } from "@/lib/errors";
import { ContentGrid } from "@/components/layout/content-grid";
import { IndikatorManager, type IndikatorRow } from "@/components/admin/indikator-manager";

export default async function IndikatorPage() {
  const supabase = await createClient();
  const [indikatorResult, bidangResult, profilesResult, kegiatanResult] =
    await Promise.all([
      supabase.from("indikator").select("*").order("nama"),
      supabase.from("bidang").select("*").order("nama"),
      supabase.from("profiles").select("id, nama, username").order("nama"),
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

  const now = new Date();
  const bulanBerjalan = now.getMonth() + 1;
  const tahunBerjalan = now.getFullYear();

  const bidangNama = new Map(bidangList.map((bidang) => [bidang.id, bidang.nama]));
  const userById = new Map(profiles.map((profile) => [profile.id, profile]));
  const tanggalByKegiatan = new Map(kegiatanList.map((row) => [row.id, row.tanggal]));

  const capaian = new Map<string, { bulanIni: number; total: number }>();
  if (kegiatanList.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from("kegiatan_indikator")
      .select("kegiatan_id, indikator_id")
      .in("kegiatan_id", kegiatanList.map((row) => row.id));
    assertOk(linksError, "Gagal memuat capaian. Coba lagi.");
    for (const indikator of indikators) {
      let bulanIni = 0;
      let total = 0;
      for (const link of links ?? []) {
        if (link.indikator_id !== indikator.id) continue;
        const tanggal = tanggalByKegiatan.get(link.kegiatan_id);
        if (!tanggal) continue;
        total += 1;
        const [y, m] = tanggal.split("-").map(Number);
        if (y === tahunBerjalan && m === bulanBerjalan) bulanIni += 1;
      }
      capaian.set(indikator.id, { bulanIni, total });
    }
  }

  const items: IndikatorRow[] = indikators.map((indikator) => {
    const hitung = capaian.get(indikator.id) ?? { bulanIni: 0, total: 0 };
    const owner = !indikator.bidang_id && !indikator.user_id
      ? "Semua"
      : indikator.bidang_id
        ? `Bidang ${bidangNama.get(indikator.bidang_id) ?? ""}`
        : (() => {
            const profile = indikator.user_id ? userById.get(indikator.user_id) : undefined;
            return profile ? `${profile.nama} (${profile.username})` : "User dihapus";
          })();
    return {
      id: indikator.id,
      nama: indikator.nama,
      target: indikator.target_bulanan,
      owner,
      bulanIni: hitung.bulanIni,
      total: hitung.total,
    };
  });

  return (
    <div className="w-full">
      <div className="md:hidden">
        <h1 className="text-xl font-semibold tracking-tight">Indikator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seluruh target kinerja. Tambah di sini berlaku untuk semua user.
        </p>
      </div>
      <div className="mt-6">
        <ContentGrid
          aside={
            <section aria-label="Ringkasan">
              <h2 className="text-sm font-semibold">Ringkasan</h2>
              <ul className="panel mt-2 divide-y divide-border overflow-hidden rounded-lg text-sm">
                <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground">Total indikator</span>
                  <span className="font-medium">{items.length}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground">Tercapai bulan ini</span>
                  <span className="font-medium">
                    {
                      items.filter(
                        (item) =>
                          item.target != null && item.bulanIni >= item.target
                      ).length
                    }
                  </span>
                </li>
                <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground">Tanpa target</span>
                  <span className="font-medium">
                    {items.filter((item) => item.target == null).length}
                  </span>
                </li>
              </ul>
            </section>
          }
        >
          <IndikatorManager initial={items} />
        </ContentGrid>
      </div>
    </div>
  );
}
