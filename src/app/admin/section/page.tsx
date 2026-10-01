import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getBidangTargetMatrix,
  getLaporanEditData,
  getSectionBuilderData,
  getSectionEditData,
} from "@/lib/laporan-tambahan/queries";
import { SectionBuilder } from "@/components/admin/section-builder";
import { LaporanSectionEdit, LaporanTambahanEdit } from "@/components/admin/laporan-tambahan-form";

// Menu admin: section (tugas isian dinamis + bagian laporan per bidang).
// Lapis 1 daftar (?tanpa id), lapis 2 detail per laporan (?id=).
export default async function SectionPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  if (typeof params.id === "string" && params.id) {
    // Id section tetap berupa kode teks; id dinamis berupa uuid.
    // Lihat section = buka form isinya (judul + bidang) agar bisa diubah.
    const section = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      params.id
    )
      ? null
      : await getSectionEditData(supabase, params.id);
    if (section) {
      return (
        <div className="w-full">
          <div className="md:hidden">
            <h1 className="text-xl font-semibold tracking-tight">{section.judul}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Section</p>
          </div>
          <div className="mt-5 md:mt-1">
            <div className="mb-3 flex items-center gap-3">
              <div className="ref-icon-btn-liquid shrink-0 bg-white/85! dark:bg-[rgb(28_28_30/0.85)]!">
                <Link
                  href="/admin/section"
                  aria-label="Kembali ke daftar section"
                  className="ref-icon-btn-plain"
                >
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </Link>
              </div>
              <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
                {section.judul}
              </h2>
            </div>
            <LaporanSectionEdit key={section.kode} data={section} />
          </div>
        </div>
      );
    }
    const detail = await getLaporanEditData(supabase, params.id);
    if (!detail) {
      return (
        <div className="w-full">
          <div className="mt-5 md:mt-1">
              <p className="text-sm text-muted-foreground">
                Section tidak ditemukan.{" "}
              <Link href="/admin/section" className="text-accent">
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
                href="/admin/section"
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
          <LaporanTambahanEdit key={detail.id} data={detail} />
        </div>
      </div>
    );
  }

  const [semua, matrix] = await Promise.all([
    getSectionBuilderData(supabase),
    getBidangTargetMatrix(supabase),
  ]);

  return (
    <div className="w-full">
      <div className="md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">Section</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tugas isian UMKM per bidang per bulan.
        </p>
      </div>
      <div className="mt-5 md:mt-1">
        <SectionBuilder
          initialItems={semua}
          bidangList={matrix.semuaBidang}
          userCountByBidang={matrix.userCountByBidang}
        />
      </div>
    </div>
  );
}
