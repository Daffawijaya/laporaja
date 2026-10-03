import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RefListCard } from "@/components/ui/ref-list-card";
import { createClient } from "@/lib/supabase/server";
import {
  getBulanAdmin,
  getBulanUser,
  getLaporanUserBulan,
  getTugasUser,
  labelPeriode,
  labelStatusReview,
} from "@/lib/laporan-tambahan/queries";
import { AdminIsianView } from "@/components/admin/admin-isian-view";
import { LaporanBulanList } from "@/components/admin/laporan-bulan-list";

// Isian user per bulan: lapis 1 daftar bulan (dibuka pengguna) → lapis 2
// daftar pengguna per bulan + tab filter status → lapis 3 isian satu user
// satu bulan (baca-saja) + tombol export PDF.
// Jalur dari /admin/users (?user= tanpa periode): lapis 1 khusus satu user
// → daftar bulan miliknya → klik bulan masuk ke lapis 3 (?tahun&bulan&user).
export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ tahun?: string; bulan?: string; user?: string; from?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

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
    // Dari dropdown /admin/users: ?user=<id> → daftar bulan milik user itu
    // dulu, baru tiap bulan bisa dibuka ke isian (?tahun&bulan&user).
    if (params.user) {
      const { data: userRow } = await supabase
        .from("profiles")
        .select("id, nama, username, bidang_id")
        .eq("id", params.user)
        .eq("role", "user")
        .maybeSingle();
      if (!userRow) {
        return (
          <div className="w-full">
            <div className="md:hidden">
              <h1 className="text-xl font-semibold tracking-tight">Laporan</h1>
              <p className="mt-1 text-sm text-muted-foreground">Pengguna tidak ditemukan.</p>
            </div>
            <div className="mt-5 md:mt-1">
              <div className="mb-3 flex items-center gap-3">
                <div className="ref-icon-btn-liquid shrink-0 bg-white/85! dark:bg-[rgb(28_28_30/0.85)]!">
                  <Link
                    href="/admin/users"
                    aria-label="Kembali ke daftar pengguna"
                    className="ref-icon-btn-plain"
                  >
                    <ChevronLeft aria-hidden="true" className="size-5" />
                  </Link>
                </div>
                <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
                  Pengguna tidak ditemukan
                </h2>
              </div>
              <RefListCard
                ariaLabel="Bulan laporan pengguna"
                emptyText="Pengguna tidak ditemukan atau sudah dihapus."
                items={[]}
              />
            </div>
          </div>
        );
      }
      const bulanUser = await getBulanUser(supabase, userRow.id, userRow.bidang_id);
      return (
        <div className="w-full">
          <div className="md:hidden">
            <h1 className="text-xl font-semibold tracking-tight">{userRow.nama}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pilih bulan laporan.</p>
          </div>
          <div className="mt-5 md:mt-1">
            <div className="mb-3 flex items-center gap-3">
              <div className="ref-icon-btn-liquid shrink-0 bg-white/85! dark:bg-[rgb(28_28_30/0.85)]!">
                <Link
                  href="/admin/users"
                  aria-label="Kembali ke daftar pengguna"
                  className="ref-icon-btn-plain"
                >
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </Link>
              </div>
              <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
                {userRow.nama}
              </h2>
            </div>
            <RefListCard
              ariaLabel={`Bulan laporan ${userRow.nama}`}
              emptyText="Belum ada bulan. Bulan muncul setelah pengguna menambahkannya."
              items={bulanUser.map((row) => ({
                key: `${row.tahun}-${row.bulan}`,
                title: labelPeriode(row),
                subtitle:
                  row.total === 0
                    ? "Tanpa tugas"
                    : `${row.terisi}/${row.total} section terisi`,
                desc: labelStatusReview(row.status),
                href: `/admin/laporan?tahun=${row.tahun}&bulan=${row.bulan}&user=${userRow.id}&from=users`,
              }))}
            />
          </div>
        </div>
      );
    }
    const bulanList = await getBulanAdmin(supabase);
    return (
      <div className="w-full">
        <div className="md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">Laporan</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pilih bulan laporan.</p>
        </div>
        <div className="mt-5 md:mt-1">
          <RefListCard
            ariaLabel="Bulan laporan"
            emptyText="Belum ada bulan. Bulan muncul setelah pengguna menambahkannya."
            items={bulanList.map((row) => ({
              key: `${row.tahun}-${row.bulan}`,
              title: labelPeriode(row),
              subtitle: `${row.userCount} pengguna`,
              href: `/admin/laporan?tahun=${row.tahun}&bulan=${row.bulan}`,
            }))}
          />
        </div>
      </div>
    );
  }

  const periode = { tahun, bulan };
  const { data: selected } = params.user
    ? await supabase
        .from("profiles")
        .select("id, nama, username, bidang_id")
        .eq("id", params.user)
        .eq("role", "user")
        .maybeSingle()
    : { data: null };

  if (!selected) {
    const rows = await getLaporanUserBulan(supabase, periode);
    return (
      <div className="w-full">
        <div className="md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">{labelPeriode(periode)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pilih pengguna.</p>
        </div>
        <div className="mt-5 md:mt-1">
          <div className="mb-3 flex items-center gap-3">
            <div className="ref-icon-btn-liquid shrink-0 bg-white/85! dark:bg-[rgb(28_28_30/0.85)]!">
              <Link
                href="/admin/laporan"
                aria-label="Kembali ke daftar bulan"
                className="ref-icon-btn-plain"
              >
                <ChevronLeft aria-hidden="true" className="size-5" />
              </Link>
            </div>
            <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
              {labelPeriode(periode)}
            </h2>
          </div>
          <LaporanBulanList rows={rows} periode={periode} />
        </div>
      </div>
    );
  }

  const tugas = await getTugasUser(supabase, selected.id, selected.bidang_id, { tahun, bulan });

  // Kembali kontekstual: dari /admin/users (?user → bulan → isian) kembali
  // ke daftar bulan user itu; selain itu kembali ke daftar pengguna bulan itu.
  const dariUsers = params.from === "users";

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
              href={
                dariUsers
                  ? `/admin/laporan?user=${selected.id}`
                  : `/admin/laporan?tahun=${tahun}&bulan=${bulan}`
              }
              aria-label={
                dariUsers ? "Kembali ke daftar bulan" : "Kembali ke daftar pengguna"
              }
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
