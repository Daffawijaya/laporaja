import Link from "next/link";

import { ContentGrid } from "@/components/layout/content-grid";
import { RefListCard } from "@/components/ui/ref-list-card";
import { assertOk } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getIsianRekap } from "@/lib/laporan-tambahan/queries";

// Dashboard superadmin: angka + kelola + ketuntasan isian per user.
export default async function AdminPage() {
  const supabase = await createClient();
  const [profilesResult, bidangResult, sectionResult, rekap] = await Promise.all([
    supabase.from("profiles").select("id").eq("role", "user"),
    supabase.from("bidang").select("id"),
    supabase.from("laporan_tambahan").select("id"),
    getIsianRekap(supabase),
  ]);
  assertOk(profilesResult.error, "Gagal memuat data pengguna. Coba lagi.");
  assertOk(bidangResult.error, "Gagal memuat data bidang. Coba lagi.");
  assertOk(sectionResult.error, "Gagal memuat data section. Coba lagi.");

  const users = profilesResult.data ?? [];
  const bidangList = bidangResult.data ?? [];
  const sectionList = sectionResult.data ?? [];

  const stats = [
    { label: "Total User", value: users.length, href: "/admin/users" },
    { label: "Total Bidang", value: bidangList.length, href: "/admin/bidang" },
    { label: "Total Section", value: sectionList.length, href: "/admin/section" },
  ];

  const kelola = [
    { label: "Pengguna", desc: `${users.length} akun`, href: "/admin/users" },
    { label: "Bidang", desc: `${bidangList.length} bidang`, href: "/admin/bidang" },
    { label: "Section", desc: `${sectionList.length} section`, href: "/admin/section" },
    { label: "Laporan", desc: "Isian user", href: "/admin/laporan" },
  ];

  return (
    <div className="w-full">
      <div className="md:hidden">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">Ringkasan laporan</p>
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
            ariaLabel="Ketuntasan user"
            title="Ketuntasan User"
            className="mt-3"
            emptyText="Belum ada user. Tambahkan lewat halaman Pengguna."
            items={rekap.map((item) => ({
              key: item.id,
              title: item.nama,
              subtitle: item.bidangNama,
              meta:
                item.total === 0
                  ? "Tanpa tugas"
                  : `${item.terisi}/${item.total} section terisi`,
              href: `/admin/laporan?user=${item.id}`,
            }))}
          />
        </ContentGrid>
      </div>
    </div>
  );
}
