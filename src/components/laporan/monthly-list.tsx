"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ContentGrid } from "@/components/layout/content-grid";
import { useModalKey } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { MonthPicker } from "@/components/laporan/month-picker";
import { KeteranganImage } from "@/components/laporan/keterangan-image";
import { ReviewBadge } from "@/components/laporan/review-badge";
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
}: {
  userId: string;
  nama: string;
  tahun: number;
  bulan: number;
  items: KegiatanItem[];
  indikators: IndikatorProgress[];
}) {
  const toast = useToast();
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

  let disetujui = 0;
  let revisi = 0;
  for (const item of visibleItems) {
    if (item.review?.status === "approved") disetujui += 1;
    else if (item.review?.status === "revision") revisi += 1;
  }
  const menunggu = visibleItems.length - disetujui - revisi;
  const ringkasan = [
    { key: "approved", label: "Disetujui", value: disetujui, dot: "bg-emerald-500" },
    { key: "revision", label: "Revisi", value: revisi, dot: "bg-amber-500" },
    { key: "pending", label: "Menunggu Review", value: menunggu, dot: "bg-muted-foreground/60" },
  ];

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
      <ContentGrid
        aside={
          <>
            <section aria-label="Bulan">
              <h2 className="text-sm font-semibold">Bulan</h2>
              <div className="panel mt-2 rounded-lg p-4">
                <MonthPicker bulan={bulan} tahun={tahun} />
              </div>
            </section>

            {visibleItems.length > 0 && (
              <section aria-label="Ringkasan bulan ini">
                <h2 className="text-sm font-semibold">Bulan ini</h2>
                <ul className="panel mt-2 divide-y divide-border overflow-hidden rounded-lg text-sm">
                  <li className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-muted-foreground">Kegiatan</span>
                    <span className="font-medium">{visibleItems.length}</span>
                  </li>
                  {ringkasan.map((row) => (
                    <li
                      key={row.key}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${row.dot}`}
                        />
                        {row.label}
                      </span>
                      <span className="font-medium">{row.value}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {visibleIndikators.length > 0 && (
              <section aria-label="Indikator kinerja" id="indikator" className="scroll-mt-20">
                <h2 className="text-sm font-semibold">Indikator kinerja</h2>
                <ul className="panel mt-2 divide-y divide-border overflow-hidden rounded-lg">
                  {visibleIndikators.map((indikator) => {
                    const persen =
                      indikator.target == null
                        ? 0
                        : Math.min(100, Math.round((indikator.bulanIni / indikator.target) * 100));
                    return (
                      <li key={indikator.id} className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-medium">
                            {indikator.nama}
                          </p>
                          <p className="shrink-0 text-sm text-muted-foreground">
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
                        <p className="mt-1.5 text-xs text-muted-foreground">
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
              </section>
            )}
          </>
        }
      >
        <p className="text-sm text-muted-foreground">Selamat datang, {nama}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {NAMA_BULAN[bulan - 1]} {tahun}
          </h1>
          <Button onClick={openAdd} className="w-full sm:w-auto">
            <Plus aria-hidden="true" />
            Tambah Kegiatan
          </Button>
        </div>

        {visibleItems.length === 0 ? (
          <EmptyState
            className="mt-5"
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
          <div className="mt-5 flex flex-col gap-6">
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

                <ul className="panel mt-2 divide-y divide-border overflow-hidden rounded-lg">
                  {daftar.map((item) => {
                    const textRow = item.keterangan.find(
                      (row) => row.tipe === "text" && row.isi_text
                    );
                    const imageRows = item.keterangan
                      .filter((row) => row.tipe === "image" && row.image_url)
                      .slice(0, 3);
                    return (
                      <li key={item.id} className="px-4 py-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <Link
                            href={`/laporan/${item.id}`}
                            className="min-w-0 flex-1 text-sm font-medium transition-soft hover:text-accent"
                          >
                            {item.nama}
                          </Link>
                          <ReviewBadge status={item.review?.status ?? null} />
                        </div>

                        {textRow && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
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
                          <p className="mt-2 text-xs text-muted-foreground">
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
        title="Hapus kegiatan"
        message={
          deleteTarget
            ? `Hapus kegiatan '${deleteTarget.nama}' beserta seluruh keterangannya?`
            : ""
        }
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
