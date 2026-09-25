"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { KeteranganImage } from "@/components/laporan/keterangan-image";
import { ReviewBadge } from "@/components/laporan/review-badge";
import {
  KegiatanFormDialog,
  type KegiatanFormInput,
} from "@/components/laporan/kegiatan-form-dialog";
import { useKegiatanMutations } from "@/components/laporan/use-kegiatan-mutations";
import { formatTanggalPanjang, type KegiatanItem } from "@/components/laporan/types";
import type { IndikatorOption } from "@/lib/indikator/queries";

export function KegiatanDetail({
  userId,
  item,
  backHref,
  indikators,
}: {
  userId: string;
  item: KegiatanItem;
  backHref: string;
  indikators: IndikatorOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { saving, deleting, error, setError, progress, saveEdit, remove } =
    useKegiatanMutations(userId);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleSubmit(input: KegiatanFormInput) {
    const ok = await saveEdit(item, input);
    if (ok) {
      toast.success("Perubahan disimpan.");
      setEditing(false);
    }
  }

  async function handleDelete() {
    const ok = await remove(item);
    if (ok) {
      toast.success("Kegiatan dihapus.");
      router.push(backHref);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={backHref}
        className="transition-soft inline-flex min-h-[44px] items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Kembali
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {formatTanggalPanjang(item.tanggal)}
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{item.nama}</h1>
        </div>
        <ReviewBadge status={item.review?.status ?? null} />
      </div>

      {item.indikatorIds.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {item.indikatorIds
            .map((id) => indikators.find((indikator) => indikator.id === id)?.nama ?? "")
            .filter((nama) => nama.length > 0)
            .join(", ")}
        </p>
      )}

      {item.review?.status === "revision" && item.review.catatan && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">Catatan perbaikan</p>
          <p className="mt-1 text-sm text-amber-800">{item.review.catatan}</p>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-5">
        {item.keterangan.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada keterangan.</p>
        )}
        {item.keterangan.map((row, index) =>
          row.tipe === "text" ? (
            <p key={row.id} className="text-sm leading-relaxed whitespace-pre-wrap">
              {row.isi_text}
            </p>
          ) : row.image_url ? (
            <figure key={row.id}>
              <KeteranganImage
                path={row.image_url}
                alt={`Gambar ${index + 1} kegiatan ${item.nama}`}
                fallback="full"
                className="w-full rounded-lg border border-border object-cover"
              />
              {row.isi_text && (
                <figcaption className="mt-1.5 text-sm text-muted-foreground">
                  {row.isi_text}
                </figcaption>
              )}
            </figure>
          ) : null
        )}
      </div>

      {error && !editing && (
        <p role="alert" className="mt-5 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 flex gap-2">
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
          variant="ghost"
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
            indikatorIds: item.indikatorIds,
          }}
          indikators={indikators}
          saving={saving}
          progress={progress}
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
