import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getPengaturan } from "@/lib/laporan-tambahan/queries";
import { FotoEditor, PasswordEditor } from "@/components/anda/akun-editor";
import { TandaTanganEditor, type TtdItem } from "@/components/anda/tanda-tangan-editor";
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

  const supabase = await createClient();
  const { data: bidang } = profile.bidang_id
    ? await supabase.from("bidang").select("nama").eq("id", profile.bidang_id).maybeSingle()
    : { data: null };

  const isSuperadmin = profile.role === "superadmin";
  // Daftar tanda tangan (JSON di pengaturan "ttd_daftar"): rusak/kosong = [].
  let ttdDaftar: TtdItem[] = [];
  if (isSuperadmin) {
    const mentah = await getPengaturan(supabase, "ttd_daftar");
    try {
      const parsed: unknown = mentah ? JSON.parse(mentah) : [];
      if (Array.isArray(parsed)) {
        ttdDaftar = parsed
          .filter(
            (item): item is TtdItem =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as TtdItem).nama === "string" &&
              typeof (item as TtdItem).jabatan === "string" &&
              typeof (item as TtdItem).gambar === "string"
          )
          .map((item) => ({ nama: item.nama, jabatan: item.jabatan, gambar: item.gambar }));
      }
    } catch {
      ttdDaftar = [];
    }
  }

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
        <RefListCard ariaLabel="Akun" title="Akun">
          <FotoEditor userId={user.id} fotoAwal={profile.foto} nama={profile.nama} />
          <div className="min-w-0 px-1 pb-1">
            <p className="truncate text-xl font-semibold tracking-tight">{profile.nama}</p>
            <p className="text-sm text-neutral-500">@{profile.username}</p>
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

        {isSuperadmin ? (
          <RefListCard ariaLabel="Tanda tangan" title="Tanda tangan">
            <TandaTanganEditor daftarAwal={ttdDaftar} />
          </RefListCard>
        ) : null}
        </div>
      </ContentGrid>
      </div>
    </div>
  );
}
