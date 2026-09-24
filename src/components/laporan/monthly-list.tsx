"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  formatTanggalPanjang,
  pad2,
  tanggalISO,
  type KegiatanItem,
} from "@/components/laporan/types";

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

export function MonthlyList({
  userId,
  tahun,
  bulan,
  items,
}: {
  userId: string;
  tahun: number;
  bulan: number;
  items: KegiatanItem[];
}) {
  const { saving, deleting, error, setError, saveAdd, saveEdit, remove } =
    useKegiatanMutations(userId);
  const [dialog, setDialog] = useState<
    { mode: "add"; tanggal: string } | { mode: "edit"; item: KegiatanItem } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<KegiatanItem | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, KegiatanItem[]>();
    for (const item of items) {
      const list = map.get(item.tanggal) ?? [];
      list.push(item);
      map.set(item.tanggal, list);
    }
    return map;
  }, [items]);

  const dayCount = new Date(tahun, bulan, 0).getDate();
  const todayISO = (() => {
    const now = new Date();
    return tanggalISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
  })();

  function openAdd(tanggal: string) {
    setError(null);
    setDialog({ mode: "add", tanggal });
  }

  function openEdit(item: KegiatanItem) {
    setError(null);
    setDialog({ mode: "edit", item });
  }

  async function handleSubmit(input: KegiatanFormInput) {
    if (!dialog) return;
    const ok =
      dialog.mode === "add" ? await saveAdd(input) : await saveEdit(dialog.item, input);
    if (ok) setDialog(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const ok = await remove(deleteTarget);
    if (ok) setDeleteTarget(null);
  }

  const dialogInitial: KegiatanFormInitial | null = dialog
    ? dialog.mode === "add"
      ? { nama: "", tanggal: dialog.tanggal, blocks: [] }
      : {
          nama: dialog.item.nama,
          tanggal: dialog.item.tanggal,
          blocks: initialBlocks(dialog.item),
        }
    : null;

  const dialogKey = dialog
    ? dialog.mode === "add"
      ? `add-${dialog.tanggal}`
      : `edit-${dialog.item.id}`
    : "closed";

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">
        {NAMA_BULAN[bulan - 1]} {tahun}
      </h1>

      <div className="mt-4 flex flex-col gap-6">
        {Array.from({ length: dayCount }, (_, i) => {
          const hari = i + 1;
          const tanggal = tanggalISO(tahun, bulan, hari);
          const daftar = grouped.get(tanggal) ?? [];
          return (
            <section key={tanggal} aria-label={formatTanggalPanjang(tanggal)}>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">
                  {pad2(hari)} {NAMA_BULAN[bulan - 1]}
                </h2>
                {tanggal === todayISO && (
                  <span className="rounded-md border border-border bg-white px-2 py-0.5 text-xs text-muted-foreground">
                    Hari ini
                  </span>
                )}
              </div>

              {daftar.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-2">
                  {daftar.map((item) => (
                    <li
                      key={item.id}
                      className="shadow-subtle rounded-lg border border-border bg-white px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/laporan/${item.id}`}
                          className="min-w-0 flex-1 text-sm font-medium hover:text-accent"
                        >
                          {item.nama}
                        </Link>
                        <ReviewBadge status={item.review?.status ?? null} />
                      </div>

                      {item.review?.status === "revision" && item.review.catatan && (
                        <p className="mt-1 text-xs text-amber-800">
                          Alasan: {item.review.catatan}
                        </p>
                      )}

                      {item.keterangan.length > 0 && (
                        <div className="mt-2 flex flex-col gap-2">
                          {item.keterangan.slice(0, 3).map((row) =>
                            row.tipe === "text" ? (
                              <p
                                key={row.id}
                                className="line-clamp-2 text-sm text-muted-foreground"
                              >
                                {row.isi_text}
                              </p>
                            ) : row.image_url ? (
                              <KeteranganImage
                                key={row.id}
                                path={row.image_url}
                                alt={`Gambar kegiatan ${item.nama}`}
                                className="h-16 w-16 rounded-md border border-border object-cover"
                              />
                            ) : null
                          )}
                          {item.keterangan.length > 3 && (
                            <Link
                              href={`/laporan/${item.id}`}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Lihat {item.keterangan.length - 3} keterangan lain
                            </Link>
                          )}
                        </div>
                      )}

                      <div className="mt-2 flex gap-1">
                        <Button variant="ghost" onClick={() => openEdit(item)} aria-label={`Ubah ${item.nama}`}>
                          <Pencil aria-hidden="true" />
                          Ubah
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
                          Hapus
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Belum ada kegiatan.</p>
              )}

              <Button
                variant="secondary"
                onClick={() => openAdd(tanggal)}
                className="mt-2 w-full sm:w-auto"
              >
                <Plus aria-hidden="true" />
                Tambah Kegiatan
              </Button>
            </section>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {dialog && dialogInitial && (
        <KegiatanFormDialog
          key={dialogKey}
          open
          title={dialog.mode === "add" ? "Tambah kegiatan" : "Ubah kegiatan"}
          initial={dialogInitial}
          dateLabel={formatTanggalPanjang(dialogInitial.tanggal)}
          allowDateChange={dialog.mode === "edit"}
          saving={saving}
          serverError={error}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmit}
        />
      )}

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
