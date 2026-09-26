import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ContentGrid } from "@/components/layout/content-grid";
import { assertOk } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { NAMA_BULAN, formatTanggalPanjang } from "@/components/laporan/types";

// Dashboard superadmin: 2 card sejajar — card utama (kiri) dan card Kelola (kanan).
export default async function AdminPage() {
  const now = new Date();
  const tahun = now.getFullYear();
  const bulan = now.getMonth() + 1;
  const firstDay = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
  const lastDate = new Date(tahun, bulan, 0).getDate();
  const lastDay = `${tahun}-${String(bulan).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
  const labelBulan = `${NAMA_BULAN[bulan - 1]} ${tahun}`;

  const supabase = await createClient();
  const [profilesResult, bidangResult] = await Promise.all([
    supabase.from("profiles").select("id, nama, username, bidang_id").eq("role", "user").order("nama"),
    supabase.from("bidang").select("id, nama"),
  ]);
  assertOk(profilesResult.error, "Gagal memuat data pengguna. Coba lagi.");
  assertOk(bidangResult.error, "Gagal memuat data bidang. Coba lagi.");
  const users = profilesResult.data ?? [];
  const bidangList = bidangResult.data;
  const bidangNama = new Map((bidangList ?? []).map((bidang) => [bidang.id, bidang.nama]));
  const userIds = users.map((user) => user.id);

  let kegiatanBulanIni: { id: string; user_id: string; tanggal: string; nama_kegiatan: string }[] = [];
  let reviewBulanIni: { kegiatan_id: string; status: "approved" | "revision" }[] = [];
  if (userIds.length > 0) {
    const kegiatanResult = await supabase
      .from("kegiatan")
      .select("id, user_id, tanggal, nama_kegiatan")
      .in("user_id", userIds)
      .gte("tanggal", firstDay)
      .lte("tanggal", lastDay);
    assertOk(kegiatanResult.error, "Gagal memuat kegiatan bulan ini. Coba lagi.");
    kegiatanBulanIni = kegiatanResult.data ?? [];

    // Review diambil hanya untuk kegiatan bulan ini, bukan seluruh tabel.
    const idsBulanIni = kegiatanBulanIni.map((kegiatan) => kegiatan.id);
    if (idsBulanIni.length > 0) {
      const reviewsResult = await supabase
        .from("reviews")
        .select("kegiatan_id, status")
        .in("kegiatan_id", idsBulanIni);
      assertOk(reviewsResult.error, "Gagal memuat status review. Coba lagi.");
      reviewBulanIni = reviewsResult.data ?? [];
    }
  }

  const statusByKegiatan = new Map(reviewBulanIni.map((review) => [review.kegiatan_id, review.status]));
  // Yang paling lama menunggu ditindaklanjuti lebih dulu.
  const perluReview = kegiatanBulanIni
    .filter((kegiatan) => !statusByKegiatan.has(kegiatan.id))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const namaByUser = new Map(users.map((user) => [user.id, user.nama]));

  const ringkasan = users.map((user) => {
    const milik = kegiatanBulanIni.filter((kegiatan) => kegiatan.user_id === user.id);
    let disetujui = 0;
    let revisi = 0;
    for (const kegiatan of milik) {
      const status = statusByKegiatan.get(kegiatan.id);
      if (status === "approved") disetujui += 1;
      else if (status === "revision") revisi += 1;
    }
    return {
      user,
      total: milik.length,
      disetujui,
      revisi,
      menunggu: milik.length - disetujui - revisi,
    };
  });

  const stats = [
    { label: "Total User", value: users.length, href: "/admin/users" },
    { label: "Total Bidang", value: (bidangList ?? []).length, href: "/admin/bidang" },
    { label: "Laporan Bulan Ini", value: kegiatanBulanIni.length, href: "/admin/laporan" },
    { label: "Perlu Review", value: perluReview.length, href: "#perlu-review" },
  ];

  const kelola = [
    { label: "Pengguna", desc: `${users.length} akun`, href: "/admin/users" },
    { label: "Bidang", desc: `${(bidangList ?? []).length} bidang`, href: "/admin/bidang" },
    { label: "Indikator", desc: "Target kinerja", href: "/admin/indikator" },
    { label: "Laporan", desc: `${kegiatanBulanIni.length} bulan ini`, href: "/admin/laporan" },
  ];

  return (
    <div className="w-full">
      <div className="md:hidden">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">{labelBulan}</p>
      </div>

      <div className="mt-5 md:mt-1">
        <ContentGrid
          gapClassName="lg:gap-3"
          aside={
            <section aria-label="Kelola" className="ref-card p-4">
              <div className="divide-y divide-neutral-200/70 dark:divide-white/10">
                {kelola.map((item, i) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between gap-3 px-1 transition-colors hover:text-black dark:hover:text-white${i === 0 ? " pb-3" : i === kelola.length - 1 ? " pt-3" : " py-3"}`}
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-xs text-neutral-500">{item.desc}</span>
                  </Link>
                ))}
              </div>
            </section>
          }
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {stats.map((stat) => (
              <Link
                key={stat.label}
                href={stat.href}
                className="ref-card px-4 py-4"
              >
                <span className="block text-2xl font-semibold tracking-tight">{stat.value}</span>
                <span className="mt-0.5 block text-xs text-neutral-500">{stat.label}</span>
              </Link>
            ))}
          </div>

          <div className="ref-card mt-3 p-4">
            <section aria-label="Perlu review" id="perlu-review" className="scroll-mt-20">
              <h2 className="text-sm font-semibold">Perlu Review</h2>
              {perluReview.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">
                  Semua laporan bulan ini sudah direview.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-neutral-200/70 dark:divide-white/10">
                  {perluReview.map((kegiatan, i) => (
                    <li
                      key={kegiatan.id}
                      className={`flex items-center justify-between gap-3 px-1${i === 0 ? " pb-3" : i === perluReview.length - 1 ? " pt-3" : " py-3"}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {namaByUser.get(kegiatan.user_id)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-neutral-500">
                          {formatTanggalPanjang(kegiatan.tanggal)} · {kegiatan.nama_kegiatan}
                        </p>
                      </div>
                      <Button asChild className="shrink-0">
                        <Link href={`/admin/laporan/${kegiatan.id}`}>Review</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Ringkasan user" className="mt-6">
              <h2 className="text-sm font-semibold">Ringkasan User</h2>
              {ringkasan.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">
                  Belum ada user. Tambahkan lewat halaman Pengguna.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-neutral-200/70 dark:divide-white/10">
                  {ringkasan.map((item, i) => (
                    <li key={item.user.id}>
                      <Link
                        href={`/admin/laporan?user=${item.user.id}&bulan=${bulan}&tahun=${tahun}`}
                        className={`block px-1 transition-colors hover:text-black dark:hover:text-white${i === 0 ? " pb-3" : i === ringkasan.length - 1 ? " pt-3" : " py-3"}`}
                      >
                        <p className="text-sm font-medium">{item.user.nama}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {item.user.bidang_id
                            ? (bidangNama.get(item.user.bidang_id) ?? "Tanpa bidang")
                            : "Tanpa bidang"}
                          {" · "}
                          {labelBulan}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {item.total} kegiatan · {item.disetujui} disetujui · {item.revisi} revisi ·{" "}
                          {item.menunggu} menunggu review
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </ContentGrid>
      </div>
    </div>
  );
}
