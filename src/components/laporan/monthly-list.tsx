"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { RefListCard } from "@/components/ui/ref-list-card";
import { Textarea } from "@/components/ui/textarea";
import { ContentGrid } from "@/components/layout/content-grid";
import { useModalKey } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { MonthPicker } from "@/components/laporan/month-picker";
import { KeteranganImage } from "@/components/laporan/keterangan-image";
import { ReviewBadge } from "@/components/laporan/review-badge";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import { deriveMonthStatus, type MonthlyReviewState } from "@/lib/laporan/queries";
import {
  KegiatanFormDialog,
  type KegiatanFormInitial,
  type KegiatanFormInput,
} from "@/components/laporan/kegiatan-form-dialog";
import { useKegiatanMutations } from "@/components/laporan/use-kegiatan-mutations";
import {
  NAMA_BULAN,
  formatHariTanggal,
  tanggalISO,
  type KegiatanItem,
} from "@/components/laporan/types";
import type { IndikatorProgress } from "@/lib/indikator/queries";

// Kapital depan tiap kalimat rekomendasi: huruf pertama tiap kalimat
// (awal teks atau sesudah . ! ?) jadi kapital, sisanya dibiarkan.
function kapitalisasiKalimat(teks: string): string {
  return teks.replace(/(^|[.!?]\s+)([a-zA-Z])/g, (_, pembuka: string, huruf: string) => pembuka + huruf.toUpperCase());
}

function initialBlocks(item: KegiatanItem) {
  return item.keterangan.map((row) => ({
    key: row.id,
    tipe: row.tipe,
    text: row.isi_text ?? "",
    file: null,
    previewUrl: null,
    storedPath: row.tipe === "image" ? row.image_url : null,
  }));
}

// Monthly Activity List: pusat pengalaman aplikasi. Daftar dikelompokkan per
// tanggal yang benar-benar ada isinya, tanpa kalender dan tanpa hari kosong.
export function MonthlyList({
  userId,
  nama,
  tahun,
  bulan,
  items,
  indikators,
  initialReview,
}: {
  userId: string;
  nama: string;
  tahun: number;
  bulan: number;
  items: KegiatanItem[];
  indikators: IndikatorProgress[];
  initialReview: MonthlyReviewState;
}) {
  const toast = useToast();
  const router = useRouter();
  const { saving, deleting, error, setError, progress, saveAdd, saveEdit, remove } =
    useKegiatanMutations(userId);
  const [dialog, setDialog] = useState<
    { mode: "add"; tanggal: string } | { mode: "edit"; item: KegiatanItem } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<KegiatanItem | null>(null);

  // Filter dari search global titlebar (?q=).
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const visibleItems = query
    ? items.filter((item) => item.nama.toLowerCase().includes(query))
    : items;
  const visibleIndikators = query
    ? indikators.filter((indikator) => indikator.nama.toLowerCase().includes(query))
    : indikators;

  // Modal selalu ke-mount agar exit animation jalan. Key diganti tiap
  // dibuka (form segar), dibiarkan saat ditutup (animasi tutup terbaca).
  const [dialogKey, reopenModal] = useModalKey();

  const todayISO = (() => {
    const now = new Date();
    return tanggalISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
  })();
  const isCurrentMonth =
    bulan === new Date().getMonth() + 1 && tahun === new Date().getFullYear();
  const defaultDate = isCurrentMonth ? todayISO : tanggalISO(tahun, bulan, 1);

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

  // Status bulanan turunan (boolean menunggu per laporan orang).
  const revisiCount = visibleItems.filter((item) => item.review?.status === "revision").length;
  const monthStatus = deriveMonthStatus(initialReview, revisiCount);

  // Rekomendasi ditulis user di sini, dinilai admin per bulan.
  const [rekomendasi, setRekomendasi] = useState(initialReview.rekomendasi ?? "");
  const [recSaving, setRecSaving] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  async function handleSaveRekomendasi() {
    if (recSaving) return;
    setRecSaving(true);
    setRecError(null);
    try {
      const supabase = createClient();
      const cleaned = kapitalisasiKalimat(rekomendasi.trim());
      const { error } = await supabase
        .from("monthly_reviews")
        .upsert(
          {
            user_id: userId,
            tahun,
            bulan,
            rekomendasi: cleaned.length > 0 ? cleaned : null,
          },
          { onConflict: "user_id,tahun,bulan" }
        );
      if (error) throw error;
      toast.success("Rekomendasi disimpan.");
      router.refresh();
    } catch (err) {
      if (err instanceof SessionExpiredError || isSessionError(err)) {
        setRecError("Sesi Anda berakhir. Silakan masuk lagi.");
        router.replace("/login?expired=1");
        return;
      }
      setRecError("Gagal menyimpan rekomendasi. Coba lagi.");
    } finally {
      setRecSaving(false);
    }
  }

  const namaIndikator = new Map(indikators.map((indikator) => [indikator.id, indikator.nama]));

  function openAdd() {
    setError(null);
    reopenModal(`add-${defaultDate}`);
    setDialog({ mode: "add", tanggal: defaultDate });
  }

  function openEdit(item: KegiatanItem) {
    setError(null);
    reopenModal(`edit-${item.id}`);
    setDialog({ mode: "edit", item });
  }

  async function handleSubmit(input: KegiatanFormInput) {
    if (!dialog) return;
    const ok =
      dialog.mode === "add" ? await saveAdd(input) : await saveEdit(dialog.item, input);
    if (ok) {
      toast.success(dialog.mode === "add" ? "Kegiatan ditambahkan." : "Perubahan disimpan.");
      setDialog(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const ok = await remove(deleteTarget);
    if (ok) {
      toast.success("Kegiatan dihapus.");
      setDeleteTarget(null);
    }
  }

  const dialogInitial: KegiatanFormInitial = dialog
    ? dialog.mode === "add"
      ? { nama: "", tanggal: dialog.tanggal, blocks: [], indikatorIds: [] }
      : {
          nama: dialog.item.nama,
          tanggal: dialog.item.tanggal,
          blocks: initialBlocks(dialog.item),
          indikatorIds: dialog.item.indikatorIds,
        }
    : { nama: "", tanggal: defaultDate, blocks: [], indikatorIds: [] };

  return (
    <div className="w-full">
      <Link
        href="/laporan"
        className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm text-muted-foreground transition-soft hover:text-accent"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Arsip laporan
      </Link>
      <ContentGrid
        gapClassName="lg:gap-3"
        aside={
          <>
            <RefListCard ariaLabel="Bulan" title="Bulan">
              <div className="rounded-2xl bg-neutral-50 p-3 dark:bg-white/5">
                <MonthPicker bulan={bulan} tahun={tahun} />
              </div>
            </RefListCard>

            {visibleItems.length > 0 && (
              <RefListCard ariaLabel="Ringkasan bulan ini" title="Bulan ini">
                <ul className="divide-y divide-neutral-200/70 text-sm dark:divide-white/10">
                  <li className="flex items-center justify-between gap-3 px-1 pb-3">
                    <span className="text-sm font-medium">Kegiatan</span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {visibleItems.length}
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-3 px-1 pt-3">
                    <span className="text-sm font-medium">Status laporan</span>
                    <ReviewBadge status={monthStatus === "menunggu" ? null : monthStatus} />
                  </li>
                </ul>
              </RefListCard>
            )}

            {visibleIndikators.length > 0 && (
              <RefListCard
                ariaLabel="Indikator kinerja"
                title="Indikator kinerja"
                id="indikator"
                className="scroll-mt-20"
              >
                <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
                  {visibleIndikators.map((indikator, idx) => {
                    const persen =
                      indikator.target == null
                        ? 0
                        : Math.min(100, Math.round((indikator.bulanIni / indikator.target) * 100));
                    const pad =
                      idx === 0
                        ? "px-1 pb-3"
                        : idx === visibleIndikators.length - 1
                          ? "px-1 pt-3"
                          : "px-1 py-3";
                    return (
                      <li key={indikator.id} className={pad}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-medium">
                            {indikator.nama}
                          </p>
                          <p className="shrink-0 text-sm text-neutral-500">
                            {indikator.target == null
                              ? `${indikator.bulanIni}`
                              : `${indikator.bulanIni} dari ${indikator.target}`}
                          </p>
                        </div>
                        {indikator.target != null && (
                          <div
                            role="progressbar"
                            aria-valuenow={indikator.bulanIni}
                            aria-valuemin={0}
                            aria-valuemax={indikator.target}
                            aria-label={`Capaian ${indikator.nama}`}
                            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                          >
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${persen}%` }}
                            />
                          </div>
                        )}
                        <p className="mt-1.5 text-xs text-neutral-500">
                          {indikator.target == null
                            ? "Target belum diatur"
                            : `Target ${indikator.target} per bulan`}
                          {" · "}
                          total {indikator.total}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </RefListCard>
            )}
          </>
        }
      >
        <p className="text-sm text-neutral-500 md:hidden">Selamat datang, {nama}</p>

        <RefListCard
          ariaLabel="Daftar kegiatan"
          title={`${NAMA_BULAN[bulan - 1]} ${tahun}`}
          className="mt-2 md:mt-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
            <Button onClick={openAdd} className="w-full sm:w-auto md:ml-auto">
              <Plus aria-hidden="true" />
              Tambah Kegiatan
            </Button>
          </div>

          {visibleItems.length === 0 ? (
            <EmptyState
              className="mt-2"
              title={query ? "Tidak ada hasil" : "Belum ada kegiatan"}
              description={
                query
                  ? `Tidak ada yang cocok dengan "${query}".`
                  : "Tambahkan kegiatan pertama untuk bulan ini."
              }
              action={
                query ? undefined : (
                  <Button onClick={openAdd}>
                    <Plus aria-hidden="true" />
                    Tambah Kegiatan
                  </Button>
                )
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
                  {tanggal === todayISO && (
                    <span className="text-xs text-accent">Hari ini</span>
                  )}
                </div>

                <ul className="mt-2 divide-y divide-neutral-200/70 dark:divide-white/10">
                  {daftar.map((item) => {
                    const textRow = item.keterangan.find(
                      (row) => row.tipe === "text" && row.isi_text
                    );
                    const imageRows = item.keterangan
                      .filter((row) => row.tipe === "image" && row.image_url)
                      .slice(0, 3);
                    return (
                      <li key={item.id} className="px-1 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <Link
                            href={`/laporan/${item.id}`}
                            className="min-w-0 flex-1 text-sm font-medium transition-soft hover:text-accent"
                          >
                            {item.nama}
                          </Link>
                          <span className="flex shrink-0 items-center gap-1">
                            <ReviewBadge status={item.review?.status ?? null} />
                            <Link
                              href={`/laporan/${item.id}`}
                              aria-label={`Lihat ${item.nama}`}
                              className="flex items-center justify-center"
                            >
                              <ChevronRight
                                aria-hidden="true"
                                className="size-5 text-neutral-400"
                              />
                            </Link>
                          </span>
                        </div>

                        {textRow && (
                          <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                            {textRow.isi_text}
                          </p>
                        )}

                        {imageRows.length > 0 && (
                          <div className="mt-2 flex gap-2">
                            {imageRows.map((row) => (
                              <KeteranganImage
                                key={row.id}
                                path={row.image_url as string}
                                alt={`Gambar kegiatan ${item.nama}`}
                                className="size-14 rounded-md border border-border object-cover"
                              />
                            ))}
                          </div>
                        )}

                        {item.review?.status === "revision" && item.review.catatan && (
                          <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                            {item.review.catatan}
                          </p>
                        )}

                        {item.indikatorIds.length > 0 && (
                          <p className="mt-2 text-xs text-neutral-500">
                            {item.indikatorIds
                              .map((id) => namaIndikator.get(id) ?? "")
                              .filter((nama) => nama.length > 0)
                              .join(", ")}
                          </p>
                        )}

                        <div className="mt-2 flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            onClick={() => openEdit(item)}
                            aria-label={`Ubah ${item.nama}`}
                          >
                            <Pencil aria-hidden="true" />
                            <span className="hidden sm:inline">Ubah</span>
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setError(null);
                              setDeleteTarget(item);
                            }}
                            aria-label={`Hapus ${item.nama}`}
                          >
                            <Trash2 aria-hidden="true" />
                            <span className="hidden sm:inline">Hapus</span>
                          </Button>
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
        </RefListCard>

        <RefListCard
          ariaLabel="Rekomendasi dan Tindak Lanjut"
          title="Rekomendasi dan Tindak Lanjut"
          className="mt-4"
        >
          <div className="flex items-center justify-between gap-3 px-1 pb-3">
            <span className="text-xs text-neutral-500">
              Dinilai admin bersama laporan bulan ini
            </span>
            <ReviewBadge status={monthStatus === "menunggu" ? null : monthStatus} />
          </div>

          {initialReview.status === "revision" && initialReview.catatan && (
            <p className="mx-1 mb-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              {initialReview.catatan}
            </p>
          )}

          <div className="flex flex-col gap-2 px-1">
            <Label htmlFor="rekomendasi">Tulis rekomendasi dan tindak lanjut</Label>
            <Textarea
              id="rekomendasi"
              value={rekomendasi}
              onChange={(event) => {
                setRekomendasi(event.target.value);
                setRecError(null);
              }}
              rows={4}
              placeholder="Contoh: Perlu percepatan input data harian agar rekap mingguan tepat waktu."
              disabled={recSaving}
            />
          </div>

          {recError && (
            <p role="alert" className="mt-2 px-1 text-sm text-danger">
              {recError}
            </p>
          )}

          <div className="mt-3 flex justify-end px-1">
            <Button
              onClick={handleSaveRekomendasi}
              disabled={recSaving}
              className="w-full sm:w-auto"
            >
              {recSaving ? "Menyimpan..." : "Simpan rekomendasi"}
            </Button>
          </div>
        </RefListCard>
      </ContentGrid>

      {error && !dialog && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <KegiatanFormDialog
        key={dialogKey}
        open={dialog !== null}
        title={dialog?.mode === "edit" ? "Ubah kegiatan" : "Tambah kegiatan"}
        initial={dialogInitial}
        indikators={indikators}
        saving={saving}
        progress={progress}
        serverError={error}
        onClose={() => setDialog(null)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget ? `Hapus kegiatan "${deleteTarget.nama}"?` : "Hapus kegiatan"
        }
        message={
          deleteTarget
            ? "Jika kegiatan ini dihapus, seluruh keterangannya ikut terhapus."
            : ""
        }
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
