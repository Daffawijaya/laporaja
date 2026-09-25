import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRevisionList } from "@/lib/laporan/queries";
import { formatHariTanggal } from "@/components/laporan/types";
import { EmptyState } from "@/components/ui/empty-state";
import { redirect } from "next/navigation";

// Notifikasi user: kegiatan yang perlu perbaikan. Ditautkan dari bel mobile.
export default async function NotifikasiPage() {
  const { user } = await getCurrentProfile();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const items = await getRevisionList(supabase, user.id);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Notifikasi</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {items.length === 0
          ? "Tidak ada yang perlu perhatian."
          : `${items.length} kegiatan perlu diperbaiki.`}
      </p>

      {items.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="Semua beres"
          description="Tidak ada catatan perbaikan dari admin."
        />
      ) : (
        <ul className="panel mt-5 divide-y divide-border overflow-hidden rounded-lg">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-3.5">
              <p className="text-xs text-muted-foreground">
                {formatHariTanggal(item.tanggal)}
              </p>
              <Link
                href={`/laporan/${item.id}`}
                className="transition-soft mt-0.5 block text-sm font-medium hover:text-accent"
              >
                {item.nama}
              </Link>
              {item.catatan && (
                <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                  {item.catatan}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
