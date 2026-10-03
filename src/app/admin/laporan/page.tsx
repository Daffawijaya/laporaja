import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RefListCard } from "@/components/ui/ref-list-card";
import { createClient } from "@/lib/supabase/server";
import { getBulanUser, getIsianRekap, getTugasUser, labelPeriode } from "@/lib/laporan-tambahan/queries";
import { AdminIsianView } from "@/components/admin/admin-isian-view";

// Isian user: lapis 1 daftar user + ketuntasan, lapis 2 daftar bulan user,
// lapis 3 isian satu user satu bulan (baca-saja) + tombol export PDF.
export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; tahun?: string; bulan?: string }>;
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

  const tahun = Number(params.tahun ?? "");
  const bulan = Number(params.bulan ?? "");
  const periodeValid =
    Number.isInteger(tahun) &&
    Number.isInteger(bulan) &&
    tahun >= 2000 &&
    tahun <= 2100 &&
    bulan >= 1 &&
    bulan <= 12;

  if (!periodeValid) {
    const bulanList = await getBulanUser(supabase, selected.id, selected.bidang_id);
    return (
      <div className="w-full">
        <div className="md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">{selected.nama}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pilih bulan laporan.</p>
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
          </div>
          <RefListCard
            ariaLabel={`Bulan laporan ${selected.nama}`}
            emptyText="User ini belum menambahkan bulan."
            items={bulanList.map((row) => ({
              key: `${row.tahun}-${row.bulan}`,
              title: labelPeriode(row),
              subtitle:
                row.total === 0
                  ? "Tanpa tugas"
                  : `${row.terisi}/${row.total} section terisi`,
              href: `/admin/laporan?user=${selected.id}&tahun=${row.tahun}&bulan=${row.bulan}`,
            }))}
          />
        </div>
      </div>
    );
  }

  const tugas = await getTugasUser(supabase, selected.id, selected.bidang_id, { tahun, bulan });

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
              href={`/admin/laporan?user=${selected.id}`}
              aria-label="Kembali ke daftar bulan"
              className="ref-icon-btn-plain"
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </Link>
          </div>
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
            {selected.nama} · {labelPeriode({ tahun, bulan })}
          </h2>
          <Button asChild variant="secondary">
            <a href={`/admin/laporan/export?user=${selected.id}&tahun=${tahun}&bulan=${bulan}`}>
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
