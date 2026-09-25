import { createClient } from "@/lib/supabase/server";
import { assertOk } from "@/lib/errors";
import { ContentGrid } from "@/components/layout/content-grid";
import { BidangManager } from "@/components/admin/bidang-manager";

export interface BidangWithCount {
  id: string;
  nama: string;
  userCount: number;
}

export default async function BidangPage() {
  const supabase = await createClient();
  const [bidangResult, profilesResult] = await Promise.all([
    supabase.from("bidang").select("*").order("nama"),
    supabase.from("profiles").select("bidang_id"),
  ]);
  assertOk(bidangResult.error, "Gagal memuat data bidang. Coba lagi.");
  assertOk(profilesResult.error, "Gagal memuat data pengguna. Coba lagi.");
  const bidangList = bidangResult.data;
  const profiles = profilesResult.data;

  const counts = new Map<string, number>();
  for (const profile of profiles ?? []) {
    if (profile.bidang_id) {
      counts.set(profile.bidang_id, (counts.get(profile.bidang_id) ?? 0) + 1);
    }
  }

  const initial: BidangWithCount[] = (bidangList ?? []).map((bidang) => ({
    id: bidang.id,
    nama: bidang.nama,
    userCount: counts.get(bidang.id) ?? 0,
  }));

  const totalUser = initial.reduce((sum, bidang) => sum + bidang.userCount, 0);
  const kosong = initial.filter((bidang) => bidang.userCount === 0).length;

  return (
    <div className="w-full">
      <h1 className="text-xl font-semibold tracking-tight">Bidang</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Kelompok kerja untuk para pengguna.
      </p>
      <div className="mt-6">
        <ContentGrid
          aside={
            <section aria-label="Ringkasan">
              <h2 className="text-sm font-semibold">Ringkasan</h2>
              <ul className="panel mt-2 divide-y divide-border overflow-hidden rounded-lg text-sm">
                <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground">Total bidang</span>
                  <span className="font-medium">{initial.length}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground">Total user</span>
                  <span className="font-medium">{totalUser}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground">Bidang kosong</span>
                  <span className="font-medium">{kosong}</span>
                </li>
              </ul>
            </section>
          }
        >
          <BidangManager initial={initial} />
        </ContentGrid>
      </div>
    </div>
  );
}
