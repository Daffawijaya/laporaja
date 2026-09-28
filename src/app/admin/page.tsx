import Link from "next/link";

import { ContentGrid } from "@/components/layout/content-grid";
import { RefListCard } from "@/components/ui/ref-list-card";
import { assertOk } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getUserMonthStats } from "@/lib/laporan/queries";
import { NAMA_BULAN } from "@/components/laporan/types";

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

  // Status bulanan per user (boolean menunggu per laporan orang).
  const monthStats = await getUserMonthStats(supabase, users, tahun, bulan);
  const statByUser = new Map(monthStats.map((stat) => [stat.id, stat]));
  // Laporan berisi kegiatan yang belum disetujui.
  const perluReview = monthStats.filter((stat) => stat.total > 0 && stat.status !== "approved");

  const totalKegiatanBulanIni = monthStats.reduce((sum, stat) => sum + stat.total, 0);

  const STATUS_LABEL = {
    menunggu: "Menunggu review",
    revision: "Revisi",
    approved: "Selesai",
  } as const;

  const ringkasan = users.map((user) => {
    const stat = statByUser.get(user.id);
    return {
      user,
      total: stat?.total ?? 0,
      statusLabel: stat ? STATUS_LABEL[stat.status] : "Belum lapor",
    };
  });

  const stats = [
    { label: "Total User", value: users.length, href: "/admin/users" },
    { label: "Total Bidang", value: (bidangList ?? []).length, href: "/admin/bidang" },
    { label: "Laporan Bulan Ini", value: totalKegiatanBulanIni, href: "/admin/laporan" },
    { label: "Perlu Review", value: perluReview.length, href: "#perlu-review" },
  ];

  const kelola = [
    { label: "Pengguna", desc: `${users.length} akun`, href: "/admin/users" },
    { label: "Bidang", desc: `${(bidangList ?? []).length} bidang`, href: "/admin/bidang" },
    { label: "Indikator", desc: "Target kinerja", href: "/admin/indikator" },
    { label: "Laporan", desc: `${totalKegiatanBulanIni} bulan ini`, href: "/admin/laporan" },
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
            <RefListCard
              ariaLabel="Kelola"
              items={kelola.map((item) => ({
                key: item.href,
                title: item.label,
                desc: item.desc,
                href: item.href,
              }))}
            />
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

          <RefListCard
            id="perlu-review"
            ariaLabel="Perlu review"
            title="Perlu Review"
            className="mt-3 scroll-mt-20"
            emptyText="Semua laporan bulan ini sudah disetujui."
            items={perluReview.map((stat) => ({
              key: stat.id,
              title: stat.nama,
              subtitle: `${stat.total} kegiatan · ${STATUS_LABEL[stat.status]}`,
              actionHref: `/admin/laporan?user=${stat.id}&bulan=${bulan}&tahun=${tahun}`,
              actionLabel: "Review",
            }))}
          />

          <RefListCard
            ariaLabel="Ringkasan user"
            title="Ringkasan User"
            className="mt-3"
            emptyText="Belum ada user. Tambahkan lewat halaman Pengguna."
            items={ringkasan.map((item) => ({
              key: item.user.id,
              title: item.user.nama,
              subtitle: `${item.user.bidang_id ? (bidangNama.get(item.user.bidang_id) ?? "Tanpa bidang") : "Tanpa bidang"} · ${labelBulan}`,
              meta: item.total === 0 ? "Belum ada laporan" : `${item.total} kegiatan · ${item.statusLabel}`,
              href: `/admin/laporan?user=${item.user.id}&bulan=${bulan}&tahun=${tahun}`,
            }))}
          />
        </ContentGrid>
      </div>
    </div>
  );
}
