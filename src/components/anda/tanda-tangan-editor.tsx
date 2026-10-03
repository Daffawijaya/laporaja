"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import {
  MAX_IMAGE_BYTES,
  removeGambarRefs,
  resolveGambarUrl,
  uploadKegiatanImage,
} from "@/lib/supabase/storage";

export interface TtdItem {
  nama: string;
  jabatan: string;
  /** Rujukan gambar (drive:…/path lawas), "" = belum ada. */
  gambar: string;
}

interface TtdDraft extends TtdItem {
  key: number;
}

let ttdSeq = 0;
function ttdBaru(item: TtdItem = { nama: "", jabatan: "", gambar: "" }): TtdDraft {
  ttdSeq += 1;
  return { key: ttdSeq, ...item };
}

function snapOf(daftar: TtdItem[]): string {
  return JSON.stringify(
    daftar.map((item) => [item.nama.trim(), item.jabatan.trim(), item.gambar])
  );
}

// Kotak gambar ala SelGambar (dropzone + pratinjau + ganti/hapus), tanpa
// kolom deskripsi. Satu gambar per entri tanda tangan.
function TtdGambarBox({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setUrl(null);
  }
  const [mengunggah, setMengunggah] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [seret, setSeret] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // URL tampil untuk rujukan gambar (Drive via proxy, path lawas via signed URL).
  useEffect(() => {
    let hidup = true;
    if (!value) return;
    void resolveGambarUrl(createClient(), value).then((resolved) => {
      if (hidup) setUrl(resolved);
    });
    return () => {
      hidup = false;
    };
  }, [value]);

  async function pilihBerkas(file: File | undefined) {
    if (!file || mengunggah || disabled) return;
    if (!file.type.startsWith("image/")) {
      setGalat("Berkas harus berupa gambar.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setGalat(`Ukuran gambar maksimal ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setMengunggah(true);
    setGalat(null);
    try {
      const pathBaru = await uploadKegiatanImage({ jenis: "avatar" }, file);
      const lama = value;
      onChange(pathBaru);
      // Best effort: berkas lama dibuang sesudah diganti.
      if (lama && lama !== pathBaru) {
        void removeGambarRefs([lama]).catch(() => undefined);
      }
    } catch (err) {
      if (err instanceof SessionExpiredError || isSessionError(err)) {
        toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
        return;
      }
      setGalat(err instanceof Error ? err.message : "Gagal mengunggah gambar. Coba lagi.");
    } finally {
      setMengunggah(false);
    }
  }

  const sibuk = disabled || mengunggah;
  const maksMb = MAX_IMAGE_BYTES / 1024 / 1024;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {value ? (
        <div className="flex items-center gap-2.5 rounded-2xl bg-black/[0.075] p-2.5 dark:bg-white/[0.075]">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={label}
              className="h-16 w-24 shrink-0 rounded-xl bg-white object-contain"
            />
          ) : (
            <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-black/[0.075] text-[11px] text-neutral-500 dark:bg-white/10">
              Memuat…
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Check aria-hidden="true" className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Gambar terpilih
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="secondary"
                disabled={sibuk}
                onClick={() => fileRef.current?.click()}
                className="min-h-10 px-3 text-xs"
              >
                Ganti
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={sibuk}
                onClick={() => onChange("")}
                aria-label={`Hapus gambar ${label}`}
                className="min-h-10 w-10"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </span>
          </span>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={sibuk ? -1 : 0}
          aria-label={`Unggah ${label}`}
          aria-disabled={sibuk}
          onClick={() => {
            if (!sibuk) fileRef.current?.click();
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !sibuk) {
              event.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!sibuk) setSeret(true);
          }}
          onDragLeave={() => setSeret(false)}
          onDrop={(event) => {
            event.preventDefault();
            setSeret(false);
            if (!sibuk) void pilihBerkas(event.dataTransfer.files?.[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15 ${
            seret
              ? "border-accent bg-accent/10"
              : "border-neutral-300 bg-black/[0.03] hover:border-neutral-400 hover:bg-black/[0.06] dark:border-white/15 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
          } ${sibuk ? "pointer-events-none opacity-60" : ""}`}
        >
          {mengunggah ? (
            <Loader2 aria-hidden="true" className="size-6 animate-spin text-neutral-500" />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-full bg-black/[0.075] dark:bg-white/10">
              <ImagePlus aria-hidden="true" className="size-5" />
            </span>
          )}
          <span className="text-xs font-medium">
            {mengunggah ? "Mengunggah…" : "Klik atau seret gambar ke sini"}
          </span>
          <span className="text-[11px] text-neutral-500">PNG/JPG · maks {maksMb} MB</span>
        </div>
      )}
      <Input
        ref={fileRef}
        type="file"
        accept="image/*"
        disabled={sibuk}
        onChange={(event) => {
          void pilihBerkas(event.target.files?.[0]);
          event.target.value = "";
        }}
        className="hidden"
        aria-label={`Berkas ${label}`}
      />
      {galat && (
        <p role="alert" className="text-xs text-danger">
          {galat}
        </p>
      )}
    </div>
  );
}

// Daftar tanda tangan pengesah (khusus superadmin, satu kunci pengaturan
// "ttd_daftar" berisi JSON): tiap entri nama + jabatan + gambar. Bisa
// ditambah banyak; tiap entri wajib lengkap.
export function TandaTanganEditor({ daftarAwal }: { daftarAwal: TtdItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [daftar, setDaftar] = useState<TtdDraft[]>(() =>
    daftarAwal.length > 0 ? daftarAwal.map((item) => ttdBaru(item)) : [ttdBaru()]
  );
  const [prevAwal, setPrevAwal] = useState(() => snapOf(daftarAwal));
  const sigAwal = snapOf(daftarAwal);
  if (prevAwal !== sigAwal) {
    setPrevAwal(sigAwal);
    setDaftar(daftarAwal.length > 0 ? daftarAwal.map((item) => ttdBaru(item)) : [ttdBaru()]);
  }
  const [saving, setSaving] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  function patch(key: number, patch: Partial<TtdDraft>) {
    setDaftar((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setGalat(null);
  }

  function tambah() {
    if (daftar.length >= 10) return;
    setDaftar((prev) => [...prev, ttdBaru()]);
    setGalat(null);
  }

  function hapus(key: number) {
    setDaftar((prev) => prev.filter((item) => item.key !== key));
    setGalat(null);
  }

  async function simpan() {
    if (saving) return;
    const bersih = daftar.map((item) => ({
      nama: item.nama.trim(),
      jabatan: item.jabatan.trim(),
      gambar: item.gambar,
    }));
    for (let i = 0; i < bersih.length; i += 1) {
      const item = bersih[i];
      if (!item.nama || !item.jabatan || !item.gambar) {
        setGalat(`Tanda tangan ${i + 1}: nama, jabatan, dan gambar wajib diisi.`);
        return;
      }
    }
    setSaving(true);
    setGalat(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("pengaturan")
        .upsert({ kunci: "ttd_daftar", nilai: JSON.stringify(bersih) }, { onConflict: "kunci" });
      if (error) {
        if (error instanceof SessionExpiredError || isSessionError(error)) {
          toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
          router.replace("/login?expired=1");
          return;
        }
        setGalat("Gagal menyimpan tanda tangan. Coba lagi.");
        return;
      }
      // Best effort: gambar tersimpan yang sudah tidak dipakai dibuang.
      const dipakai = new Set(bersih.map((item) => item.gambar));
      const yatim = daftarAwal.map((item) => item.gambar).filter((g) => g && !dipakai.has(g));
      if (yatim.length > 0) {
        void removeGambarRefs(yatim).catch(() => undefined);
      }
      toast.success("Tanda tangan disimpan.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-1">
      <div
        className={`grid grid-cols-1 gap-3 ${
          daftar.length <= 1
            ? ""
            : daftar.length === 2
              ? "sm:grid-cols-2"
              : "sm:grid-cols-2 xl:grid-cols-3"
        }`}
      >{daftar.map((item, index) => (
        <div
          key={item.key}
          className="flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-3 dark:bg-white/[0.04]"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Tanda tangan {index + 1}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => hapus(item.key)}
              disabled={saving}
              aria-label={`Hapus tanda tangan ${index + 1}`}
              className="rounded-full"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`ttd-nama-${item.key}`}>Nama</Label>
            <Input
              id={`ttd-nama-${item.key}`}
              value={item.nama}
              onChange={(event) => patch(item.key, { nama: event.target.value })}
              placeholder="Nama penanda tangan"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`ttd-jabatan-${item.key}`}>Jabatan</Label>
            <Input
              id={`ttd-jabatan-${item.key}`}
              value={item.jabatan}
              onChange={(event) => patch(item.key, { jabatan: event.target.value })}
              placeholder="Jabatan penanda tangan"
              disabled={saving}
            />
          </div>
          <TtdGambarBox
            label={`tanda tangan ${index + 1}`}
            value={item.gambar}
            onChange={(gambar) => patch(item.key, { gambar })}
            disabled={saving}
          />
        </div>
      ))}
      </div>
      {daftar.length < 10 ? (
        <button
          type="button"
          onClick={tambah}
          disabled={saving}
          className="flex items-center gap-1 text-xs font-medium text-neutral-500 transition-soft hover:text-foreground disabled:opacity-50"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Tambah tanda tangan
        </button>
      ) : null}
      {galat && (
        <p role="alert" className="text-sm text-danger">
          {galat}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => void simpan()} disabled={saving} className="rounded-full">
          {saving ? "Menyimpan…" : "Simpan tanda tangan"}
        </Button>
      </div>
    </div>
  );
}
