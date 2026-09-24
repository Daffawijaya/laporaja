import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { TambahKegiatanButton } from "@/components/laporan/tambah-kegiatan-button";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMonthlyLaporan } from "@/lib/laporan/queries";
import { NAMA_BULAN, formatTanggalPanjang } from "@/components/laporan/types";

// Dashboard user: sapaan, ringkasan bulan berjalan, tombol tambah,
// dan daftar yang perlu diperbaiki. Tanpa card dan grafik berlebihan.
export default async function LaporanPage() {
  const now = new Date();
  const bulan = now.getMonth() + 1;
  const tahun = now.getFullYear();

  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");

  const supabase = await createClient();
  const items = await getMonthlyLaporan(supabase, user.id, tahun, bulan);
  let disetujui = 0;
  let revisi = 0;
  for (const item of items) {
    if (item.review?.status === "approved") disetujui += 1;
    else if (item.review?.status === "revision") revisi += 1;
  }
  const menunggu = items.length - disetujui - revisi;
  const perluDiperbaiki = items.filter((item) => item.review?.status === "revision");

  const ringkasan = [
    { label: "Total kegiatan", value: items.length },
    { label: "Disetujui", value: disetujui },
    { label: "Revisi", value: revisi },
    { label: "Menunggu Review", value: menunggu },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Selamat datang, {profile.nama}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {NAMA_BULAN[bulan - 1]} {tahun}
      </p>

      <section aria-label="Ringkasan" className="mt-6">
        <h2 className="text-sm font-semibold">Ringkasan</h2>
        <ul className="shadow-subtle mt-2 rounded-lg border border-border bg-white px-4 py-2">
          {ringkasan.map((row) => (
            <li
              key={row.label}
              className="flex min-h-[44px] items-center justify-between gap-3 border-b border-border text-sm last:border-0"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium">{row.value}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6">
        <TambahKegiatanButton userId={user.id} />
      </div>

      <section aria-label="Perlu diperbaiki" className="mt-8">
        <h2 className="text-sm font-semibold">Perlu Diperbaiki</h2>
        {perluDiperbaiki.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Tidak ada yang perlu diperbaiki.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {perluDiperbaiki.map((item) => (
              <li
                key={item.id}
                className="shadow-subtle rounded-lg border border-border bg-white px-4 py-3"
              >
                <Link
                  href={`/laporan/${item.id}`}
                  className="text-sm font-medium hover:text-accent"
                >
                  {item.nama}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatTanggalPanjang(item.tanggal)}
                </p>
                {item.review?.catatan && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-sm text-amber-800">
                      Revisi: &ldquo;{item.review.catatan}&rdquo;
                    </p>
                  </div>
                )}
                <Button variant="secondary" asChild className="mt-3 w-full sm:w-auto">
                  <Link href={`/laporan/${item.id}`}>Perbaiki</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8">
        <Button variant="secondary" asChild className="w-full sm:w-auto">
          <Link href={`/laporan/bulan?bulan=${bulan}&tahun=${tahun}`}>
            Lihat laporan bulanan
          </Link>
        </Button>
      </div>
    </div>
  );
}
