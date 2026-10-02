import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RefListCard } from "@/components/ui/ref-list-card";
import { createClient } from "@/lib/supabase/server";
import { getIsianRekap, getTugasUser } from "@/lib/laporan-tambahan/queries";
import { AdminIsianView } from "@/components/admin/admin-isian-view";

// Isian user: lapis 1 daftar user + ketuntasan, lapis 2 isian satu user
// (baca-saja) + tombol export PDF.
export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("profiles")
    .select("id, nama, username, bidang_id")
    .eq("role", "user")
    .order("nama");
  const userList = users ?? [];
  const selected = userList.find((user) => user.id === params.user) ?? null;

  if (!selected) {
    const rekap = await getIsianRekap(supabase);
    const statByUser = new Map(rekap.map((stat) => [stat.id, stat]));
    return (
      <div className="w-full">
        <div className="md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">Laporan</h1>
          <p className="mt-1 text-sm text-muted-foreground">Isian section per user.</p>
        </div>
        <div className="mt-5 md:mt-1">
          <RefListCard
            ariaLabel="Isian user"
            emptyText="Belum ada user. Tambahkan lewat halaman Pengguna."
            items={userList.map((user) => {
              const stat = statByUser.get(user.id);
              return {
                key: user.id,
                title: user.nama,
                subtitle: stat
                  ? `${stat.bidangNama} · ${stat.terisi}/${stat.total} section terisi`
                  : "Tanpa tugas",
                href: `/admin/laporan?user=${user.id}`,
              };
            })}
          />
        </div>
      </div>
    );
  }

  const tugas = await getTugasUser(supabase, selected.id, selected.bidang_id);

  return (
    <div className="w-full">
      <div className="md:hidden">
        <h1 className="text-xl font-semibold tracking-tight">{selected.nama}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Isian section user.</p>
      </div>
      <div className="mt-5 md:mt-1">
        <div className="mb-3 flex items-center gap-3">
          <div className="ref-icon-btn-liquid shrink-0 bg-white/85! dark:bg-[rgb(28_28_30/0.85)]!">
            <Link
              href="/admin/laporan"
              aria-label="Kembali ke daftar user"
              className="ref-icon-btn-plain"
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </Link>
          </div>
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
            {selected.nama}
          </h2>
          <Button asChild variant="secondary">
            <a href={`/admin/laporan/export?user=${selected.id}`}>
              <Download aria-hidden="true" />
              Export PDF
            </a>
          </Button>
        </div>
        <AdminIsianView tugas={tugas} />
      </div>
    </div>
  );
}
