"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";

const CATATAN_MAKS = 1000;

// Tombol Revisi per baris isian (admin): menandai SATU baris perlu
// diperbaiki beserta catatannya (tabel revisi_baris). Diklik saat belum ada
// → modal isian catatan; sesudah tersimpan tombol berubah jadi Batalkan
// revisi (hapus tanda, kembali ke Revisi).
export function RevisiBarisButton({
  barisId,
  catatanAwal,
}: {
  barisId: string;
  /** Catatan tersimpan; null = baris belum ditandai revisi. */
  catatanAwal: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [buka, setBuka] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  function sesiBerakhir(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  function bukaModal() {
    if (sibuk) return;
    setCatatan("");
    setGalat(null);
    setBuka(true);
  }

  async function simpan() {
    if (sibuk) return;
    const bersih = catatan.trim();
    if (!bersih) {
      setGalat("Isi dulu catatan revisinya.");
      return;
    }
    if (bersih.length > CATATAN_MAKS) {
      setGalat(`Catatan maksimal ${CATATAN_MAKS} karakter.`);
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("revisi_baris")
        .upsert({ baris_id: barisId, catatan: bersih }, { onConflict: "baris_id" });
      if (error) {
        if (sesiBerakhir(error)) return;
        setGalat("Gagal menyimpan revisi. Coba lagi.");
        return;
      }
      toast.success("Baris ditandai perlu revisi.");
      setBuka(false);
      router.refresh();
    } finally {
      setSibuk(false);
    }
  }

  async function batalkan() {
    if (sibuk) return;
    setSibuk(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("revisi_baris").delete().eq("baris_id", barisId);
      if (error) {
        if (sesiBerakhir(error)) return;
        toast.error("Gagal membatalkan revisi. Coba lagi.");
        return;
      }
      toast.success("Tanda revisi dibatalkan.");
      router.refresh();
    } finally {
      setSibuk(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        disabled={sibuk}
        onClick={() => (catatanAwal != null ? void batalkan() : bukaModal())}
        title={catatanAwal ?? undefined}
        className="min-h-9 rounded-full bg-black/[0.075] px-3 text-xs text-accent hover:bg-black/[0.12] hover:text-accent disabled:opacity-100 dark:bg-white/10 dark:hover:bg-white/15"
      >
        {sibuk ? "Menyimpan…" : catatanAwal != null ? "Batalkan revisi" : "Revisi"}
      </Button>
      <Dialog open={buka} onClose={() => !sibuk && setBuka(false)} title="Minta revisi baris ini">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`revisi-catatan-${barisId}`} className="text-left">
              Catatan revisi
            </Label>
            <Textarea
              id={`revisi-catatan-${barisId}`}
              value={catatan}
              onChange={(event) => {
                setCatatan(event.target.value);
                setGalat(null);
              }}
              placeholder="Tulis yang perlu diperbaiki…"
              disabled={sibuk}
              rows={4}
            />
          </div>
          {galat && (
            <p role="alert" className="text-sm text-danger">
              {galat}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setBuka(false)}
              disabled={sibuk}
              className="rounded-full"
            >
              Batal
            </Button>
            <Button onClick={() => void simpan()} disabled={sibuk} className="rounded-full">
              {sibuk ? "Menyimpan…" : "Simpan revisi"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
