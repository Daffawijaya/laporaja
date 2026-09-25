"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { BlocksEditor, type DraftBlock } from "@/components/laporan/blocks-editor";
import {
  formatPeriode,
  type IndikatorOption,
} from "@/lib/indikator/queries";

export interface KegiatanFormInput {
  nama: string;
  tanggal: string;
  blocks: DraftBlock[];
  indikatorIds: string[];
}

export interface KegiatanFormInitial {
  nama: string;
  tanggal: string;
  blocks: DraftBlock[];
  indikatorIds: string[];
}

const TANGGAL_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function KegiatanFormDialog({
  open,
  title,
  initial,
  indikators,
  saving,
  progress,
  serverError,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: KegiatanFormInitial;
  indikators: IndikatorOption[];
  saving: boolean;
  progress: string | null;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (input: KegiatanFormInput) => void;
}) {
  const [nama, setNama] = useState(initial.nama);
  const [tanggal, setTanggal] = useState(initial.tanggal);
  const [blocks, setBlocks] = useState<DraftBlock[]>(initial.blocks);
  const [selected, setSelected] = useState<string[]>(initial.indikatorIds);
  const [formError, setFormError] = useState<string | null>(null);
  const [invalidKeys, setInvalidKeys] = useState<string[]>([]);

  // Hanya indikator yang periodenya mencakup tanggal kegiatan.
  const [tahunDipilih, bulanDipilih] = tanggal.split("-").map(Number);
  const tersedia = indikators.filter(
    (indikator) =>
      indikator.tahun === tahunDipilih &&
      bulanDipilih >= indikator.bulanMulai &&
      bulanDipilih <= indikator.bulanSelesai
  );

  function toggleIndikator(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function updateBlocks(next: DraftBlock[]) {
    setBlocks(next);
    setInvalidKeys([]);
    setFormError(null);
  }

  function validate(): string | null {
    if (nama.trim().length === 0) return "Nama kegiatan wajib diisi.";
    if (nama.trim().length < 2 || nama.trim().length > 200) {
      return "Nama kegiatan harus 2-200 karakter.";
    }
    if (!TANGGAL_PATTERN.test(tanggal)) return "Tanggal kegiatan wajib diisi.";

    const adaIsi = blocks.some((block) =>
      block.tipe === "text"
        ? block.text.trim().length > 0
        : block.file !== null || block.storedPath !== null
    );
    if (!adaIsi) return "Tambahkan minimal satu keterangan.";

    const teksKosong = blocks.filter(
      (block) => block.tipe === "text" && block.text.trim().length === 0
    );
    if (teksKosong.length > 0) {
      setInvalidKeys(teksKosong.map((block) => block.key));
      return "Keterangan teks tidak boleh kosong.";
    }

    const gambarTanpaBerkas = blocks.filter(
      (block) => block.tipe === "image" && !block.file && !block.storedPath
    );
    if (gambarTanpaBerkas.length > 0) {
      setInvalidKeys(gambarTanpaBerkas.map((block) => block.key));
      return "Gambar belum dipilih. Pilih ulang gambarnya.";
    }

    setInvalidKeys([]);
    return null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const failed = validate();
    if (failed) {
      setFormError(failed);
      return;
    }
    setFormError(null);
    onSubmit({ nama: nama.trim(), tanggal, blocks, indikatorIds: selected });
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="kegiatan-nama">Nama kegiatan</Label>
          <Input
            id="kegiatan-nama"
            value={nama}
            onChange={(event) => {
              setNama(event.target.value);
              setFormError(null);
            }}
            placeholder="Contoh: Pendataan UMKM"
            disabled={saving}
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="kegiatan-tanggal">Tanggal</Label>
          <Input
            id="kegiatan-tanggal"
            type="date"
            value={tanggal}
            onChange={(event) => {
              setTanggal(event.target.value);
              setFormError(null);
            }}
            disabled={saving}
          />
        </div>

        <BlocksEditor
          blocks={blocks}
          onChange={updateBlocks}
          disabled={saving}
          invalidKeys={invalidKeys}
        />

        <fieldset>
          <legend className="text-sm font-medium">Indikator kinerja</legend>
          {tersedia.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Tidak ada indikator untuk tanggal ini.
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Centang bila kegiatan ini memenuhi indikator.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {tersedia.map((indikator) => (
                  <li key={indikator.id}>
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 has-checked:border-accent has-checked:bg-accent/5">
                      <input
                        type="checkbox"
                        checked={selected.includes(indikator.id)}
                        onChange={() => toggleIndikator(indikator.id)}
                        disabled={saving}
                        className="size-4 shrink-0 accent-[#0071e3]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {indikator.nama}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Target {indikator.target} ({formatPeriode(indikator.tahun, indikator.bulanMulai, indikator.bulanSelesai)})
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>

        {(formError || serverError) && (
          <p role="alert" className="text-sm text-danger">
            {formError ?? serverError}
          </p>
        )}

        {progress && (
          <p role="status" className="text-sm text-muted-foreground">
            {progress}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
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
