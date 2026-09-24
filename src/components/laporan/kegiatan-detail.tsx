"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { KeteranganImage } from "@/components/laporan/keterangan-image";
import { ReviewBadge } from "@/components/laporan/review-badge";
import {
  KegiatanFormDialog,
  type KegiatanFormInput,
} from "@/components/laporan/kegiatan-form-dialog";
import { useKegiatanMutations } from "@/components/laporan/use-kegiatan-mutations";
import { formatTanggalPanjang, type KegiatanItem } from "@/components/laporan/types";

export function KegiatanDetail({
  userId,
  item,
  backHref,
}: {
  userId: string;
  item: KegiatanItem;
  backHref: string;
}) {
  const router = useRouter();
  const { saving, deleting, error, setError, saveEdit, remove } =
    useKegiatanMutations(userId);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleSubmit(input: KegiatanFormInput) {
    const ok = await saveEdit(item, input);
    if (ok) setEditing(false);
  }

  async function handleDelete() {
    const ok = await remove(item);
    if (ok) router.push(backHref);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={backHref}
        className="transition-soft inline-flex min-h-[44px] items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Kembali
      </Link>

      <p className="mt-4 text-sm text-muted-foreground">{formatTanggalPanjang(item.tanggal)}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{item.nama}</h1>
        <ReviewBadge status={item.review?.status ?? null} />
      </div>

      {item.review?.status === "revision" && item.review.catatan && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">Catatan perbaikan</p>
          <p className="mt-1 text-sm text-amber-800">{item.review.catatan}</p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {item.keterangan.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada keterangan.</p>
        )}
        {item.keterangan.map((row, index) =>
          row.tipe === "text" ? (
            <p key={row.id} className="text-sm whitespace-pre-wrap">
              {row.isi_text}
            </p>
          ) : row.image_url ? (
            <figure key={row.id}>
              <KeteranganImage
                path={row.image_url}
                alt={`Gambar ${index + 1} kegiatan ${item.nama}`}
                className="w-full rounded-lg border border-border object-cover"
              />
              {row.isi_text && (
                <figcaption className="mt-1 text-sm text-muted-foreground">
                  {row.isi_text}
                </figcaption>
              )}
            </figure>
          ) : null
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
        >
          <Pencil aria-hidden="true" />
          Ubah
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          Hapus
        </Button>
      </div>

      {editing && (
        <KegiatanFormDialog
          open
          title="Ubah kegiatan"
          initial={{
            nama: item.nama,
            tanggal: item.tanggal,
            blocks: item.keterangan.map((row) => ({
              key: row.id,
              tipe: row.tipe,
              text: row.isi_text ?? "",
              file: null,
              previewUrl: null,
              storedPath: row.tipe === "image" ? row.image_url : null,
            })),
          }}
          dateLabel={formatTanggalPanjang(item.tanggal)}
          allowDateChange
          saving={saving}
          serverError={error}
          onClose={() => setEditing(false)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={confirming}
        title="Hapus kegiatan"
        message={`Hapus kegiatan '${item.nama}' beserta seluruh keterangannya?`}
        busy={deleting}
        onCancel={() => setConfirming(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
