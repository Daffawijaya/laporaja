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
      <ContentGrid
        aside={
          <>
            <section aria-label="Pengaturan">
              <h2 className="text-sm font-semibold">Pengaturan</h2>
              <div className="panel mt-2 overflow-hidden rounded-lg">
                <ThemeSwitchSetting />
              </div>
            </section>

            <LogoutButton />
          </>
        }
      >
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-16 items-center justify-center rounded-full bg-accent text-2xl font-semibold text-white"
          >
            {(profile.nama.charAt(0) || "?").toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{profile.nama}</h1>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
          </div>
        </div>

        <dl className="panel mt-6 divide-y divide-border overflow-hidden rounded-lg text-sm">
          <div className="flex gap-2 px-4 py-3">
            <dt className="w-24 shrink-0 text-muted-foreground">Peran</dt>
            <dd>{profile.role === "superadmin" ? "Superadmin" : "Pengguna"}</dd>
          </div>
          <div className="flex gap-2 px-4 py-3">
            <dt className="w-24 shrink-0 text-muted-foreground">Bidang</dt>
            <dd>{bidang?.nama ?? "Tanpa bidang"}</dd>
          </div>
        </dl>
      </ContentGrid>
    </div>
  );
}
