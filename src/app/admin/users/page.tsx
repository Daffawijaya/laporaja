import { createClient } from "@/lib/supabase/server";
import { UserManager, type AdminUserRow } from "@/components/admin/user-manager";

export default async function UsersPage() {
  const supabase = await createClient();
  const [{ data: profiles }, { data: bidangList }, { data: subs }] = await Promise.all([
    supabase.from("profiles").select("*").order("nama"),
    supabase.from("bidang").select("*").order("nama"),
    supabase.from("user_sub_bidang").select("*").order("nama"),
  ]);

  const bidangNama = new Map((bidangList ?? []).map((bidang) => [bidang.id, bidang.nama]));
  const subsByUser = new Map<string, string[]>();
  for (const sub of subs ?? []) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub.nama);
    subsByUser.set(sub.user_id, list);
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
        />
      </div>
    </div>
  );
}
