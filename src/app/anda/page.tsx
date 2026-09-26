import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { LogoutButton } from "@/components/auth/logout-button";
import { ContentGrid } from "@/components/layout/content-grid";
import { ThemeSwitchSetting } from "@/components/layout/theme-switch";
import { redirect } from "next/navigation";

// Halaman akun ala menu Anda: ringkasan profil, pengaturan, tombol keluar.
// Ditautkan dari avatar mobile.
export default async function AndaPage() {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");

  const supabase = await createClient();
  const { data: bidang } = profile.bidang_id
    ? await supabase.from("bidang").select("nama").eq("id", profile.bidang_id).maybeSingle()
    : { data: null };

  return (
    <div className="w-full">
      <div className="mt-5 md:mt-1">
      <ContentGrid
        gapClassName="lg:gap-3"
        aside={
          <>
            <section aria-label="Pengaturan" className="ref-card p-4 pb-6">
              <h2 className="text-sm font-semibold">Pengaturan</h2>
              <div className="mt-2 rounded-2xl bg-neutral-50 p-3 dark:bg-white/5">
                <ThemeSwitchSetting />
              </div>
            </section>

            <LogoutButton />
          </>
        }
      >
        <div className="ref-card p-4 pb-6">
          <h2 className="text-sm font-semibold">Akun</h2>
          <div className="mt-2 flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex size-16 items-center justify-center rounded-full bg-accent text-2xl font-semibold text-white"
            >
              {(profile.nama.charAt(0) || "?").toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold tracking-tight">{profile.nama}</p>
              <p className="text-sm text-neutral-500">@{profile.username}</p>
            </div>
          </div>

          <dl className="mt-2 divide-y divide-neutral-200/70 text-sm dark:divide-white/10">
            <div className="flex gap-2 px-1 py-3">
              <dt className="w-24 shrink-0 text-neutral-500">Peran</dt>
              <dd>{profile.role === "superadmin" ? "Superadmin" : "Pengguna"}</dd>
            </div>
            <div className="flex gap-2 px-1 py-3">
              <dt className="w-24 shrink-0 text-neutral-500">Bidang</dt>
              <dd>{bidang?.nama ?? "Tanpa bidang"}</dd>
            </div>
          </dl>
        </div>
      </ContentGrid>
      </div>
    </div>
  );
}
