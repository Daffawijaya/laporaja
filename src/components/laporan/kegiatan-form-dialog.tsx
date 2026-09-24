"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { BlocksEditor, type DraftBlock } from "@/components/laporan/blocks-editor";

export interface KegiatanFormInput {
  nama: string;
  tanggal: string;
  blocks: DraftBlock[];
}

export interface KegiatanFormInitial {
  nama: string;
  tanggal: string;
  blocks: DraftBlock[];
}

const TANGGAL_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function KegiatanFormDialog({
  open,
  title,
  initial,
  dateLabel,
  allowDateChange,
  saving,
  serverError,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: KegiatanFormInitial;
  dateLabel: string;
  allowDateChange: boolean;
  saving: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (input: KegiatanFormInput) => void;
}) {
  const [nama, setNama] = useState(initial.nama);
  const [tanggal, setTanggal] = useState(initial.tanggal);
  const [blocks, setBlocks] = useState<DraftBlock[]>(initial.blocks);
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (nama.trim().length < 2 || nama.trim().length > 200) {
      setFormError("Nama kegiatan harus 2-200 karakter.");
      return;
    }
    if (!TANGGAL_PATTERN.test(tanggal)) {
      setFormError("Tanggal tidak valid.");
      return;
    }
    setFormError(null);
    onSubmit({ nama: nama.trim(), tanggal, blocks });
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{dateLabel}</p>

        {allowDateChange && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="kegiatan-tanggal">Tanggal</Label>
            <Input
              id="kegiatan-tanggal"
              type="date"
              value={tanggal}
              onChange={(event) => setTanggal(event.target.value)}
              disabled={saving}
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="kegiatan-nama">Nama kegiatan</Label>
          <Input
            id="kegiatan-nama"
            value={nama}
            onChange={(event) => setNama(event.target.value)}
            placeholder="Contoh: Pendataan UMKM"
            disabled={saving}
          />
        </div>

        <BlocksEditor blocks={blocks} onChange={setBlocks} disabled={saving} />

        {(formError || serverError) && (
          <p role="alert" className="text-sm text-red-700">
            {formError ?? serverError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
