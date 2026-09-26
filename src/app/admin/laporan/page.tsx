import Link from "next/link";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { assertOk } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { clampBulan, clampTahun, getMonthlyLaporan } from "@/lib/laporan/queries";
import { AdminLaporanFilter } from "@/components/admin/admin-laporan-filter";
import { AdminMonthlyList } from "@/components/admin/admin-monthly-list";
import { ContentGrid } from "@/components/layout/content-grid";

export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; bulan?: string; tahun?: string }>;
}) {
  const now = new Date();
  const params = await searchParams;
  const bulan = clampBulan(params.bulan, now.getMonth() + 1);
  const tahun = clampTahun(params.tahun, now.getFullYear());

  const supabase = await createClient();
  const { data: users, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, nama")
    .eq("role", "user")
    .order("nama");
  assertOk(profilesError, "Gagal memuat data pengguna. Coba lagi.");
  const userList = users ?? [];
  const selectedId = typeof params.user === "string" ? params.user : "";
  const selected = userList.find((user) => user.id === selectedId) ?? null;

  const items = selected ? await getMonthlyLaporan(supabase, selected.id, tahun, bulan) : [];

  return (
    <div className="w-full">
      <div className="md:hidden">
        <h1 className="text-xl font-semibold tracking-tight">Laporan User</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pilih user dan bulan untuk memeriksa laporan.
        </p>
      </div>

      <div className="mt-5 md:mt-1">
        <ContentGrid
          gapClassName="lg:gap-3"
          aside={
            <section aria-label="Filter laporan" className="ref-card p-4 pb-6">
              <h2 className="text-sm font-semibold">Filter</h2>
              <div className="mt-2 rounded-2xl bg-neutral-50 p-3 dark:bg-white/5">
                <AdminLaporanFilter
                  users={userList.map((user) => ({ id: user.id, nama: user.nama, username: user.username }))}
                  selectedUserId={selected?.id ?? ""}
                  bulan={bulan}
                  tahun={tahun}
                />
              </div>
            </section>
          }
        >
          <div className="ref-card p-4 pb-6">
            <h2 className="text-sm font-semibold">
              {selected ? selected.nama : "Laporan"}
            </h2>
            <div className="mt-2">
              {userList.length === 0 ? (
                <EmptyState
                  title="Belum ada user"
                  description="Tambahkan user lewat halaman Pengguna."
                />
              ) : !selected ? (
                <EmptyState
                  title="Pilih user"
                  description="Pilih user di samping untuk melihat laporan bulanannya."
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{selected.nama}</p>
                      <p className="text-xs text-neutral-500">{selected.username}</p>
                    </div>
                    <Button asChild variant="secondary" className="w-full sm:w-auto">
                      <Link
                        href={`/admin/laporan/export?user=${selected.id}&bulan=${bulan}&tahun=${tahun}`}
                      >
                        <Download aria-hidden="true" />
                        Export PDF
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-5">
                    <AdminMonthlyList items={items} />
                  </div>
                </>
              )}
            </div>
          </div>
        </ContentGrid>
      </div>
    </div>
  );
}
