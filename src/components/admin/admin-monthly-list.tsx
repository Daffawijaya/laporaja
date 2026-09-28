"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, PencilLine, Undo2 } from "lucide-react";

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
// tiap tanggal berupa akordeon (tanggal kiri, jumlah kegiatan + chevron kanan),
// isi baris dipisah divide-y, aksi pill di kanan bawah, catatan revisi kotak amber.
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

  // Akordeon per tanggal: tampil ringkas dulu (tanggal + jumlah kegiatan),
  // detail dibuka lewat chevron. Saat search aktif (?q=) semua otomatis
  // terbuka supaya hasil filter langsung kelihatan.
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());

  function toggleDay(tanggal: string) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(tanggal)) next.delete(tanggal);
      else next.add(tanggal);
      return next;
    });
  }

  const isDayOpen = (tanggal: string) => (query ? true : openDays.has(tanggal));
  // Hormati preferensi gerak (pola yang sama dengan Dialog).
  const reduceMotion = !!useReducedMotion();

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
        <ul className="mt-4 divide-y divide-neutral-200/70 dark:divide-white/10">
          {days.map((tanggal, i) => {
            const daftar = grouped.get(tanggal) ?? [];
            // Ritme padding baris persis RefListCard (Laporan September 2026):
            // pertama tanpa pt, tengah py-3, terakhir tanpa pb.
            const pad = i === 0 ? " pb-3" : i === days.length - 1 ? " pt-3" : " py-3";
            return (
              <li key={tanggal} className={`px-1${pad}`}>
                {/* Baris tanggal persis gaya baris RefListCard
                    (Laporan September 2026): judul medium + sub kecil di kiri,
                    chevron di kanan. */}
                <button
                  type="button"
                  onClick={() => toggleDay(tanggal)}
                  aria-expanded={isDayOpen(tanggal)}
                  aria-label={`${formatHariTanggal(tanggal)}, ${daftar.length} kegiatan`}
                  className="transition-soft flex w-full items-center justify-between gap-3 text-left hover:text-black dark:hover:text-white"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {formatHariTanggal(tanggal)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-500">
                      {daftar.length} kegiatan
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {tanggal === todayISO && (
                      <span className="text-xs text-accent">Hari ini</span>
                    )}
                    <motion.span
                      aria-hidden="true"
                      className="flex shrink-0 text-neutral-400"
                      animate={{ rotate: isDayOpen(tanggal) ? 180 : 0 }}
                      transition={
                        reduceMotion
                          ? { duration: 0.15 }
                          : { type: "spring", stiffness: 500, damping: 32 }
                      }
                    >
                      <ChevronDown className="size-5" />
                    </motion.span>
                  </span>
                </button>

                {/* Slide buka/tutup pakai spring ala liquid glass Apple
                    (pola yang sama dengan Dialog): height 0↔auto + fade,
                    critically-damped supaya mulus tanpa overshoot. */}
                <AnimatePresence initial={false}>
                  {isDayOpen(tanggal) && (
                    <motion.div
                      key={`day-${tanggal}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={
                        reduceMotion
                          ? { duration: 0.15 }
                          : {
                              type: "spring",
                              stiffness: 360,
                              damping: 37,
                              mass: 0.9,
                              opacity: { duration: 0.22 },
                            }
                      }
                      className="overflow-hidden"
                    >
                      {/* Grid kegiatan max 3 kolom, selalu rata tengah:
                          1 data = 1 kartu center, 2 data = 2 kartu center. */}
                      <div className="mt-2 flex flex-wrap justify-center gap-3">
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
                      <article
                        key={item.id}
                        className="ref-inner flex w-full max-w-md min-w-0 flex-col p-4 sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)]"
                      >
                        <p className="text-sm font-medium">{item.nama}</p>

                        {imageRows.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2">
                            {imageRows.map((row, index) => (
                              <KeteranganImage
                                key={row.id}
                                path={row.image_url as string}
                                alt={`Gambar ${index + 1} kegiatan ${item.nama}`}
                                className="h-40 w-full rounded-lg border border-border object-cover"
                              />
                            ))}
                          </div>
                        )}

                        {textRows.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {textRows.map((row) => (
                              <p key={row.id} className="text-sm text-neutral-500">
                                {row.isi_text}
                              </p>
                            ))}
                          </div>
                        )}

                        {revisi && item.review?.catatan && (
                          <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                            {item.review.catatan}
                          </p>
                        )}

                        <div className="mt-auto flex items-center justify-end gap-1 pt-3">
                          {revisi ? (
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setPageError(null);
                                setCancelTarget(item);
                              }}
                              aria-label={`Batalkan revisi ${item.nama}`}
                              className="rounded-full bg-black/10 text-black hover:bg-black/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                            >
                              <Undo2 aria-hidden="true" />
                              <span className="hidden sm:inline">Batalkan revisi</span>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              onClick={() => openRevise(item)}
                              aria-label={`Revisi ${item.nama}`}
                              className="rounded-full bg-black/10 text-black hover:bg-black/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                            >
                              <PencilLine aria-hidden="true" />
                              <span className="hidden sm:inline">Revisi</span>
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                      })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
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
