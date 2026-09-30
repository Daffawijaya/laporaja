"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { RefListCard } from "@/components/ui/ref-list-card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import type { MonthlyReviewState } from "@/lib/laporan/queries";

// Tertulis oleh user di halaman laporannya, dinilai superadmin di sini.
// Baris monthly_reviews dibentuk lazy (upsert) saat salah satu pihak bertindak.
async function saveMonthly(
  userId: string,
  tahun: number,
  bulan: number,
  patch: { status: "revision" | "approved" | "menunggu"; catatan: string | null }
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("monthly_reviews")
    .upsert(
      { user_id: userId, tahun, bulan, status: patch.status, catatan: patch.catatan },
      { onConflict: "user_id,tahun,bulan" }
    );
  if (error) throw error;
}

// Seksi "1. REKOMENDASI DAN TINDAK LANJUT" + tombol Setujui di bawahnya.
// Setujui terkunci selama masih ada ≥1 revisi (kegiatan maupun rekomendasi)
// atau ada laporan tambahan wajib yang belum diisi user.
export function AdminMonthlyReview({
  userId,
  userNama,
  tahun,
  bulan,
  labelBulan,
  initial,
  revisiKegiatan,
  tugasBelum,
}: {
  userId: string;
  userNama: string;
  tahun: number;
  bulan: number;
  labelBulan: string;
  initial: MonthlyReviewState;
  revisiKegiatan: number;
  tugasBelum: string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const revisiBulanan = initial.status === "revision";
  const disetujui = initial.status === "approved";
  const totalRevisi = revisiKegiatan + (revisiBulanan ? 1 : 0);
  const tugasWajib = !disetujui && tugasBelum.length > 0;
  const terkunci = totalRevisi > 0 || tugasWajib;

  const [reviseOpen, setReviseOpen] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [approving, setApproving] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  function handleFailure(err: unknown, fallback: string, setLocal: (value: string) => void) {
    if (err instanceof SessionExpiredError || isSessionError(err)) {
      setLocal("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return;
    }
    setLocal(fallback);
  }

  async function handleRevise(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const cleaned = catatan.trim();
    if (cleaned.length === 0) {
      setFormError("Catatan revisi wajib diisi.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveMonthly(userId, tahun, bulan, { status: "revision", catatan: cleaned });
      toast.success("Revisi rekomendasi dikirim.");
      setReviseOpen(false);
      router.refresh();
    } catch (err) {
      handleFailure(err, "Gagal mengirim revisi. Coba lagi.", setFormError);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelRevision() {
    if (cancelling) return;
    setCancelling(true);
    setPageError(null);
    try {
      await saveMonthly(userId, tahun, bulan, { status: "menunggu", catatan: null });
      toast.success("Revisi rekomendasi dibatalkan.");
      router.refresh();
    } catch (err) {
      handleFailure(err, "Gagal membatalkan revisi. Coba lagi.", setPageError);
    } finally {
      setCancelling(false);
    }
  }

  async function handleApprove() {
    if (approving || terkunci || disetujui) return;
    if (tugasBelum.length > 0) {
      setPageError(
        `Masih ada laporan tambahan yang wajib diisi: ${tugasBelum.join(", ")}.`
      );
      setConfirmApprove(false);
      return;
    }
    setApproving(true);
    setPageError(null);
    try {
      await saveMonthly(userId, tahun, bulan, { status: "approved", catatan: null });
      toast.success("Laporan disetujui.");
      setConfirmApprove(false);
      router.refresh();
    } catch (err) {
      handleFailure(err, "Gagal menyetujui laporan. Coba lagi.", setPageError);
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="mt-4">
      {pageError && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {pageError}
        </p>
      )}

      <RefListCard
        ariaLabel={`Rekomendasi dan Tindak Lanjut ${userNama} ${labelBulan}`}
        title="Rekomendasi dan Tindak Lanjut"
      >
        {initial.rekomendasi ? (
          <p className="max-w-prose px-1 text-sm leading-relaxed whitespace-pre-wrap">
            {initial.rekomendasi}
          </p>
        ) : (
          <EmptyState
            title="Belum ada rekomendasi"
            description="User belum menulis rekomendasi dan tindak lanjut bulan ini."
          />
        )}

        {revisiBulanan && initial.catatan && (
          <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            {initial.catatan}
          </p>
        )}

        <div className="mt-2 flex items-center justify-end gap-1">
          {revisiBulanan ? (
            <Button
              variant="ghost"
              onClick={() => {
                setPageError(null);
                handleCancelRevision();
              }}
              disabled={cancelling}
              aria-label="Batalkan revisi rekomendasi"
              className="min-h-[36px] rounded-full bg-black/[0.075] px-3 text-xs text-accent hover:bg-black/15 hover:text-accent-hover dark:bg-white/10 dark:hover:bg-white/15"
            >
              {cancelling ? "Membatalkan..." : "Batalkan revisi"}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => {
                setFormError(null);
                setCatatan("");
                setReviseOpen(true);
              }}
              aria-label="Revisi rekomendasi"
              className="min-h-[36px] rounded-full bg-black/[0.075] px-3 text-xs text-accent hover:bg-black/15 hover:text-accent-hover dark:bg-white/10 dark:hover:bg-white/15"
            >
              Revisi
            </Button>
          )}
        </div>
      </RefListCard>

      <div className="mt-4 flex flex-col items-end">
        <Button
          variant="default"
          onClick={() => {
            setPageError(null);
            setConfirmApprove(true);
          }}
          disabled={terkunci || disetujui || approving}
          aria-label={`Setujui laporan ${userNama} ${labelBulan}`}
          className="w-full rounded-full sm:w-auto"
        >
          <Check aria-hidden="true" />
          {disetujui ? "Sudah disetujui" : approving ? "Menyetujui..." : "Setujui laporan"}
        </Button>
        {terkunci && !disetujui && totalRevisi > 0 && (
          <p className="mt-2 text-right text-xs text-neutral-500">
            Selesaikan {totalRevisi} revisi dulu sebelum menyetujui
            {revisiKegiatan > 0 && revisiBulanan
              ? ` (${revisiKegiatan} kegiatan + rekomendasi).`
              : revisiBulanan
                ? " (rekomendasi). "
                : " (kegiatan)."}
          </p>
        )}
        {terkunci && !disetujui && tugasWajib && (
          <p className="mt-2 text-right text-xs text-neutral-500">
            Masih ada laporan tambahan yang wajib diisi: {tugasBelum.join(", ")}.
          </p>
        )}
      </div>

      <Dialog
        open={reviseOpen}
        onClose={() => {
          if (!saving) {
            setReviseOpen(false);
            setFormError(null);
          }
        }}
        title="Revisi rekomendasi"
      >
        <form onSubmit={handleRevise} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="catatan-revisi-rekomendasi">Catatan revisi (wajib)</Label>
            <Textarea
              id="catatan-revisi-rekomendasi"
              value={catatan}
              onChange={(event) => {
                setCatatan(event.target.value);
                setFormError(null);
              }}
              rows={3}
              placeholder="Contoh: Tambahkan hasil yang dicapai tiap kegiatan."
              disabled={saving}
              autoFocus
            />
          </div>

          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReviseOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Mengirim..." : "Kirim revisi"}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmApprove}
        title={`Setujui laporan ${userNama} ${labelBulan}?`}
        message="Jika disetujui, laporan dianggap selesai dan tidak menunggu review lagi."
        confirmLabel="Setujui"
        busy={approving}
        onCancel={() => setConfirmApprove(false)}
        onConfirm={handleApprove}
      />
    </div>
  );
}
