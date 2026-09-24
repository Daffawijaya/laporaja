import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { NAMA_BULAN, formatTanggalPanjang } from "@/components/laporan/types";

// Dashboard superadmin: ringkas dan berorientasi tindakan. Tanpa analytics
// rumit dan tanpa grafik. Angka bulan berjalan, daftar tunggu review,
// dan ringkasan per user yang mengarah ke laporan masing-masing.
export default async function AdminPage() {
  const now = new Date();
  const tahun = now.getFullYear();
  const bulan = now.getMonth() + 1;
  const firstDay = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
  const lastDate = new Date(tahun, bulan, 0).getDate();
  const lastDay = `${tahun}-${String(bulan).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
  const labelBulan = `${NAMA_BULAN[bulan - 1]} ${tahun}`;

  const supabase = await createClient();
  const [{ data: profiles }, { data: bidangList }] = await Promise.all([
    supabase.from("profiles").select("id, nama, username, role, bidang_id").order("nama"),
    supabase.from("bidang").select("id, nama"),
  ]);

  const users = (profiles ?? []).filter((profile) => profile.role === "user");
  const bidangNama = new Map((bidangList ?? []).map((bidang) => [bidang.id, bidang.nama]));
  const userIds = users.map((user) => user.id);

  let kegiatanBulanIni: { id: string; user_id: string; tanggal: string; nama_kegiatan: string }[] = [];
  let reviewBulanIni: { kegiatan_id: string; status: "approved" | "revision" }[] = [];
  if (userIds.length > 0) {
    const [{ data: kegiatan }, { data: reviews }] = await Promise.all([
      supabase
        .from("kegiatan")
        .select("id, user_id, tanggal, nama_kegiatan")
        .in("user_id", userIds)
        .gte("tanggal", firstDay)
        .lte("tanggal", lastDay),
      supabase.from("reviews").select("kegiatan_id, status"),
    ]);
    kegiatanBulanIni = kegiatan ?? [];
    // Hanya review untuk kegiatan bulan ini.
    const idsBulanIni = new Set(kegiatanBulanIni.map((kegiatan) => kegiatan.id));
    reviewBulanIni = (reviews ?? []).filter((review) => idsBulanIni.has(review.kegiatan_id));
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

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">{labelBulan}</p>

      <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="transition-soft shadow-subtle rounded-lg border border-border bg-white px-4 py-4 hover:bg-muted"
          >
            <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </Link>
        ))}
      </div>

      <section aria-label="Perlu review" id="perlu-review" className="mt-8 scroll-mt-20">
        <h2 className="text-sm font-semibold">Perlu Review</h2>
        {perluReview.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Semua laporan bulan ini sudah direview.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {perluReview.map((kegiatan) => (
              <li
                key={kegiatan.id}
                className="shadow-subtle flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{namaByUser.get(kegiatan.user_id)}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatTanggalPanjang(kegiatan.tanggal)}
                  </p>
                  <p className="truncate text-sm">{kegiatan.nama_kegiatan}</p>
                </div>
                <Link
                  href={`/admin/laporan/${kegiatan.id}`}
                  className="transition-soft flex min-h-[44px] shrink-0 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Ringkasan user" className="mt-8">
        <h2 className="text-sm font-semibold">Ringkasan User</h2>
        {ringkasan.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Belum ada user. Tambahkan lewat halaman Pengguna.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {ringkasan.map((item) => (
              <li key={item.user.id}>
                <Link
                  href={`/admin/laporan?user=${item.user.id}&bulan=${bulan}&tahun=${tahun}`}
                  className="transition-soft shadow-subtle block rounded-lg border border-border bg-white px-4 py-3 hover:bg-muted"
                >
                  <p className="text-sm font-medium">{item.user.nama}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.user.bidang_id ? (bidangNama.get(item.user.bidang_id) ?? "Tanpa bidang") : "Tanpa bidang"}
                    {" · "}
                    {labelBulan}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
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
  );
}
