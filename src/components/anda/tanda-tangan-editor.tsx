"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Loader2, Minus, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
  pangkat: string;
  nip: string;
  /** Rujukan gambar (drive:…/path lawas), "" = belum ada. */
  gambar: string;
}

interface TtdDraft extends TtdItem {
  key: number;
}

let ttdSeq = 0;
// Normalisasi defensif: entri lama (atau bundle lama) bisa belum punya
// pangkat/nip — default "" supaya .trim() tidak pernah crash.
function normalisasi(item: Partial<TtdItem> | null | undefined): TtdItem {
  return {
    nama: typeof item?.nama === "string" ? item.nama : "",
    jabatan: typeof item?.jabatan === "string" ? item.jabatan : "",
    pangkat: typeof item?.pangkat === "string" ? item.pangkat : "",
    nip: typeof item?.nip === "string" ? item.nip : "",
    gambar: typeof item?.gambar === "string" ? item.gambar : "",
  };
}
function ttdBaru(item?: Partial<TtdItem>): TtdDraft {
  ttdSeq += 1;
  return { key: ttdSeq, ...normalisasi(item) };
}

function snapOf(daftar: TtdItem[]): string {
  return JSON.stringify(
    daftar.map((item) => [item.nama.trim(), item.jabatan.trim(), item.pangkat.trim(), item.nip.trim(), item.gambar])
  );
}

// Modal crop 1:1 sebelum upload: geser + zoom sampai tanda tangan penuh
// memenuhi kotak (jangan terpotong, jangan kekecilan). Hasil 800x800.
function TtdCropModal({
  src,
  sibuk,
  onBatal,
  onPakai,
}: {
  src: string;
  sibuk: boolean;
  onBatal: () => void;
  onPakai: (blob: Blob) => void;
}) {
  const bingkaiRef = useRef<HTMLDivElement>(null);
  const gambarRef = useRef<HTMLImageElement>(null);
  const seretRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [sisi, setSisi] = useState(0);
  const [alami, setAlami] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [geser, setGeser] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = bingkaiRef.current;
    if (!el) return;
    const ukur = () => setSisi(el.clientWidth);
    ukur();
    window.addEventListener("resize", ukur);
    return () => window.removeEventListener("resize", ukur);
  }, [src]);

  const V = sisi > 0 ? sisi : 280;
  // Skala dasar cover: sisi pendek gambar memenuhi kotak.
  const dasar = alami ? V / Math.min(alami.w, alami.h) : 1;
  const dw = alami ? alami.w * dasar * zoom : 0;
  const dh = alami ? alami.h * dasar * zoom : 0;
  // Jepit geser supaya kotak selalu tertutup gambar.
  const maksX = Math.max(0, (dw - V) / 2);
  const maksY = Math.max(0, (dh - V) / 2);
  const cx = Math.min(maksX, Math.max(-maksX, geser.x));
  const cy = Math.min(maksY, Math.max(-maksY, geser.y));

  function mulaiSeret(event: React.PointerEvent<HTMLDivElement>) {
    if (sibuk) return;
    event.preventDefault();
    seretRef.current = { x: event.clientX, y: event.clientY, ox: geser.x, oy: geser.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function lanjutSeret(event: React.PointerEvent<HTMLDivElement>) {
    const awal = seretRef.current;
    if (!awal || sibuk) return;
    event.preventDefault();
    setGeser({ x: awal.ox + (event.clientX - awal.x), y: awal.oy + (event.clientY - awal.y) });
  }

  function selesaiSeret() {
    seretRef.current = null;
  }

  function aturUlang() {
    setZoom(1);
    setGeser({ x: 0, y: 0 });
  }

  async function pakai() {
    const img = gambarRef.current;
    if (!img || !alami || V === 0) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const kiri = V / 2 + cx - dw / 2;
    const atas = V / 2 + cy - dh / 2;
    const sx = Math.min(nw, Math.max(0, (-kiri / dw) * nw));
    const sy = Math.min(nh, Math.max(0, (-atas / dh) * nh));
    const sw = Math.min(nw - sx, (V / dw) * nw);
    const sh = Math.min(nh - sy, (V / dh) * nh);
    const kanvas = document.createElement("canvas");
    kanvas.width = 800;
    kanvas.height = 800;
    const ctx = kanvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 800, 800);
    const blob = await new Promise<Blob | null>((selesai) =>
      kanvas.toBlob(selesai, "image/png")
    );
    if (blob) onPakai(blob);
  }

  return (
    <Dialog open onClose={onBatal} title="Atur tanda tangan">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-neutral-500">
          Pastikan tanda tangan penuh sampai ujung kotak — jangan terpotong, jangan kekecilan.
        </p>
        <div
          ref={bingkaiRef}
          onPointerDown={mulaiSeret}
          onPointerMove={lanjutSeret}
          onPointerUp={selesaiSeret}
          onPointerCancel={selesaiSeret}
          className="aspect-square w-full cursor-grab touch-none overflow-hidden rounded-2xl bg-black/[0.075] active:cursor-grabbing dark:bg-white/[0.075]"
          aria-label="Area crop: seret untuk menggeser"
        >
          {alami ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={gambarRef}
              src={src}
              alt="Pratinjau crop tanda tangan"
              draggable={false}
              onLoad={(event) =>
                setAlami({
                  w: event.currentTarget.naturalWidth,
                  h: event.currentTarget.naturalHeight,
                })
              }
              className="max-w-none origin-center select-none"
              style={{
                width: `${dw}px`,
                height: `${dh}px`,
                transform: `translate(${V / 2 + cx - dw / 2}px, ${V / 2 + cy - dh / 2}px)`,
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              aria-hidden="true"
              onLoad={(event) =>
                setAlami({
                  w: event.currentTarget.naturalWidth,
                  h: event.currentTarget.naturalHeight,
                })
              }
              className="hidden"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={sibuk || zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
            aria-label="Perkecil"
            className="rounded-full"
          >
            <Minus aria-hidden="true" />
          </Button>
          <Label htmlFor="ttd-zoom" className="sr-only">
            Perbesaran
          </Label>
          <input
            id="ttd-zoom"
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            disabled={sibuk}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="min-w-0 flex-1 accent-accent"
            aria-label="Perbesaran"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={sibuk || zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
            aria-label="Perbesar"
            className="rounded-full"
          >
            <Plus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={sibuk}
            onClick={aturUlang}
            aria-label="Atur ulang crop"
            title="Atur ulang crop"
            className="rounded-full"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onBatal} disabled={sibuk}>
            Batal
          </Button>
          <Button onClick={() => void pakai()} disabled={sibuk || !alami}>
            {sibuk ? "Mengunggah…" : "Pakai gambar"}
          </Button>
        </div>
      </div>
    </Dialog>
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
  // Berkas menunggu crop 1:1 di modal sebelum diunggah.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
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
    // Crop 1:1 dulu di modal; unggah jalan sesudah "Pakai gambar".
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
    setGalat(null);
  }

  function tutupCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function unggahCrop(blob: Blob) {
    if (mengunggah || disabled) return;
    setMengunggah(true);
    setGalat(null);
    try {
      const pathBaru = await uploadKegiatanImage(
        { jenis: "ttd" },
        new File([blob], "tanda-tangan.png", { type: "image/png" })
      );
      const lama = value;
      onChange(pathBaru);
      tutupCrop();
      // Best effort: berkas lama dibuang sesudah diganti.
      if (lama && lama !== pathBaru) {
        void removeGambarRefs([lama]).catch(() => undefined);
      }
    } catch (err) {
      if (err instanceof SessionExpiredError || isSessionError(err)) {
        toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
        tutupCrop();
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
              className="h-16 w-24 shrink-0 rounded-xl object-contain"
              // Papan catur supaya transparansi hasil konversi terlihat.
              style={{
                background:
                  "repeating-conic-gradient(#d4d4d4 0% 25%, #ffffff 0% 50%) 0 / 14px 14px",
              }}
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
          <span className="text-[11px] text-neutral-500">JPG/PNG/WEBP · maks {maksMb} MB</span>
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
      {cropSrc ? (
        <TtdCropModal
          key={cropSrc}
          src={cropSrc}
          sibuk={mengunggah}
          onBatal={tutupCrop}
          onPakai={(blob) => void unggahCrop(blob)}
        />
      ) : null}
    </div>
  );
}

// Blok pratinjau resmi satu entri: rata kanan (ujung kartu), terisi
// otomatis dari ketikan (nama/jabatan/pangkat/NIP + gambar).
function PratinjauBlok({ item }: { item: TtdItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [prevGambar, setPrevGambar] = useState(item.gambar);
  if (prevGambar !== item.gambar) {
    setPrevGambar(item.gambar);
    setUrl(null);
  }
  useEffect(() => {
    let hidup = true;
    if (!item.gambar) return;
    void resolveGambarUrl(createClient(), item.gambar).then((resolved) => {
      if (hidup) setUrl(resolved);
    });
    return () => {
      hidup = false;
    };
  }, [item.gambar]);

  return (
    <div className="min-w-[180px] flex-1 text-right sm:max-w-[260px]">
      {item.jabatan.trim() ? (
        <p className="text-sm">{item.jabatan.trim()}</p>
      ) : null}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Tanda tangan ${item.nama.trim() || "penanda tangan"}`}
          className="ml-auto h-20 object-contain"
        />
      ) : null}
      <p className="mt-1 text-sm font-semibold underline underline-offset-4">
        {item.nama.trim() || "…"}
      </p>
      {item.pangkat.trim() ? (
        <p className="text-xs text-neutral-500">{item.pangkat.trim()}</p>
      ) : null}
      <p className="text-xs text-neutral-500">
        {item.nip.trim() ? `NIP. ${item.nip.trim()}` : "NIP. …"}
      </p>
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
    const bersih = daftar.map((item) => {
      const t = normalisasi(item);
      return {
        nama: t.nama.trim(),
        jabatan: t.jabatan.trim(),
        pangkat: t.pangkat.trim(),
        nip: t.nip.trim(),
        gambar: t.gambar,
      };
    });
    for (let i = 0; i < bersih.length; i += 1) {
      const item = bersih[i];
      if (!item.nama || !item.jabatan || !item.pangkat || !item.nip || !item.gambar) {
        setGalat(`Tanda tangan ${i + 1}: nama, jabatan, pangkat, NIP, dan gambar wajib diisi.`);
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`ttd-pangkat-${item.key}`}>Pangkat</Label>
            <Input
              id={`ttd-pangkat-${item.key}`}
              value={item.pangkat}
              onChange={(event) => patch(item.key, { pangkat: event.target.value })}
              placeholder="Pangkat penanda tangan"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`ttd-nip-${item.key}`}>NIP</Label>
            <Input
              id={`ttd-nip-${item.key}`}
              value={item.nip}
              onChange={(event) => patch(item.key, { nip: event.target.value })}
              placeholder="NIP penanda tangan"
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
      {daftar.some((item) => item.nama.trim() || item.gambar) ? (
        <div className="border-t border-neutral-200/70 pt-3 dark:border-white/10">
          <p className="px-1 text-xs font-medium text-neutral-500">Pratinjau</p>
          <div className="mt-2 flex flex-wrap justify-end gap-6 px-1">
            {daftar
              .filter((item) => item.nama.trim() || item.gambar)
              .map((item) => (
                <PratinjauBlok key={item.key} item={item} />
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Tanda tangan milik user biasa: satu gambar saja, tanpa nama/jabatan.
// Langsung tersimpan saat gambar dipilih (pola FotoEditor); gambar
// dibersihkan server (kertas transparan, tinta pekat) sebelum disimpan.
export function TandaTanganUser({
  userId,
  ttdAwal,
}: {
  userId: string;
  ttdAwal: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [ttd, setTtd] = useState(ttdAwal);
  const [prevAwal, setPrevAwal] = useState(ttdAwal);
  if (prevAwal !== ttdAwal) {
    setPrevAwal(ttdAwal);
    setTtd(ttdAwal);
  }
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  function sesiBerakhir(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  // TtdGambarBox mengunggah sendiri (pembersihan TTD di server) lalu
  // memanggil onChange dengan rujukan baru. Di sini langsung disimpan ke
  // profil tanpa tombol simpan terpisah.
  async function simpanOtomatis(gambarBaru: string) {
    if (sibuk) return;
    if (!gambarBaru) {
      await hapusGambar();
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("profiles").update({ ttd: gambarBaru }).eq("id", userId);
      if (error) {
        if (sesiBerakhir(error)) return;
        await removeGambarRefs([gambarBaru]);
        setGalat("Gagal menyimpan tanda tangan. Coba lagi.");
        return;
      }
      const lama = ttd;
      setTtd(gambarBaru);
      if (lama && lama !== gambarBaru) {
        void removeGambarRefs([lama]).catch(() => undefined);
      }
      toast.success("Tanda tangan disimpan.");
      router.refresh();
    } finally {
      setSibuk(false);
    }
  }

  async function hapusGambar() {
    if (!ttd || sibuk) return;
    setSibuk(true);
    setGalat(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("profiles").update({ ttd: null }).eq("id", userId);
      if (error) {
        if (sesiBerakhir(error)) return;
        setGalat("Gagal menghapus tanda tangan. Coba lagi.");
        return;
      }
      const lama = ttd;
      setTtd(null);
      void removeGambarRefs([lama]).catch(() => undefined);
      toast.success("Tanda tangan dihapus.");
      router.refresh();
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="px-1">
      <TtdGambarBox
        label="tanda tangan"
        value={ttd ?? ""}
        onChange={(gambar) => void simpanOtomatis(gambar)}
        disabled={sibuk}
      />
      {galat && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {galat}
        </p>
      )}
    </div>
  );
}
