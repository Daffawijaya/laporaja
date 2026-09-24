"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeteranganImage } from "@/components/laporan/keterangan-image";
import { MAX_IMAGE_BYTES } from "@/lib/supabase/storage";

export interface DraftBlock {
  key: string;
  tipe: "text" | "image";
  text: string;
  file: File | null;
  previewUrl: string | null;
  storedPath: string | null;
}

export function newTextBlock(): DraftBlock {
  return {
    key: crypto.randomUUID(),
    tipe: "text",
    text: "",
    file: null,
    previewUrl: null,
    storedPath: null,
  };
}

function makeKey(): string {
  return crypto.randomUUID();
}

// Editor blok keterangan: daftar teks/gambar biasa dengan tombol naik/turun.
// Tanpa rich text, tanpa drag-and-drop.
export function BlocksEditor({
  blocks,
  onChange,
  disabled = false,
}: {
  blocks: DraftBlock[];
  onChange: (next: DraftBlock[]) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickFile(index: number | null) {
    if (disabled) return;
    setTargetIndex(index);
    setError(null);
    fileRef.current?.click();
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Berkas harus berupa gambar.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Ukuran gambar maksimal 5 MB.");
      return;
    }
    const block: DraftBlock = {
      key: makeKey(),
      tipe: "image",
      text: "",
      file,
      previewUrl: URL.createObjectURL(file),
      storedPath: null,
    };
    if (targetIndex === null) {
      onChange([...blocks, block]);
    } else {
      const prev = blocks[targetIndex];
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      onChange(blocks.map((item, i) => (i === targetIndex ? { ...block, key: item.key } : item)));
    }
    setTargetIndex(null);
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= blocks.length) return;
    const copy = [...blocks];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    onChange(copy);
  }

  function remove(index: number) {
    const target = blocks[index];
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onChange(blocks.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Keterangan</Label>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Pilih gambar"
        onChange={handleFile}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...blocks, newTextBlock()])}
          disabled={disabled}
          className="flex-1"
        >
          <Plus aria-hidden="true" />
          Teks
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => pickFile(null)}
          disabled={disabled}
          className="flex-1"
        >
          <Plus aria-hidden="true" />
          Gambar
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {blocks.length === 0 && (
        <p className="text-sm text-muted-foreground">Belum ada keterangan.</p>
      )}

      <ol className="flex flex-col gap-2">
        {blocks.map((block, index) => (
          <li
            key={block.key}
            className="rounded-md border border-border bg-white px-3 py-3"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {block.tipe === "text" ? "Teks" : "Gambar"} {index + 1}
              </span>
              <span className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => move(index, -1)}
                  disabled={disabled || index === 0}
                  aria-label="Pindah ke atas"
                >
                  <ChevronUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => move(index, 1)}
                  disabled={disabled || index === blocks.length - 1}
                  aria-label="Pindah ke bawah"
                >
                  <ChevronDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => remove(index)}
                  disabled={disabled}
                  aria-label="Hapus blok"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </span>
            </div>

            <div className="mt-2">
              {block.tipe === "text" ? (
                <textarea
                  value={block.text}
                  onChange={(event) =>
                    onChange(
                      blocks.map((item, i) =>
                        i === index ? { ...item, text: event.target.value } : item
                      )
                    )
                  }
                  rows={3}
                  placeholder="Tulis keterangan..."
                  disabled={disabled}
                  className="shadow-subtle transition-soft flex w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                />
              ) : block.previewUrl ? (
                // img biasa disengaja: pratinjau blob lokal tidak lewat optimizer next/image.
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={block.previewUrl}
                  alt={`Pratinjau gambar ${index + 1}`}
                  className="max-h-48 w-full rounded-md border border-border object-cover"
                />
              ) : block.storedPath ? (
                <KeteranganImage
                  path={block.storedPath}
                  alt={`Gambar ${index + 1}`}
                  className="max-h-48 w-full rounded-md border border-border object-cover"
                />
              ) : null}
              {block.tipe === "image" && (
                <>
                  <Input
                    value={block.text}
                    onChange={(event) =>
                      onChange(
                        blocks.map((item, i) =>
                          i === index ? { ...item, text: event.target.value } : item
                        )
                      )
                    }
                    placeholder="Caption/deskripsi gambar (opsional)"
                    disabled={disabled}
                    aria-label="Caption gambar"
                    className="mt-2"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => pickFile(index)}
                    disabled={disabled}
                    className="mt-2"
                  >
                    Ganti gambar
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
