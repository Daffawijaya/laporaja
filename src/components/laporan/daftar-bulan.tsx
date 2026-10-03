"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { GlassSelect } from "@/components/ui/glass-select";
import { Label } from "@/components/ui/label";
import { RefListCard } from "@/components/ui/ref-list-card";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import { labelPeriode, labelStatusReview, type BulanItem } from "@/lib/laporan-tambahan/queries";

const NAMA_BULAN_PENDEK = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Daftar bulan laporan user: list RefListCard + tambah bulan lewat
// dropdown bulan/tahun. Klik baris masuk ke form bulan itu.
export function DaftarBulan({
  userId,
  initial,
}: {
  userId: string;
  initial: BulanItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [bulanList, setBulanList] = useState(initial);
  const [dialog, setDialog] = useState(false);
  const sekarang = new Date();
  const [bulan, setBulan] = useState(String(sekarang.getMonth() + 1));
  const [tahun, setTahun] = useState(String(sekarang.getFullYear()));
  const [saving, setSaving] = useState(false);

  const tahunIni = sekarang.getFullYear();
  const opsiTahun = [tahunIni - 2, tahunIni - 1, tahunIni, tahunIni + 1].map((t) => ({
    value: String(t),
    label: String(t),
  }));

  // Filter dari search navbar (?q=): saring bulan by label periode.
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const visibleBulan = query
    ? bulanList.filter((row) => labelPeriode(row).toLowerCase().includes(query))
    : bulanList;

  function hrefBulan(tahun: number, bulan: number): string {
    return `/laporan?tahun=${tahun}&bulan=${bulan}`;
  }

  async function handleTambah() {
    if (saving) return;
    const t = Number(tahun);
    const b = Number(bulan);
    if (!t || b < 1 || b > 12) return;
    const ada = bulanList.some((row) => row.tahun === t && row.bulan === b);
    if (ada) {
      setDialog(false);
      router.push(hrefBulan(t, b));
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("monthly_reviews")
        .insert({ user_id: userId, tahun: t, bulan: b });
      if (error) {
        if (error instanceof SessionExpiredError || isSessionError(error)) {
          toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
          router.replace("/login?expired=1");
          return;
        }
        toast.error("Gagal menambah bulan. Coba lagi.");
        return;
      }
      setBulanList((prev) =>
        [...prev, { tahun: t, bulan: b, status: "menunggu", terisi: 0, total: 0 }].sort(
          (x, y) => y.tahun - x.tahun || y.bulan - x.bulan
        )
      );
      toast.success(`${labelPeriode({ tahun: t, bulan: b })} ditambahkan.`);
      setDialog(false);
      router.push(hrefBulan(t, b));
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <RefListCard
        ariaLabel="Daftar bulan laporan"
        emptyText={
          query
            ? `Tidak ada bulan yang cocok dengan "${query}".`
            : "Belum ada bulan. Tambahkan bulan pertama untuk mulai mengisi."
        }
        items={visibleBulan.map((row) => ({
          key: `${row.tahun}-${row.bulan}`,
          title: labelPeriode(row),
          subtitle:
            row.total === 0
              ? "Tanpa tugas"
              : `${row.terisi}/${row.total} section terisi`,
          desc: labelStatusReview(row.status),
          href: hrefBulan(row.tahun, row.bulan),
        }))}
      />
      <div className="mt-3 flex justify-end">
        <Button onClick={() => setDialog(true)} className="rounded-full">
          <Plus aria-hidden="true" />
          Tambah Bulan
        </Button>
      </div>

      <Dialog open={dialog} onClose={() => setDialog(false)} title="Tambah bulan">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Bulan</Label>
            <GlassSelect
              ariaLabel="Pilih bulan"
              value={bulan}
              onChange={setBulan}
              options={NAMA_BULAN_PENDEK.map((nama, i) => ({
                value: String(i + 1),
                label: nama,
              }))}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Tahun</Label>
            <GlassSelect
              ariaLabel="Pilih tahun"
              value={tahun}
              onChange={setTahun}
              options={opsiTahun}
              disabled={saving}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialog(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button onClick={handleTambah} disabled={saving}>
              {saving ? "Menyimpan..." : "Tambah"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
