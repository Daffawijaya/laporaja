import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { ContentGrid } from "@/components/layout/content-grid";
import { RefListCard } from "@/components/ui/ref-list-card";
import {
  getLaporanSectionListAdmin,
  getLaporanDetailAdmin,
  getLaporanListAdmin,
} from "@/lib/laporan-tambahan/queries";
import { LaporanTambahanManager } from "@/components/admin/laporan-tambahan-manager";
import { LaporanTambahanDetail } from "@/components/admin/laporan-tambahan-detail";

// Menu admin: section (tugas isian dinamis + bagian laporan per bidang).
// Lapis 1 daftar (?tanpa id), lapis 2 detail per laporan (?id=).
export default async function LaporanTambahanPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  if (typeof params.id === "string" && params.id) {
    const detail = await getLaporanDetailAdmin(supabase, params.id);
    if (!detail) {
      return (
        <div className="w-full">
          <div className="mt-5 md:mt-1">
            <p className="text-sm text-muted-foreground">
              Laporan tidak ditemukan.{" "}
              <Link href="/admin/laporan-tambahan" className="text-accent">
                Kembali ke daftar.
              </Link>
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="w-full">
        <div className="md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">{detail.judul}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Section</p>
        </div>
        <div className="mt-5 md:mt-1">
          <div className="mb-3 flex items-center gap-3">
            <div className="ref-icon-btn-liquid shrink-0 bg-white/85! dark:bg-[rgb(28_28_30/0.85)]!">
              <Link
                href="/admin/laporan-tambahan"
                aria-label="Kembali ke daftar section"
                className="ref-icon-btn-plain"
              >
                <ChevronLeft aria-hidden="true" className="size-5" />
              </Link>
            </div>
            <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
              {detail.judul}
            </h2>
          </div>
          <LaporanTambahanDetail detail={detail} />
        </div>
      </div>
    );
  }

  const [items, section] = await Promise.all([
    getLaporanListAdmin(supabase),
    getLaporanSectionListAdmin(supabase),
  ]);
  const semua = [...section, ...items];
  const belumLengkap = items.filter((item) => item.terisiUser < item.targetUser).length;

  return (
    <div className="w-full">
      <div className="md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">Section</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tugas isian UMKM per bidang per bulan.
        </p>
      </div>
      <div className="mt-5 md:mt-1">
        <ContentGrid
          gapClassName="lg:gap-3"
          aside={
            <RefListCard
              ariaLabel="Ringkasan"
              items={[
                { key: "total", title: "Total laporan", desc: String(semua.length) },
                { key: "belum", title: "Belum lengkap", desc: String(belumLengkap) },
              ]}
            />
          }
        >
          <LaporanTambahanManager initial={semua} />
        </ContentGrid>
      </div>
    </div>
  );
}
