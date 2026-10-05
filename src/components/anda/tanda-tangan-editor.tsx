"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Reorder, useDragControls } from "motion/react";
import { Check, GripHorizontal, ImagePlus, Loader2, Minus, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { setSimpanStatus } from "@/lib/simpan-status";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import {
  MAX_IMAGE_BYTES,
  TEKS_FORMAT_GAMBAR,
  removeGambarRefs,
  resolveGambarUrl,
  uploadKegiatanImage,
} from "@/lib/supabase/storage";

export interface TtdItem {
  /** Peran pengesah, mis. "Mengetahui," / "Menyetujui,". "" = tanpa peran. */
  peran: string;
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
// peran/pangkat/nip — default "" supaya .trim() tidak pernah crash.
function normalisasi(item: Partial<TtdItem> | null | undefined): TtdItem {
  return {
    peran: typeof item?.peran === "string" ? item.peran : "",
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
    daftar.map((item) => [item.peran.trim(), item.nama.trim(), item.jabatan.trim(), item.pangkat.trim(), item.nip.trim(), item.gambar])
  );
}

// Potret draft untuk banding kotor vs tersimpan ala SectionCard: satu JSON
// { d: isian, p: peran otomatis, u: urutan tampil }.
function snapTtd(daftar: TtdItem[], peran: string, urutan: string[]): string {
  return JSON.stringify({
    d: daftar.map((item) => [
      item.peran.trim(),
      item.nama.trim(),
      item.jabatan.trim(),
      item.pangkat.trim(),
      item.nip.trim(),
      item.gambar,
    ]),
    p: peran.trim(),
    u: urutan,
  });
}

// Id kartu di urutan tampil: manual "m<key>", otomatis "auto".
const ID_OTOMATIS = "auto";
function idManual(key: number): string {
  return `m${key}`;
}
function daftarAwalBaru(awal: TtdItem[]): TtdDraft[] {
  return awal.length > 0 ? awal.map((item) => ttdBaru(item)) : [ttdBaru()];
}
// Rangkaian tampil: semua manual + kartu otomatis disisipkan di posisi
// tersimpan (null/di luar jangkauan = paling akhir).
function rangkaiUrutan(daftarBaru: TtdDraft[], posisi: number | null): string[] {
  const ids = daftarBaru.map((item) => idManual(item.key));
  const pos = posisi == null ? ids.length : Math.min(Math.max(0, posisi), ids.length);
  const next = [...ids];
  next.splice(pos, 0, ID_OTOMATIS);
  return next;
}
// Cap data server untuk selaras ulang (posisi ikut, urutan lokal tidak).
function sigLuar(awal: TtdItem[], peran: string, posisi: number | null): string {
  return `${snapOf(awal)}|${peran.trim()}|${posisi ?? ""}`;
}

// Daftar path gambar dari sebuah snap (untuk bersih-bersih yatim).
function gambarDariSnap(snap: string): string[] {
  try {
    const parsed: unknown = JSON.parse(snap);
    const rows =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { d?: unknown }).d
        : null;
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row): row is unknown[] => Array.isArray(row))
      .map((row) => (typeof row[5] === "string" ? row[5] : ""))
      .filter((g) => g.length > 0);
  } catch {
    return [];
  }
}

// Dasar input kartu TTD: abu solid #ececec opacity penuh (bukan surface).
const TTD_INPUT_BG =
  "bg-[#ececec] disabled:bg-[#ececec] disabled:opacity-100 dark:bg-white/[0.075] dark:disabled:bg-white/[0.075]";
const SARAN_PERAN = [
  "Mengetahui,",
  "Menyetujui,",
  "Memeriksa,",
  "Mengajukan,",
  "Pelaksana,",
  "Yang melaporkan,",
  "Penanggung jawab,",
];

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
          className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15 ${
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
          <span className="text-[11px] text-neutral-500">{TEKS_FORMAT_GAMBAR} · maks {maksMb} MB</span>
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

// Bingkai kartu TTD yang bisa digeser: gagang titik-6 di atas ala kartu
// section (tahan + geser, atau fokus lalu panah atas/bawah).
function BingkaiKartuTtd({
  id,
  label,
  onAtas,
  onBawah,
  aksiKanan,
  children,
}: {
  id: string;
  label: string;
  onAtas: () => void;
  onBawah: () => void;
  /** Aksi kanan baris gagang (absolute, tidak menambah tinggi) mis. hapus. */
  aksiKanan?: React.ReactNode;
  children: React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      as="div"
      dragListener={false}
      dragControls={controls}
      className="min-w-0"
    >
      <div className="relative flex h-full flex-col gap-3 rounded-2xl bg-[#fafbfb] p-3 dark:bg-white/[0.04]">
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            onPointerDown={(event) => controls.start(event)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                onAtas();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                onBawah();
              }
            }}
            aria-label={`Geser ${label} (panah atas bawah untuk pindah)`}
            title="Tahan dan geser untuk pindah"
            style={{ touchAction: "none" }}
            className="flex min-w-[56px] cursor-grab items-center justify-center rounded-md text-neutral-400 transition-soft hover:text-foreground active:cursor-grabbing"
          >
            <GripHorizontal aria-hidden="true" className="size-5" />
          </button>
          {aksiKanan ? (
            <span className="absolute top-1/2 -right-2 -translate-y-1/2">{aksiKanan}</span>
          ) : null}
        </div>
        {children}
      </div>
    </Reorder.Item>
  );
}

// Daftar tanda tangan pengesah (khusus superadmin, satu kunci pengaturan
// "ttd_daftar" berisi JSON): tiap entri peran + nama + jabatan + gambar. Bisa
// ditambah banyak dan digeser urutannya (termasuk kartu otomatis); bebas
// diisi sebagian — tanpa validasi wajib. Kartu otomatis = user pelapor (identitas +
// gambar dari akun masing-masing user, hanya Peran yang diatur di sini via
// kunci "ttd_user_peran", posisinya via "ttd_user_posisi").
export function TandaTanganEditor({
  daftarAwal,
  peranUserAwal = "",
  posisiUserAwal = null,
}: {
  daftarAwal: TtdItem[];
  peranUserAwal?: string;
  /** Posisi kartu otomatis di rangkaian (null = paling akhir). */
  posisiUserAwal?: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [awal] = useState(() => {
    const d = daftarAwalBaru(daftarAwal);
    return { daftar: d, urutan: rangkaiUrutan(d, posisiUserAwal) };
  });
  const [daftar, setDaftar] = useState<TtdDraft[]>(awal.daftar);
  // Rangkaian tampil (id manual + "auto"): sumber urutan kartu & simpan.
  const [urutan, setUrutan] = useState<string[]>(awal.urutan);
  // Peran kartu otomatis (user pelapor): tersimpan terpisah di pengaturan.
  const [peranUser, setPeranUser] = useState(peranUserAwal);
  const [prevSig, setPrevSig] = useState(() =>
    sigLuar(daftarAwal, peranUserAwal, posisiUserAwal)
  );
  const sig = sigLuar(daftarAwal, peranUserAwal, posisiUserAwal);
  // Potret draft untuk banding kotor vs tersimpan ala SectionCard.
  const snap = snapTtd(daftar, peranUser, urutan);
  const [savedSnap, setSavedSnap] = useState(() =>
    snapTtd(
      daftarAwal.map((item) => normalisasi(item)),
      peranUserAwal,
      awal.urutan
    )
  );
  if (prevSig !== sig) {
    setPrevSig(sig);
    // Selaras dari server hanya saat tidak ada perubahan lokal yang belum
    // tersimpan (snap === savedSnap): ketikan dalam penerbangan tidak
    // tertimpa data server yang lebih lama.
    if (snap === savedSnap) {
      // Pakai ulang key draf lama untuk isian yang identik supaya input tidak
      // remount (fokus tidak loncat) setiap autosave selesai + refresh.
      const kolam = daftar.map((d) => ({
        d,
        s: JSON.stringify(normalisasi(d)),
        pakai: false,
      }));
      const baru: TtdDraft[] = [];
      for (const item of daftarAwal) {
        const t = normalisasi(item);
        const s = JSON.stringify(t);
        const cocok = kolam.find((k) => !k.pakai && k.s === s);
        if (cocok) {
          cocok.pakai = true;
          baru.push({ key: cocok.d.key, ...t });
        } else {
          baru.push(ttdBaru(t));
        }
      }
      if (baru.length === 0) baru.push(ttdBaru());
      // Kartu kosong lokal (mis. baru ditambah, belum tersimpan di server)
      // dipertahankan supaya tidak lenyap sesudah refresh.
      for (const k of kolam) {
        if (k.pakai) continue;
        const t = normalisasi(k.d);
        if (!t.peran && !t.nama && !t.jabatan && !t.pangkat && !t.nip && !t.gambar) {
          k.pakai = true;
          baru.push({ key: k.d.key, ...t });
        }
      }
      // Urutan lokal dipertahankan bila himpunan kartunya sama (kasus umum:
      // refresh sesudah autosave sendiri); dibangun ulang bila ada kartu
      // baru/hilang dari server.
      const idBaru = new Set(baru.map((d) => idManual(d.key)));
      const manualLama = urutan.filter((id) => id !== ID_OTOMATIS);
      const sama =
        manualLama.length === idBaru.size && manualLama.every((id) => idBaru.has(id));
      const urutanBaru = sama ? urutan : rangkaiUrutan(baru, posisiUserAwal);
      setDaftar(baru);
      setUrutan(urutanBaru);
      setPeranUser(peranUserAwal);
      setSavedSnap(snapTtd(baru, peranUserAwal, urutanBaru));
    }
  }
  const [saving, setSaving] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const olehKunci = new Map(daftar.map((item) => [idManual(item.key), item]));

  // Bebas isi: tanpa validasi wajib — entri boleh sebagian atau kosong.
  // Yang tersimpan semua kecuali kartu kosong total.

  function patch(key: number, patch: Partial<TtdDraft>) {
    setDaftar((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setGalat(null);
  }

  function tambah() {
    if (daftar.length >= 10) return;
    const baru = ttdBaru();
    const id = idManual(baru.key);
    setDaftar((prev) => [...prev, baru]);
    // Sisip tepat sebelum kartu otomatis supaya ia tidak terdorong.
    setUrutan((prev) => {
      const i = prev.indexOf(ID_OTOMATIS);
      if (i < 0) return [...prev, id];
      const next = [...prev];
      next.splice(i, 0, id);
      return next;
    });
    setGalat(null);
  }

  function hapus(key: number) {
    const id = idManual(key);
    setDaftar((prev) => prev.filter((item) => item.key !== key));
    setUrutan((prev) => prev.filter((row) => row !== id));
    setGalat(null);
  }

  // Geser kartu seposisi (dipakai drag keyboard panah di gagang).
  function geser(id: string, arah: -1 | 1) {
    setUrutan((prev) => {
      const i = prev.indexOf(id);
      const j = i + arah;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      next[i] = prev[j];
      next[j] = prev[i];
      return next;
    });
    setGalat(null);
  }

  // Simpan otomatis 800 mdetik sesudah berhenti mengetik ala SectionCard:
  // status jalan di navbar (SimpanTeks). Semua isian tersimpan apa adanya
  // mengikuti urutan tampil (kecuali kartu kosong total); posisi kartu
  // otomatis tersimpan terpisah supaya urutan pulih sesudah refresh.
  const simpan = useCallback(
    async (snapAwal: string) => {
      const peta = new Map(daftar.map((item) => [idManual(item.key), item]));
      const semua: TtdItem[] = [];
      for (const id of urutan) {
        if (id === ID_OTOMATIS) continue;
        const d = peta.get(id);
        if (!d) continue;
        const t = normalisasi(d);
        const item = {
          peran: t.peran.trim(),
          nama: t.nama.trim(),
          jabatan: t.jabatan.trim(),
          pangkat: t.pangkat.trim(),
          nip: t.nip.trim(),
          gambar: t.gambar,
        };
        const kosong =
          !item.peran && !item.nama && !item.jabatan && !item.pangkat && !item.nip && !item.gambar;
        if (!kosong) semua.push(item);
      }
      const peranBersih = peranUser.trim();
      const posisiAuto = urutan.indexOf(ID_OTOMATIS);
      setSaving(true);
      setGalat(null);
      setSimpanStatus("saving");
      let berhasil = false;
      try {
        const supabase = createClient();
        const [hasilDaftar, hasilPeran, hasilPosisi] = await Promise.all([
          supabase
            .from("pengaturan")
            .upsert({ kunci: "ttd_daftar", nilai: JSON.stringify(semua) }, { onConflict: "kunci" }),
          supabase
            .from("pengaturan")
            .upsert({ kunci: "ttd_user_peran", nilai: peranBersih }, { onConflict: "kunci" }),
          supabase
            .from("pengaturan")
            .upsert(
              { kunci: "ttd_user_posisi", nilai: String(posisiAuto < 0 ? semua.length : posisiAuto) },
              { onConflict: "kunci" }
            ),
        ]);
        const error = hasilDaftar.error ?? hasilPeran.error ?? hasilPosisi.error;
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
        const dipakai = new Set(semua.map((item) => item.gambar));
        const yatim = gambarDariSnap(savedSnap).filter((g) => !dipakai.has(g));
        if (yatim.length > 0) {
          void removeGambarRefs(yatim).catch(() => undefined);
        }
        setSavedSnap(snapAwal);
        berhasil = true;
        router.refresh();
      } finally {
        setSaving(false);
        setSimpanStatus(berhasil ? "saved" : "error");
      }
    },
    [daftar, urutan, peranUser, savedSnap, router, toast]
  );

  useEffect(() => {
    if (snap === savedSnap || saving) return;
    const timer = window.setTimeout(() => {
      void simpan(snap);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [snap, savedSnap, saving, simpan]);

  // Rangkaian tampil: manual + kartu otomatis (bisa di posisi mana pun).
  const totalKartu = urutan.length;

  // Isi kartu manual (bingkai + gagang dipasang di rangkaian bawah).
  // Tombol hapus dirender di baris gagang via prop aksiKanan bingkai
  // (lihat pemakaian di bawah) supaya tengah vertikal dengan ikon drag.
  function badanManual(item: TtdDraft, pos: number) {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <Input
            id={`ttd-peran-${item.key}`}
            aria-label="Peran"
            value={item.peran}
            onChange={(event) => patch(item.key, { peran: event.target.value })}
            placeholder="Peran"
            disabled={saving}
            list={`ttd-peran-saran-${item.key}`}
            autoComplete="off"
            className={TTD_INPUT_BG}
          />
          <datalist id={`ttd-peran-saran-${item.key}`}>
            {SARAN_PERAN.map((saran) => (
              <option key={saran} value={saran} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <Input
            id={`ttd-jabatan-${item.key}`}
            aria-label="Jabatan"
            value={item.jabatan}
            onChange={(event) => patch(item.key, { jabatan: event.target.value })}
            placeholder="Jabatan"
            disabled={saving}
            className={TTD_INPUT_BG}
          />
        </div>
        <TtdGambarBox
          label={`tanda tangan ${pos + 1}`}
          value={item.gambar}
          onChange={(gambar) => patch(item.key, { gambar })}
          disabled={saving}
        />
        <div className="flex flex-col gap-1.5">
          <Input
            id={`ttd-nama-${item.key}`}
            aria-label="Nama"
            value={item.nama}
            onChange={(event) => patch(item.key, { nama: event.target.value })}
            placeholder="Nama"
            disabled={saving}
            className={TTD_INPUT_BG}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Input
            id={`ttd-pangkat-${item.key}`}
            aria-label="Pangkat"
            value={item.pangkat}
            onChange={(event) => patch(item.key, { pangkat: event.target.value })}
            placeholder="Pangkat"
            disabled={saving}
            className={TTD_INPUT_BG}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Input
            id={`ttd-nip-${item.key}`}
            aria-label="NIP"
            value={item.nip}
            onChange={(event) => patch(item.key, { nip: event.target.value })}
            placeholder="NIP"
            disabled={saving}
            className={TTD_INPUT_BG}
          />
        </div>
      </>
    );
  }

  // Isi kartu otomatis: penanda tangan = user pelapor. Terkunci kecuali
  // Peran; bisa digeser ke posisi mana pun seperti kartu manual.
  const badanOtomatis = (
    <>
      <div className="flex flex-col gap-1.5">
        <Input
          id="ttd-peran-otomatis"
          aria-label="Peran"
          value={peranUser}
          onChange={(event) => {
            setPeranUser(event.target.value);
            setGalat(null);
          }}
          placeholder="Peran"
          disabled={saving}
          list="ttd-peran-otomatis-saran"
          autoComplete="off"
          className={TTD_INPUT_BG}
        />
        <datalist id="ttd-peran-otomatis-saran">
          {SARAN_PERAN.map((saran) => (
            <option key={saran} value={saran} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-1.5">
        <Input
          id="ttd-jabatan-otomatis"
          aria-label="Jabatan"
          value=""
          placeholder="Jabatan (otomatis)"
          disabled
          className={TTD_INPUT_BG}
        />
      </div>
      <div className="flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-neutral-300 bg-black/[0.03] px-4 py-5 text-center dark:border-white/15 dark:bg-white/[0.04]">
        <span className="text-xs font-medium">Gambar terkunci</span>
        <span className="text-[11px] text-neutral-500">
          Terisi otomatis dari tanda tangan di akun masing-masing user.
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Input
          id="ttd-nama-otomatis"
          aria-label="Nama"
          value=""
          placeholder="Nama (otomatis)"
          disabled
          className={TTD_INPUT_BG}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Input
          id="ttd-pangkat-otomatis"
          aria-label="Pangkat"
          value=""
          placeholder="Pangkat (otomatis)"
          disabled
          className={TTD_INPUT_BG}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Input
          id="ttd-nip-otomatis"
          aria-label="NIP"
          value=""
          placeholder="NIP (otomatis)"
          disabled
          className={TTD_INPUT_BG}
        />
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-4 px-1">
      <Reorder.Group
        // Tanpa axis: otomatis mengikuti tata letak — grid desktop (kartu
        // bersebelahan) jadi bebas kanan-kiri-atas-bawah, kolom tunggal
        // mobile tetap vertikal. Mengunci "y" bikin geser kanan-kiri macet.
        values={urutan}
        onReorder={(ids) => {
          setUrutan(ids);
          setGalat(null);
        }}
        className={`grid grid-cols-1 gap-3 ${
          totalKartu <= 1
            ? ""
            : totalKartu === 2
              ? "sm:grid-cols-2"
              : "sm:grid-cols-2 xl:grid-cols-3"
        }`}
      >
        {urutan.map((id, pos) => {
          if (id === ID_OTOMATIS) {
            return (
              <BingkaiKartuTtd
                key={ID_OTOMATIS}
                id={ID_OTOMATIS}
                label="tanda tangan otomatis"
                onAtas={() => geser(ID_OTOMATIS, -1)}
                onBawah={() => geser(ID_OTOMATIS, 1)}
              >
                {badanOtomatis}
              </BingkaiKartuTtd>
            );
          }
          const item = olehKunci.get(id);
          if (!item) return null;
          return (
            <BingkaiKartuTtd
              key={item.key}
              id={id}
              label={`tanda tangan ${pos + 1}`}
              onAtas={() => geser(id, -1)}
              onBawah={() => geser(id, 1)}
              aksiKanan={
                // Tanpa hover; tengah vertikal dengan ikon drag via bingkai.
                // Button polos (bukan Button): .fx-liquid-btn memaksa relative.
                <button
                  type="button"
                  onClick={() => hapus(item.key)}
                  disabled={saving}
                  aria-label={`Hapus tanda tangan ${pos + 1}`}
                  title={`Hapus tanda tangan ${pos + 1}`}
                  className="flex size-11 items-center justify-center rounded-full text-neutral-400 transition-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15 disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
                >
                  <X aria-hidden="true" />
                </button>
              }
            >
              {badanManual(item, pos)}
            </BingkaiKartuTtd>
          );
        })}
      </Reorder.Group>
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
