import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRevisionList } from "@/lib/laporan/queries";
import { formatHariTanggal } from "@/components/laporan/types";
import { ContentGrid } from "@/components/layout/content-grid";
import { RefListCard } from "@/components/ui/ref-list-card";
import { EmptyState } from "@/components/ui/empty-state";
import { redirect } from "next/navigation";

// Notifikasi user: kegiatan yang perlu perbaikan. Ditautkan dari bel mobile.
export default async function NotifikasiPage() {
  const { user } = await getCurrentProfile();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const items = await getRevisionList(supabase, user.id);

  return (
    <div className="w-full">
      <div className="md:hidden">
        <h1 className="text-xl font-semibold tracking-tight">Notifikasi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length === 0
            ? "Tidak ada yang perlu perhatian."
            : `${items.length} kegiatan perlu diperbaiki.`}
        </p>
      </div>

      <div className="mt-5 md:mt-1">
        <ContentGrid
          gapClassName="lg:gap-3"
          aside={
            <RefListCard
              ariaLabel="Ringkasan"
              title="Ringkasan"
              items={[
                {
                  key: "perlu",
                  title: "Perlu diperbaiki",
                  desc: `${items.length}`,
                },
                {
                  key: "kembali",
                  title: "Kembali ke bulan berjalan",
                  href: "/laporan",
                },
              ]}
            />
          }
        >
          {items.length === 0 ? (
            <RefListCard ariaLabel="Notifikasi" title="Notifikasi">
              <EmptyState
                title="Semua beres"
                description="Tidak ada catatan perbaikan dari admin."
              />
            </RefListCard>
          ) : (
            <RefListCard
              ariaLabel="Notifikasi"
              title="Notifikasi"
              items={items.map((item) => ({
                key: item.id,
                title: item.nama,
                subtitle: formatHariTanggal(item.tanggal),
                note: item.catatan ?? undefined,
                href: `/laporan/${item.id}`,
              }))}
            />
          )}
        </ContentGrid>
      </div>
    </div>
  );
}
