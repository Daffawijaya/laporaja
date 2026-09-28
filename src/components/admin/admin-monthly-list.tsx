"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PencilLine, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { KeteranganImage } from "@/components/laporan/keterangan-image";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import type { ReviewStatus } from "@/lib/supabase/database.types";
import {
  formatHariTanggal,
  tanggalISO,
  type KegiatanItem,
} from "@/components/laporan/types";

// Satu review aktif per kegiatan ditulis superadmin dari sini.
// 'revision' wajib punya catatan; 'approved' dipakai untuk membatalkan
// revisi (tanpa catatan) sesuai constraint tabel reviews.
async function saveReview(
  kegiatanId: string,
  status: ReviewStatus,
  catatan: string | null
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reviews")
    .upsert({ kegiatan_id: kegiatanId, status, catatan }, { onConflict: "kegiatan_id" });
  if (error) throw error;
}

// Isi kartu daftar harian superadmin. Sengaja HANYA mengisi bagian dalam
// RefListCard (judul + header kartu ada di halaman) dan memakai bahasa visual
// yang sama dengan /laporan (monthly-list.tsx) serta dashboard admin:
// judul hari di luar baris, isi baris dipisah divide-y, aksi ghost di kanan
// bawah, catatan revisi kotak amber.
export function AdminMonthlyList({ items }: { items: KegiatanItem[] }) {
  const router = useRouter();
  const toast = useToast();
  // Filter dari search global titlebar (?q=).
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  // Modal revisi: satu instance, diisi kegiatan yang sedang dipilih.
  // `reviseTarget` sengaja TIDAK dikosongkan saat tutup agar nama kegiatan
  // tidak hilang di tengah animasi keluar modal.
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseTarget, setReviseTarget] = useState<KegiatanItem | null>(null);
  const [catatan, setCatatan] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<KegiatanItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const visibleItems = query
    ? items.filter((item) => item.nama.toLowerCase().includes(query))
    : items;

  const grouped = useMemo(() => {
    const map = new Map<string, KegiatanItem[]>();
    for (const item of visibleItems) {
      const list = map.get(item.tanggal) ?? [];
      list.push(item);
      map.set(item.tanggal, list);
    }
    return map;
  }, [visibleItems]);

  const days = useMemo(() => [...grouped.keys()].sort(), [grouped]);

  const now = new Date();
  const todayISO = tanggalISO(now.getFullYear(), now.getMonth() + 1, now.getDate());

  function openRevise(item: KegiatanItem) {
    setFormError(null);
    setCatatan("");
    setReviseTarget(item);
    setReviseOpen(true);
  }

  function closeRevise() {
    if (saving) return;
    setReviseOpen(false);
    setFormError(null);
  }

  // Sesi berakhir: arahkan ke login, sisanya tampilkan pesan di tempat.
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
    if (!reviseTarget || saving) return;
    const cleaned = catatan.trim();
    if (cleaned.length === 0) {
      setFormError("Catatan revisi wajib diisi.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveReview(reviseTarget.id, "revision", cleaned);
      toast.success("Revisi dikirim.");
      setReviseOpen(false);
      router.refresh();
    } catch (err) {
      handleFailure(err, "Gagal mengirim revisi. Coba lagi.", setFormError);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelRevision() {
    if (!cancelTarget || cancelling) return;
    setCancelling(true);
    setPageError(null);
    try {
      // "approved" = catatan revisi dibuang dan kegiatan keluar dari hitungan
      // Perlu review, jadi tidak menggantung selamanya di rekap bulanan.
      await saveReview(cancelTarget.id, "approved", null);
      toast.success("Revisi dibatalkan.");
      setCancelTarget(null);
      router.refresh();
    } catch (err) {
      handleFailure(err, "Gagal membatalkan revisi. Coba lagi.", setPageError);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      {pageError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {pageError}
        </p>
      )}

      {visibleItems.length === 0 ? (
        <EmptyState
          className="mt-2"
          title={query ? "Tidak ada hasil" : "Belum ada kegiatan"}
          description={
            query
              ? `Tidak ada yang cocok dengan "${query}".`
              : "User ini belum menambah kegiatan pada bulan ini."
          }
        />
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {days.map((tanggal) => {
            const daftar = grouped.get(tanggal) ?? [];
            return (
              <section key={tanggal} aria-label={formatHariTanggal(tanggal)}>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold">{formatHariTanggal(tanggal)}</h2>
                  {tanggal === todayISO && <span className="text-xs text-accent">Hari ini</span>}
                </div>

                <ul className="mt-2 divide-y divide-neutral-200/70 dark:divide-white/10">
                  {daftar.map((item) => {
                    const revisi = item.review?.status === "revision";
                    // Semua gambar dan teks ditampilkan utuh (tanpa dipotong):
                    // halaman ini tidak lagi punya halaman detail, jadi tidak
                    // ada tempat lain untuk membacanya.
                    const imageRows = item.keterangan.filter(
                      (row) => row.tipe === "image" && row.image_url
                    );
                    const textRows = item.keterangan.filter(
                      (row) => row.tipe === "text" && row.isi_text
                    );
                    return (
                      <li key={item.id} className="px-1 py-3">
                        <p className="text-sm font-medium">{item.nama}</p>

                        {imageRows.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {imageRows.map((row, index) => (
                              <KeteranganImage
                                key={row.id}
                                path={row.image_url as string}
                                alt={`Gambar ${index + 1} kegiatan ${item.nama}`}
                                className="size-14 rounded-md border border-border object-cover"
                              />
                            ))}
                          </div>
                        )}

                        {textRows.map((row) => (
                          <p key={row.id} className="mt-2 text-sm text-neutral-500">
                            {row.isi_text}
                          </p>
                        ))}

                        {revisi && item.review?.catatan && (
                          <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                            {item.review.catatan}
                          </p>
                        )}

                        <div className="mt-2 flex items-center justify-end gap-1">
                          {revisi ? (
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setPageError(null);
                                setCancelTarget(item);
                              }}
                              aria-label={`Batalkan revisi ${item.nama}`}
                            >
                              <Undo2 aria-hidden="true" />
                              <span className="hidden sm:inline">Batalkan revisi</span>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              onClick={() => openRevise(item)}
                              aria-label={`Revisi ${item.nama}`}
                            >
                              <PencilLine aria-hidden="true" />
                              <span className="hidden sm:inline">Revisi</span>
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={reviseOpen} onClose={closeRevise} title="Revisi kegiatan">
        <p className="truncate text-sm font-medium">{reviseTarget?.nama ?? ""}</p>
        <form onSubmit={handleRevise} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="catatan-revisi">Catatan revisi (wajib)</Label>
            <Textarea
              id="catatan-revisi"
              value={catatan}
              onChange={(event) => {
                setCatatan(event.target.value);
                setFormError(null);
              }}
              rows={3}
              placeholder="Contoh: Foto kegiatan kurang jelas."
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
            <Button type="button" variant="secondary" onClick={closeRevise} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Mengirim..." : "Kirim revisi"}
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Batalkan revisi"
        message={
          cancelTarget
            ? `Batalkan revisi "${cancelTarget.nama}"? Catatan revisinya dihapus dan kegiatan dianggap sudah beres.`
            : ""
        }
        confirmLabel="Batalkan revisi"
        busy={cancelling}
        onCancel={() => setCancelTarget(null)}
        onConfirm={handleCancelRevision}
      />
    </>
  );
}
