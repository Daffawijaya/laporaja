import Link from "next/link";
import { Download } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { clampBulan, clampTahun, getMonthlyLaporan } from "@/lib/laporan/queries";
import { AdminLaporanFilter } from "@/components/admin/admin-laporan-filter";
import { AdminMonthlyList } from "@/components/admin/admin-monthly-list";

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
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, nama, role")
    .order("nama");

  const users = (profiles ?? []).filter((profile) => profile.role === "user");
  const selectedId = typeof params.user === "string" ? params.user : "";
  const selected = users.find((user) => user.id === selectedId) ?? null;

  const items = selected ? await getMonthlyLaporan(supabase, selected.id, tahun, bulan) : [];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Laporan User</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pilih user dan bulan untuk memeriksa laporan.
      </p>
      <div className="mt-4">
        <AdminLaporanFilter
          users={users.map((user) => ({ id: user.id, nama: user.nama, username: user.username }))}
          selectedUserId={selected?.id ?? ""}
          bulan={bulan}
          tahun={tahun}
        />
      </div>
      <div className="mt-6">
        {!selected ? (
          <p className="text-sm text-muted-foreground">Pilih user terlebih dahulu.</p>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{selected.nama}</p>
                <p className="text-xs text-muted-foreground">{selected.username}</p>
              </div>
              <Link
                href={`/admin/laporan/export?user=${selected.id}&bulan=${bulan}&tahun=${tahun}`}
                className="transition-soft inline-flex min-h-[44px] items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
              >
                <Download aria-hidden="true" className="size-4" />
                Export PDF
              </Link>
            </div>
            <div className="mt-4">
              <AdminMonthlyList tahun={tahun} bulan={bulan} items={items} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
