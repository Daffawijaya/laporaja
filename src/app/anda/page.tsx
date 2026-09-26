import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { LogoutButton } from "@/components/auth/logout-button";
import { ContentGrid } from "@/components/layout/content-grid";
import { ThemeSwitchSetting } from "@/components/layout/theme-switch";
import { RefListCard } from "@/components/ui/ref-list-card";
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
            <RefListCard ariaLabel="Pengaturan" title="Pengaturan">
              <div className="rounded-2xl bg-neutral-50 p-3 dark:bg-white/5">
                <ThemeSwitchSetting />
              </div>
            </RefListCard>

            <LogoutButton />
          </>
        }
      >
        <RefListCard ariaLabel="Akun" title="Akun">
          <div className="flex items-center gap-4 px-1 pb-3">
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

          <ul className="divide-y divide-neutral-200/70 text-sm dark:divide-white/10">
            <li className="flex items-center justify-between gap-3 px-1 py-3">
              <span className="text-sm font-medium">Peran</span>
              <span className="shrink-0 text-xs text-neutral-500">
                {profile.role === "superadmin" ? "Superadmin" : "Pengguna"}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3 px-1 pt-3">
              <span className="text-sm font-medium">Bidang</span>
              <span className="shrink-0 text-xs text-neutral-500">
                {bidang?.nama ?? "Tanpa bidang"}
              </span>
            </li>
          </ul>
        </RefListCard>
      </ContentGrid>
      </div>
    </div>
  );
}
