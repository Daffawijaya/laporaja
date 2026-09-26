import { createClient } from "@/lib/supabase/server";
import { assertOk } from "@/lib/errors";
import { ContentGrid } from "@/components/layout/content-grid";
import { UserManager, type AdminUserRow } from "@/components/admin/user-manager";

export default async function UsersPage() {
  const supabase = await createClient();
  const [profilesResult, bidangResult, subsResult, indikatorResult] = await Promise.all([
    supabase.from("profiles").select("*").order("nama"),
    supabase.from("bidang").select("*").order("nama"),
    supabase.from("user_sub_bidang").select("*").order("nama"),
    supabase.from("indikator").select("user_id, nama, target_bulanan").order("nama"),
  ]);
  assertOk(profilesResult.error, "Gagal memuat data pengguna. Coba lagi.");
  assertOk(bidangResult.error, "Gagal memuat data bidang. Coba lagi.");
  assertOk(subsResult.error, "Gagal memuat sub bidang. Coba lagi.");
  assertOk(indikatorResult.error, "Gagal memuat indikator. Coba lagi.");
  const profiles = profilesResult.data;
  const bidangList = bidangResult.data;
  const subs = subsResult.data;

  const bidangNama = new Map((bidangList ?? []).map((bidang) => [bidang.id, bidang.nama]));
  const subsByUser = new Map<string, string[]>();
  for (const sub of subs ?? []) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub.nama);
    subsByUser.set(sub.user_id, list);
  }
  const indikatorsByUser = new Map<string, { nama: string; target: number | null }[]>();
  for (const row of indikatorResult.data ?? []) {
    if (!row.user_id) continue;
    const list = indikatorsByUser.get(row.user_id) ?? [];
    list.push({ nama: row.nama, target: row.target_bulanan });
    indikatorsByUser.set(row.user_id, list);
  }

  const users: AdminUserRow[] = (profiles ?? []).map((profile) => ({
    profile,
    bidangNama: profile.bidang_id ? (bidangNama.get(profile.bidang_id) ?? null) : null,
    subBidang: subsByUser.get(profile.id) ?? [],
  }));

  const perBidang = new Map<string, number>();
  for (const user of users) {
    const nama = user.bidangNama ?? "Tanpa bidang";
    perBidang.set(nama, (perBidang.get(nama) ?? 0) + 1);
  }
  const sebaran = [...perBidang.entries()].sort((a, b) => a[0].localeCompare(b[0], "id"));

  return (
    <div className="w-full">
      <div className="md:hidden">
        <h1 className="text-xl font-semibold tracking-tight">Pengguna</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Akun yang dapat masuk memakai username dan kata sandi.
        </p>
      </div>
      <div className="mt-5 md:mt-1">
        <ContentGrid
          gapClassName="lg:gap-3"
          aside={
            <section aria-label="Sebaran bidang" className="ref-card p-4 pb-6">
              <h2 className="text-sm font-semibold">Sebaran bidang</h2>
              <ul className="mt-2 divide-y divide-neutral-200/70 text-sm dark:divide-white/10">
                <li className="flex items-center justify-between gap-3 px-1 py-2.5">
                  <span className="text-neutral-500">Total user</span>
                  <span className="font-medium">{users.length}</span>
                </li>
                {sebaran.map(([nama, jumlah]) => (
                  <li
                    key={nama}
                    className="flex items-center justify-between gap-3 px-1 py-2.5"
                  >
                    <span className="min-w-0 truncate text-neutral-500">{nama}</span>
                    <span className="font-medium">{jumlah}</span>
                  </li>
                ))}
              </ul>
            </section>
          }
        >
          <div className="ref-card p-4 pb-6">
            <h2 className="text-sm font-semibold">Pengguna</h2>
            <div className="mt-2">
              <UserManager
                users={users}
                bidangOptions={(bidangList ?? []).map((bidang) => ({
                  id: bidang.id,
                  nama: bidang.nama,
                }))}
                indikatorsByUser={indikatorsByUser}
              />
            </div>
          </div>
        </ContentGrid>
      </div>
    </div>
  );
}
