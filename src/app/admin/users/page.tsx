import { createClient } from "@/lib/supabase/server";
import { assertOk } from "@/lib/errors";
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

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-xl font-semibold tracking-tight">Pengguna</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Akun yang dapat masuk memakai username dan kata sandi.
      </p>
      <div className="mt-6">
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
  );
}
