import { createClient } from "@/lib/supabase/server";
import { assertOk } from "@/lib/errors";
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

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Bidang</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Kelompok kerja untuk para pengguna.
      </p>
      <div className="mt-6">
        <BidangManager initial={initial} />
      </div>
    </div>
  );
}
