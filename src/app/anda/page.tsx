import { getCurrentProfile } from "@/lib/auth/session";
import { FotoEditor, PasswordEditor } from "@/components/anda/akun-editor";
import { TandaTanganUser } from "@/components/anda/tanda-tangan-editor";
import { LogoutButton } from "@/components/auth/logout-button";
import { ContentGrid } from "@/components/layout/content-grid";
import { ThemeSwitchSetting } from "@/components/layout/theme-switch";
import { UnduhAplikasi } from "@/components/pwa/unduh-aplikasi";
import { RefListCard } from "@/components/ui/ref-list-card";
import { redirect } from "next/navigation";

// Halaman akun ala menu Anda: ringkasan profil, pengaturan, tombol keluar.
// Ditautkan dari avatar mobile.
export default async function AndaPage() {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");

  const isSuperadmin = profile.role === "superadmin";

  return (
    <div className="w-full">
      <div className="mt-5 md:mt-1">
      <ContentGrid
        gapClassName="lg:gap-3"
        aside={
          <div className="flex min-w-0 flex-col gap-3">
            <RefListCard ariaLabel="Pengaturan" title="Pengaturan">
              <ThemeSwitchSetting />
            </RefListCard>

            <RefListCard ariaLabel="Ganti kata sandi" title="Ganti kata sandi">
              <PasswordEditor username={profile.username} />
            </RefListCard>

            <RefListCard ariaLabel="Aplikasi" title="Aplikasi">
              <UnduhAplikasi />
            </RefListCard>

            <LogoutButton />
          </div>
        }
      >
        <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1 px-1 py-2 text-center">
          <FotoEditor userId={user.id} fotoAwal={profile.foto} nama={profile.nama} />
          <p className="mt-2 w-full truncate text-xl font-semibold tracking-tight">{profile.nama}</p>
          <p className="w-full truncate text-sm text-neutral-500">@{profile.username}</p>
        </div>

        {isSuperadmin ? null : (
          <RefListCard ariaLabel="Tanda tangan" title="Tanda tangan">
            <TandaTanganUser userId={user.id} ttdAwal={profile.ttd} />
          </RefListCard>
        )}
        </div>
      </ContentGrid>
      </div>
    </div>
  );
}
