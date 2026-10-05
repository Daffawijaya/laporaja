"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GlassCalendar } from "@/components/ui/glass-calendar";
import { GlassMenu } from "@/components/ui/glass-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefListCard } from "@/components/ui/ref-list-card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { setSimpanStatus } from "@/lib/simpan-status";
import { adaPending, hapusPending, tambahPending } from "@/lib/section-pending";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import {
  ACCEPT_GAMBAR,
  GALAT_FORMAT_GAMBAR,
  MAX_IMAGE_BYTES,
  TEKS_FORMAT_GAMBAR,
  isGambarDidukung,
  removeGambarRefs,
  resolveGambarUrl,
  uploadKegiatanImage,
} from "@/lib/supabase/storage";
import { formatTanggalPanjang } from "@/components/laporan/types";
import { GambarNilaiTampil } from "@/components/laporan/gambar-nilai";
import {
  cleanNilai,
  parseGambarNilai,
  type BarisIsi,
  type KolomDef,
  type MonthlyReviewStatus,
  type Periode,
  type TugasLaporan,
} from "@/lib/laporan-tambahan/queries";

// Sel input tabel ala admin/section: tanpa label (label sudah jadi TH),
// kontrol langsung di dalam TD. Lebar minimum mengikuti kolom admin.
function SelInput({
  kolom,
  value,
  onChange,
  disabled,
  uniq,
  lindungiPaths = [],
  periode,
  tiket,
  onTiket,
  onLepasTiket,
  formGen,
}: {
  kolom: KolomDef;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  uniq: string;
  /** Path gambar milik baris lain: jangan hapus dari storage (dipakai bersama). */
  lindungiPaths?: string[];
  /** Periode laporan: tujuan upload (folder bulan) + kalender tanggal. */
  periode: Periode;
  /** Diteruskan ke SelGambar: tiket unggah latar + generasi form. */
  tiket?: string;
  onTiket?: (tiket: string, janji: Promise<string | null>) => void;
  onLepasTiket?: (tiket: string) => void;
  formGen?: { current: number };
}) {
  if (kolom.tipe === "image") {
    return (
      <SelGambar
        periode={periode}
        kolom={kolom}
        value={value}
        onChange={onChange}
        disabled={disabled}
        uniq={uniq}
        lindungiPaths={lindungiPaths}
        tiket={tiket ?? `${uniq}:${kolom.id}`}
        onTiket={onTiket ?? (() => undefined)}
        onLepasTiket={onLepasTiket ?? (() => undefined)}
        formGen={formGen}
      />
    );
  }
  if (kolom.tipe === "textarea") {
    return (
      <Textarea
        aria-label={kolom.label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        disabled={disabled}
        placeholder={kolom.label}
        className="min-h-11 border-transparent bg-black/[0.075] text-sm hover:border-transparent hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
      />
    );
  }
  if (kolom.tipe === "date") {
    // Kalender liquid glass (bukan date picker bawaan browser) supaya gaya
    // dan UX-nya sama dengan dropdown/modal kaca.
    return (
      <GlassCalendar
        value={value}
        onChange={onChange}
        ariaLabel={kolom.label}
        disabled={disabled}
        bulan={periode?.bulan}
        tahun={periode?.tahun}
        kunciBulan
      />
    );
  }
  return (
    <Input
      aria-label={kolom.label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      type={kolom.tipe === "number" ? "number" : "text"}
      inputMode={kolom.tipe === "number" ? "decimal" : undefined}
      disabled={disabled}
      placeholder={
        kolom.tipe === "number" && kolom.satuan
          ? `${kolom.label} (${kolom.satuan})`
          : kolom.label
      }
      className="h-11 min-w-[128px] border-transparent bg-black/[0.075] text-sm hover:border-transparent hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
    />
  );
}

// Pembungkus slide halus untuk sel baris pasangan tambah: mengembang
// saat pasangan ditambah, mengempis saat dihapus (via AnimatePresence).
function SelAnimasi({ children, durasi }: { children: ReactNode; durasi: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: durasi, ease: [0.32, 0.72, 0, 1] }}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

// Pasangan tambah (nama kegiatan + gambarnya) dirender sebagai baris
// tabel sendiri agar selalu sejajar atas-bawah.

// Isian gambar ringkas untuk sel tabel: pratinjau kecil + berkas +
// deskripsi. Nilai JSON {"gambar": path, "deskripsi": teks}.
function SelGambar({
  periode,
  kolom,
  value,
  onChange,
  disabled,
  uniq,
  lindungiPaths = [],
  tiket,
  onTiket,
  onLepasTiket,
  formGen,
}: {
  periode: Periode;
  kolom: KolomDef;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  uniq: string;
  /** Path gambar milik baris lain: jangan hapus dari storage (dipakai bersama). */
  lindungiPaths?: string[];
  /** Kunci tiket unggah di peta parent (untuk ditempel ke baris baru). */
  tiket: string;
  /** Daftarkan janji path hasil unggah (selesai dengan path atau null). */
  onTiket: (tiket: string, janji: Promise<string | null>) => void;
  /** Hapus tiket sesudah janji selesai. */
  onLepasTiket: (tiket: string) => void;
  /** Generasi form tambah: tulis hasil dibatalkan bila form sudah di-reset
      (hasil dialihkan ke baris baru via tiket, bukan ke form segar). */
  formGen?: { current: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const parsed = parseGambarNilai(value);
  const path = parsed?.gambar ?? "";
  const deskripsi = parsed?.deskripsi ?? "";
  const [url, setUrl] = useState<string | null>(null);
  const [prevPath, setPrevPath] = useState(path);
  if (prevPath !== path) {
    setPrevPath(path);
    setUrl(null);
  }
  // Pratinjau lokal instan (object URL): tampil segera saat berkas dipilih,
  // unggah jalan di latar. Dibuang sesudah URL server tiba / gagal / lepas.
  const pratinjauRef = useRef<string | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  function buangPratinjau() {
    if (pratinjauRef.current) {
      URL.revokeObjectURL(pratinjauRef.current);
      pratinjauRef.current = null;
    }
    setPratinjau(null);
  }
  useEffect(() => {
    return () => {
      if (pratinjauRef.current) URL.revokeObjectURL(pratinjauRef.current);
    };
  }, []);
  const [mengunggah, setMengunggah] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const descId = useId();
  const kunciPending = `unggah:${uniq}:${kolom.id}`;

  useEffect(() => {
    let hidup = true;
    if (!path) return;
    const supabase = createClient();
    // resolveGambarUrl: Drive via proxy, path lawas via signed URL.
    // Pratinjau lokal dipertahankan sampai URL server benar-benar tiba
    // (null = jangan buang pratinjau, jangan nyangkut di Memuat).
    void resolveGambarUrl(supabase, path).then((resolved) => {
      if (!hidup || !resolved) return;
      setUrl(resolved);
      buangPratinjau();
    });
    return () => {
      hidup = false;
    };
  }, [path]);

  function tulis(gambarBaru: string, deskripsiBaru: string) {
    if (!gambarBaru && !deskripsiBaru) {
      onChange("");
      return;
    }
    onChange(JSON.stringify({ gambar: gambarBaru, deskripsi: deskripsiBaru }));
  }

  async function pilihBerkas(file: File | undefined) {
    if (!file || mengunggah || disabled) return;
    if (!isGambarDidukung(file)) {
      setGalat(GALAT_FORMAT_GAMBAR);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setGalat(`Ukuran gambar maksimal ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    // Optimis ala admin/section: pratinjau langsung tampil, unggah jalan di
    // latar dengan status di navbar — user bebas lanjut mengisi lain, tombol
    // Tambah/Simpan tetap bisa diklik (hasil unggah ditempel ke baris baru).
    buangPratinjau();
    const lokal = URL.createObjectURL(file);
    pratinjauRef.current = lokal;
    setPratinjau(lokal);
    setMengunggah(true);
    setGalat(null);
    // Janji path untuk parent: bila user menekan Tambah/Simpan selagi
    // mengunggah, parent mengambil janji ini dan menempelkan hasilnya ke
    // baris yang baru dibuat (bukan ke form yang sudah di-reset).
    let selesaiTiket!: (path: string | null) => void;
    const janjiTiket = new Promise<string | null>((selesai) => {
      selesaiTiket = selesai;
    });
    onTiket(tiket, janjiTiket);
    const genSaya = formGen?.current;
    tambahPending(kunciPending);
    setSimpanStatus("saving");
    let berhasil = false;
    try {
      // Server mengonversi ke WebP lalu menyimpan ke Drive (folder bulan+user).
      const pathBaru = await uploadKegiatanImage({ jenis: "laporan", periode }, file);
      // Best effort: berkas lama dibuang saat diganti, kecuali dipakai
      // baris lain (hasil tambah banyak kegiatan sekaligus).
      if (path && path !== pathBaru && !lindungiPaths.includes(path)) {
        await removeGambarRefs([path]);
      }
      // Form sudah di-reset (Tambah ditekan duluan)? Jangan tulis ke form
      // segar — path dialihkan ke baris baru lewat tiket di bawah.
      if (formGen && formGen.current !== genSaya) {
        selesaiTiket(pathBaru);
        berhasil = true;
        return;
      }
      tulis(pathBaru, deskripsi);
      selesaiTiket(pathBaru);
      berhasil = true;
    } catch (err) {
      if (err instanceof SessionExpiredError || isSessionError(err)) {
        toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
        router.replace("/login?expired=1");
        selesaiTiket(null);
        return;
      }
      buangPratinjau();
      setGalat(err instanceof Error ? err.message : "Gagal mengunggah gambar. Coba lagi.");
      selesaiTiket(null);
    } finally {
      onLepasTiket(tiket);
      hapusPending(kunciPending);
      setMengunggah(false);
      setSimpanStatus(adaPending() ? "saving" : berhasil ? "saved" : "error");
    }
  }

  async function hapusGambar() {
    if (!path || mengunggah || disabled) return;
    setMengunggah(true);
    try {
      // Berkas yang dipakai baris lain tidak ikut dibuang.
      if (!lindungiPaths.includes(path)) {
        await removeGambarRefs([path]);
      }
    } finally {
      tulis("", deskripsi);
      setMengunggah(false);
    }
  }

  const sibuk = disabled || mengunggah;
  const [seret, setSeret] = useState(false);
  const maksMb = MAX_IMAGE_BYTES / 1024 / 1024;
  return (
    <div className="flex min-w-[200px] flex-col gap-2">
      {(path || pratinjau) ? (
        <div className="flex items-center gap-2.5 rounded-2xl bg-black/[0.075] p-2.5 dark:bg-white/[0.075]">
          {pratinjau ?? url ? (
            <span className="relative h-16 w-24 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pratinjau ?? url ?? ""}
                alt={deskripsi || kolom.label}
                className="h-16 w-24 rounded-xl object-cover"
              />
              {mengunggah ? (
                <span className="absolute inset-x-0 bottom-1 mx-auto w-fit rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                  Mengunggah…
                </span>
              ) : null}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="h-16 w-24 shrink-0 rounded-xl bg-black/[0.075] dark:bg-white/10"
            />
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
                onClick={() => void hapusGambar()}
                aria-label={`Hapus gambar ${kolom.label}`}
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
          aria-label={`Unggah ${kolom.label}`}
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
          <span className="text-[11px] text-neutral-500">{TEKS_FORMAT_GAMBAR} · maks {maksMb} MB</span>
        </div>
      )}
      <Input
        ref={fileRef}
        id={`${fileId}-${uniq}-${kolom.id}`}
        type="file"
        accept={ACCEPT_GAMBAR}
        disabled={sibuk}
        onChange={(event) => {
          void pilihBerkas(event.target.files?.[0]);
          event.target.value = "";
        }}
        className="hidden"
        aria-label={`Berkas ${kolom.label}`}
      />
      <Input
        id={`${descId}-${uniq}-${kolom.id}`}
        value={deskripsi}
        onChange={(event) => tulis(path, event.target.value)}
        placeholder="Deskripsi gambar"
        aria-label={`Deskripsi ${kolom.label}`}
        disabled={sibuk}
        className="h-11 border-transparent bg-black/[0.075] text-sm hover:border-transparent hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
      />
      {galat && (
        <p role="alert" className="text-xs text-danger">
          {galat}
        </p>
      )}
    </div>
  );
}

// Nilai tanggal (YYYY-MM-DD) ditampilkan sebagai "hari, tanggal bulan tahun"
// cth: "Senin, 12 Januari 2026". Nilai lain/non-ISO dikembalikan apa adanya.
function formatNilai(col: KolomDef, raw: string): string {
  if (!raw) return "-";
  if (col.tipe === "image") return parseGambarNilai(raw)?.deskripsi || "Gambar";
  if (col.tipe === "number" && col.satuan) return `${raw} ${col.satuan}`;
  if (col.tipe !== "date") return raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  try {
    return formatTanggalPanjang(raw);
  } catch {
    return raw;
  }
}

// Batas panjang esai: nilai disimpan sebagai teks bebas (kolom DB text).
const ESAI_MAKS = 10000;

// Kartu isian esai: satu textarea per subjudul dalam satu baris user.
// Tersimpan otomatis 800 mdetik sesudah berhenti mengetik ala
// admin/section (status di navbar via SimpanTeks). Boleh kosong;
// kelengkapan baru dicek saat tombol Selesai diklik. Kosongkan semua
// untuk menghapus (kembali belum diisi).
function EsaiIsian({
  userId,
  item,
  periode,
  terkunci,
}: {
  userId: string;
  item: TugasLaporan;
  periode: Periode;
  terkunci: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const kolomList = item.kolom;
  const baris = item.baris[0] ?? null;
  const [isi, setIsi] = useState<Record<string, string>>(() => {
    const awal: Record<string, string> = {};
    for (const col of kolomList) awal[col.id] = baris?.nilai[col.id] ?? "";
    return awal;
  });
  // Id baris lokal: langsung terisi sesudah insert pertama supaya
  // ketikan berikutnya jadi ubah, tanpa menunggu refresh server.
  const [barisId, setBarisId] = useState<string | null>(baris?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Selaraskan dengan data server sesudah refresh (render-phase sync ala
  // admin/section: hanya saat referensi baris/kolom berganti).
  const sig = `${item.id}|${kolomList.map((col) => col.id).join(",")}|${baris?.id ?? ""}|${JSON.stringify(baris?.nilai ?? {})}`;
  const [prevSig, setPrevSig] = useState(sig);
  // Potret draft untuk banding kotor vs tersimpan ala admin/section.
  const snap = JSON.stringify(kolomList.map((col) => (isi[col.id] ?? "").trim()));
  const [savedSnap, setSavedSnap] = useState(snap);
  if (prevSig !== sig) {
    setPrevSig(sig);
    const segar: Record<string, string> = {};
    for (const col of kolomList) segar[col.id] = baris?.nilai[col.id] ?? "";
    setIsi(segar);
    setBarisId(baris?.id ?? null);
    setSavedSnap(JSON.stringify(kolomList.map((col) => (baris?.nilai[col.id] ?? "").trim())));
    setError(null);
  }

  // Validasi ringan saat mengetik (ditampilkan, tidak toast) ala
  // admin/section: memblokir autosave selama belum valid. Kosong bukan
  // masalah — kelengkapan baru dicek saat tombol Selesai diklik.
  let masalah: string | null = null;
  {
    const panjang = kolomList
      .map((col) => ({ col, nilai: (isi[col.id] ?? "").trim() }))
      .find(({ nilai }) => nilai.length > ESAI_MAKS);
    if (panjang) masalah = `Subjudul "${panjang.col.label}" maksimal ${ESAI_MAKS} karakter.`;
  }

  const sesiBerakhir = useCallback(
    (galat: unknown): boolean => {
      if (galat instanceof SessionExpiredError || isSessionError(galat)) {
        toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
        router.replace("/login?expired=1");
        return true;
      }
      return false;
    },
    [toast, router]
  );

  function setSatu(kolomId: string, value: string) {
    if (terkunci) return;
    setIsi((prev) => ({ ...prev, [kolomId]: value }));
    setError(null);
  }

  const simpan = useCallback(
    async (snapAwal: string) => {
      const cleaned = kolomList.map((col) => ({ col, nilai: (isi[col.id] ?? "").trim() }));
      const adaIsi = cleaned.some(({ nilai }) => nilai.length > 0);
      // Pengaman ganda: jangan tulis baris kosong baru ke DB.
      if (!adaIsi && !barisId) return;
      setSaving(true);
      setError(null);
      setSimpanStatus("saving");
      let berhasil = false;
      try {
        const supabase = createClient();
        if (!adaIsi && barisId) {
          const { error } = await supabase
            .from("laporan_tambahan_baris")
            .delete()
            .eq("id", barisId)
            .eq("user_id", userId);
          if (error) {
            if (sesiBerakhir(error)) return;
            setError("Gagal menghapus isian. Coba lagi.");
            return;
          }
          setBarisId(null);
          setSavedSnap(snapAwal);
          berhasil = true;
          router.refresh();
          return;
        }
        for (const { col, nilai } of cleaned) {
          if (nilai.length > ESAI_MAKS) {
            setError(`Subjudul "${col.label}" maksimal ${ESAI_MAKS} karakter.`);
            return;
          }
        }
        if (barisId) {
          const { error } = await supabase.from("laporan_tambahan_nilai").upsert(
            cleaned.map(({ col, nilai }) => ({
              baris_id: barisId,
              kolom_id: col.id,
              nilai,
            })),
            { onConflict: "baris_id,kolom_id" }
          );
          if (error) {
            if (sesiBerakhir(error)) return;
            setError("Gagal menyimpan. Coba lagi.");
            return;
          }
        } else {
          const { data: baru, error: barisError } = await supabase
            .from("laporan_tambahan_baris")
            .insert({ laporan_id: item.id, user_id: userId, bulan: periode.bulan, tahun: periode.tahun })
            .select("id")
            .single();
          if (barisError || !baru) {
            if (sesiBerakhir(barisError)) return;
            setError("Gagal menyimpan. Coba lagi.");
            return;
          }
          const { error: nilaiError } = await supabase
            .from("laporan_tambahan_nilai")
            .insert(
              cleaned.map(({ col, nilai }) => ({
                baris_id: baru.id,
                kolom_id: col.id,
                nilai,
              }))
            );
          if (nilaiError) {
            await supabase.from("laporan_tambahan_baris").delete().eq("id", baru.id);
            setError("Gagal menyimpan. Coba lagi.");
            return;
          }
          setBarisId(baru.id);
        }
        setSavedSnap(snapAwal);
        berhasil = true;
        router.refresh();
      } finally {
        setSaving(false);
        setSimpanStatus(berhasil ? "saved" : "error");
      }
    },
    [isi, barisId, kolomList, item.id, periode.bulan, periode.tahun, userId, router, sesiBerakhir]
  );

  // Simpan otomatis 800 mdetik sesudah berhenti mengetik ala admin/section.
  // Saat terkunci (selesai/disetujui) tidak ada yang bisa berubah.
  useEffect(() => {
    if (terkunci || snap === savedSnap || masalah || saving) return;
    if (!barisId && kolomList.every((col) => (isi[col.id] ?? "").trim().length === 0)) return;
    const timer = window.setTimeout(() => {
      void simpan(snap);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [terkunci, snap, savedSnap, masalah, saving, barisId, kolomList, isi, simpan]);

  if (kolomList.length === 0) return null;

  return (
    <RefListCard
      ariaLabel={`Esai ${item.judul}`}
      title={item.judul}
      className="mt-4"
    >
      {item.deskripsi && (
        <p className="px-1 pb-3 text-xs whitespace-pre-wrap text-neutral-500">
          {item.deskripsi}
        </p>
      )}
      <div className="flex flex-col gap-4 px-1">
        {kolomList.map((col) => (
          <div key={col.id} className="flex flex-col gap-2">
            <Label htmlFor={`esai-${item.id}-${col.id}`}>{col.label}</Label>
            <Textarea
              id={`esai-${item.id}-${col.id}`}
              value={isi[col.id] ?? ""}
              onChange={(event) => setSatu(col.id, event.target.value)}
              rows={6}
              placeholder={`Tulis ${col.label.toLowerCase()} di sini.`}
              disabled={terkunci}
            />
          </div>
        ))}
      </div>
      {(error ?? masalah) && (
        <p role="alert" className="mt-2 px-1 text-sm text-danger">
          {error ?? masalah}
        </p>
      )}
    </RefListCard>
  );
}

// Kartu tabel user: tampil + input langsung berbentuk tabel ala
// admin/section (TH = nama kolom, baris = isian). Baris terakhir selalu
// input tambah (+), ubah langsung di barisnya. Tanpa dropdown/dialog.
function TabelIsianCard({
  userId,
  item,
  periode,
  terkunci,
  revisi = {},
}: {
  userId: string;
  item: TugasLaporan;
  periode: Periode;
  terkunci: boolean;
  revisi?: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  // Baris optimis ala admin/section tambahCepat: baris langsung tampil di UI
  // saat Tambah diklik (slide smooth), tulis DB jalan di belakang dengan
  // status di navbar (Menyimpan…/Tersimpan). Gagal = rollback + navbar error.
  // Id dibuat di client supaya key stabil (tanpa remount/dobel saat data
  // server tiba); pendingRef menjaga baris optimis bila refresh dari kartu
  // lain datang sebelum insert rampung.
  const pendingRef = useRef<Set<string>>(new Set());
  const [barisOpt, setBarisOpt] = useState<BarisIsi[]>(item.baris);
  const [syncedBaris, setSyncedBaris] = useState(item.baris);
  if (syncedBaris !== item.baris) {
    setSyncedBaris(item.baris);
    setBarisOpt((prev) => {
      const serverIds = new Set(item.baris.map((row) => row.id));
      const tertunda = prev.filter(
        (row) => pendingRef.current.has(row.id) && !serverIds.has(row.id)
      );
      return tertunda.length > 0 ? [...item.baris, ...tertunda] : item.baris;
    });
  }
  const [tambah, setTambah] = useState<Record<string, string>>(() => {
    // Tanggal tetap: baris tambah dibuka dengan tanggal baris terakhir,
    // jadi tambah kegiatan berulang tidak perlu isi tanggal lagi.
    // Keterangan/gambar selalu mulai kosong.
    const awal: Record<string, string> = {};
    const terakhir = item.baris[item.baris.length - 1];
    if (terakhir) {
      for (const col of item.kolom) {
        if (col.tipe === "date" && terakhir.nilai[col.id]) awal[col.id] = terakhir.nilai[col.id];
      }
    }
    return awal;
  });
  const [tambahError, setTambahError] = useState<string | null>(null);
  // Kolom nama kegiatan mendukung banyak isian sekaligus di baris tambah:
  // tiap isian tersimpan sebagai baris sendiri (tanggal/gambar sama).
  const multiCol =
    item.kolom.find(
      (col) => (col.tipe === "text" || col.tipe === "textarea") && /kegiatan/i.test(col.label)
    ) ?? null;
  const pairSeq = useRef(0);
  const [pairs, setPairs] = useState(() => [{ id: "pasangan-0", nama: "", gambar: "" }]);

  function nextPairId() {
    pairSeq.current += 1;
    return `pasangan-${pairSeq.current}`;
  }
  // Kolom gambar pertama dipasangkan sebaris dengan tiap nama kegiatan.
  const imageCol = item.kolom.find((col) => col.tipe === "image") ?? null;

  function tambahPasangan() {
    if (pairs.length >= 20) return;
    setPairs((prev) => [...prev, { id: nextPairId(), nama: "", gambar: "" }]);
    setTambahError(null);
  }

  function hapusPasangan(index: number) {
    // Berkas pasangan yang dibuang ikut dibersihkan (best effort) selama
    // tidak dipakai baris tersimpan.
    const berkas = parseGambarNilai(pairs[index]?.gambar ?? "")?.gambar ?? "";
    if (berkas && !pathsGambar(barisOpt).includes(berkas)) {
      void removeGambarRefs([berkas]).catch(() => undefined);
    }
    setPairs((prev) => prev.filter((_, j) => j !== index));
    setTambahError(null);
  }

  // Semua path gambar yang dipakai sekumpulan baris (untuk lindungi
  // berkas bersama dari hapus storage).
  function pathsGambar(rows: BarisIsi[]): string[] {
    return rows.flatMap((row) =>
      item.kolom
        .filter((col) => col.tipe === "image")
        .map((col) => parseGambarNilai(row.nilai[col.id] ?? "")?.gambar ?? "")
        .filter((p) => p.length > 0)
    );
  }
  const [tambahSaving, setTambahSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [hapus, setHapus] = useState<BarisIsi | null>(null);
  const [hapusBusy, setHapusBusy] = useState(false);
  // Tiket unggah gambar latar per sel: Tambah/Simpan yang ditekan selagi
  // mengunggah mengambil janji ini dan menempelkan hasilnya ke baris yang
  // baru dibuat (tombol tetap bisa diklik, desc tetap bisa diketik — yang
  // menunggu hanya status di navbar).
  const tiketRef = useRef(new Map<string, Promise<string | null>>());
  function daftarTiket(tiket: string, janji: Promise<string | null>) {
    tiketRef.current.set(tiket, janji);
  }
  function lepasTiket(tiket: string) {
    tiketRef.current.delete(tiket);
  }
  function ambilTiket(tiket: string): Promise<string | null> | null {
    const janji = tiketRef.current.get(tiket);
    if (janji) tiketRef.current.delete(tiket);
    return janji ?? null;
  }
  // Cermin baris terkini untuk tindak lanjut tiket (deskripsi terbaru).
  const barisRef = useRef<BarisIsi[]>([]);
  barisRef.current = barisOpt;
  // Generasi form tambah: naik setiap Tambah ditekan (form di-reset).
  const formGenRef = useRef(0);

  // Tempelkan hasil unggah ke baris yang sudah tersimpan.
  async function tindakTiket(barisId: string, colId: string, janji: Promise<string | null>) {
    const kunci = `lampir:${barisId}:${colId}`;
    tambahPending(kunci);
    setSimpanStatus("saving");
    let berhasil = false;
    try {
      const path = await janji;
      if (!path) {
        toast.error("Satu gambar gagal diunggah (baris tersimpan tanpa gambar).");
        return;
      }
      const row = barisRef.current.find((r) => r.id === barisId);
      if (!row) return; // baris keburu dihapus
      const lama = parseGambarNilai(row.nilai[colId] ?? "");
      const baru = JSON.stringify({ gambar: path, deskripsi: lama?.deskripsi ?? "" });
      const sebelum = row.nilai[colId] ?? "";
      setBarisOpt((prev) =>
        prev.map((r) => (r.id === barisId ? { ...r, nilai: { ...r.nilai, [colId]: baru } } : r))
      );
      const supabase = createClient();
      const { error } = await supabase.from("laporan_tambahan_nilai").upsert(
        { baris_id: barisId, kolom_id: colId, nilai: baru },
        { onConflict: "baris_id,kolom_id" }
      );
      if (error) {
        if (error instanceof SessionExpiredError || isSessionError(error)) {
          toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
          router.replace("/login?expired=1");
          return;
        }
        toast.error("Gagal menyimpan gambar ke baris. Coba lagi.");
        setBarisOpt((prev) =>
          prev.map((r) =>
            r.id === barisId ? { ...r, nilai: { ...r.nilai, [colId]: sebelum } } : r
          )
        );
        return;
      }
      berhasil = true;
    } finally {
      hapusPending(kunci);
      if (!adaPending()) setSimpanStatus(berhasil ? "saved" : "error");
    }
  }

  function sesiBerakhir(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  function ubahTambah(kolomId: string, value: string) {
    setTambah((prev) => ({ ...prev, [kolomId]: value }));
    setTambahError(null);
  }

  function ubahEdit(kolomId: string, value: string) {
    setEditVals((prev) => ({ ...prev, [kolomId]: value }));
    setEditError(null);
  }

  function mulaiUbah(row: BarisIsi) {
    if (terkunci) return;
    setEditId(row.id);
    setEditVals({ ...row.nilai });
    setEditError(null);
    setTambahError(null);
  }

  async function simpanTambah() {
    if (terkunci || tambahSaving || editSaving) return;
    // Pasangan sebaris: tiap nama kegiatan + gambarnya jadi satu baris.
    // Pasangan yang keduanya kosong diabaikan.
    let pasangan: { nama: string; gambar: string }[] | null = null;
    // Indeks pair asal tiap pasangan (untuk menempel tiket unggah).
    let idxPair: number[] = [];
    if (multiCol) {
      const semua = pairs.map((p) => ({
        nama: p.nama.trim(),
        gambar: imageCol ? p.gambar : "",
      }));
      idxPair = semua
        .map((p, i) => (p.nama.length > 0 || p.gambar.length > 0 ? i : -1))
        .filter((i) => i >= 0);
      pasangan = idxPair.map((i) => semua[i]);
      if (pasangan.length === 0) {
        setTambahError(`Kolom "${multiCol.label}" wajib diisi.`);
        return;
      }
      if (pasangan.length > 20) {
        setTambahError(`Maksimal 20 ${multiCol.label.toLowerCase()} sekaligus.`);
        return;
      }
    }
    let bersih: Record<string, string>[];
    try {
      bersih = (pasangan ?? [{ nama: "", gambar: "" }]).map((p) =>
        cleanNilai(item.kolom, {
          ...tambah,
          ...(multiCol ? { [multiCol.id]: p.nama } : {}),
          ...(multiCol && imageCol ? { [imageCol.id]: p.gambar } : {}),
        })
      );
    } catch (err) {
      setTambahError(err instanceof Error ? err.message : "Isian belum valid.");
      return;
    }
    // Tanggal yang ikut tetap tidak dihitung sebagai isian: minimal satu
    // kolom selain tanggal harus terisi.
    const kolomIsi = item.kolom.filter((col) => col.tipe !== "date");
    const pool = kolomIsi.length > 0 ? kolomIsi : item.kolom;
    if (!bersih.some((row) => pool.some((col) => (row[col.id] ?? "").length > 0))) {
      setTambahError(`Kolom "${item.kolom[0]?.label ?? "isian"}" wajib diisi.`);
      return;
    }
    // Optimis: tampilkan baris baru langsung (slide smooth via motion.tr),
    // kosongkan form tambah, status jalan di navbar ala admin/section.
    // Id baris dibuat di client dan dipakai juga untuk insert DB, jadi key
    // React stabil — tidak ada remount/dobel saat refresh server tiba.
    const tempIds = bersih.map(() => crypto.randomUUID());
    for (const id of tempIds) pendingRef.current.add(id);
    // Ambil alih tiket unggah yang masih jalan SEKARANG (sinkron): hasilnya
    // ditempel ke baris baru sesudah insert, bukan ke form yang di-reset.
    // Generasi form naik supaya tulis susulan tak jadi hantu di form segar.
    formGenRef.current += 1;
    const handoff: { barisIdx: number; colId: string; janji: Promise<string | null> }[] = [];
    if (multiCol && imageCol) {
      idxPair.forEach((pi, j) => {
        const janji = ambilTiket(`pair:${pairs[pi].id}`);
        if (janji) handoff.push({ barisIdx: j, colId: imageCol.id, janji });
      });
      for (const col of item.kolom) {
        if (col.tipe !== "image" || col.id === imageCol.id) continue;
        const janji = ambilTiket(`tambah:${col.id}`);
        if (janji) {
          for (let j = 0; j < tempIds.length; j += 1) {
            handoff.push({ barisIdx: j, colId: col.id, janji });
          }
        }
      }
    } else {
      for (const col of item.kolom) {
        if (col.tipe !== "image") continue;
        const janji = ambilTiket(`tambah:${col.id}`);
        if (janji) handoff.push({ barisIdx: 0, colId: col.id, janji });
      }
    }
    const barisOptimis: BarisIsi[] = bersih.map((nilai, i) => ({
      id: tempIds[i],
      bulan: periode.bulan,
      tahun: periode.tahun,
      nilai,
    }));
    const tanggalTetap: Record<string, string> = {};
    for (const col of item.kolom) {
      if (col.tipe === "date" && tambah[col.id]) tanggalTetap[col.id] = tambah[col.id];
    }
    setBarisOpt((prev) => [...prev, ...barisOptimis]);
    setTambah(tanggalTetap);
    setPairs([{ id: nextPairId(), nama: "", gambar: "" }]);
    setTambahSaving(true);
    setTambahError(null);
    setSimpanStatus("saving");
    let berhasil = false;
    try {
      const supabase = createClient();
      const { data: barisBaru, error: barisError } = await supabase
        .from("laporan_tambahan_baris")
        .insert(
          bersih.map((_, i) => ({
            id: tempIds[i],
            laporan_id: item.id,
            user_id: userId,
            bulan: periode.bulan,
            tahun: periode.tahun,
          }))
        )
        .select("id");
      if (barisError || !barisBaru || barisBaru.length !== bersih.length) {
        if (sesiBerakhir(barisError)) return;
        setTambahError("Gagal menyimpan. Coba lagi.");
        return;
      }
      const { error: nilaiError } = await supabase.from("laporan_tambahan_nilai").insert(
        barisBaru.flatMap((_, i) =>
          item.kolom.map((col) => ({
            baris_id: tempIds[i],
            kolom_id: col.id,
            nilai: bersih[i][col.id] ?? "",
          }))
        )
      );
      if (nilaiError) {
        await supabase.from("laporan_tambahan_baris").delete().in("id", tempIds);
        setTambahError("Gagal menyimpan. Coba lagi.");
        return;
      }
      for (const id of tempIds) pendingRef.current.delete(id);
      berhasil = true;
      // Tempelkan hasil unggah yang tadi masih jalan ke barisnya masing-masing.
      for (const h of handoff) void tindakTiket(tempIds[h.barisIdx], h.colId, h.janji);
      router.refresh();
    } finally {
      if (!berhasil) {
        // Rollback tampilan optimis bila gagal.
        for (const id of tempIds) pendingRef.current.delete(id);
        setBarisOpt((prev) => prev.filter((row) => !tempIds.includes(row.id)));
      }
      setTambahSaving(false);
      setSimpanStatus(adaPending() ? "saving" : berhasil ? "saved" : "error");
    }
  }

  async function simpanUbah(rowId: string) {
    if (terkunci || editSaving) return;
    let cleaned: Record<string, string>;
    try {
      cleaned = cleanNilai(item.kolom, editVals);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Isian belum valid.");
      return;
    }
    // Optimis: tampilkan perubahan langsung, tutup mode ubah.
    const prevRows = barisOpt;
    setBarisOpt((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, nilai: cleaned } : row))
    );
    setEditId(null);
    setEditSaving(true);
    setEditError(null);
    setSimpanStatus("saving");
    let berhasil = false;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("laporan_tambahan_nilai")
        .upsert(
          item.kolom.map((col) => ({
            baris_id: rowId,
            kolom_id: col.id,
            nilai: cleaned[col.id] ?? "",
          })),
          { onConflict: "baris_id,kolom_id" }
        );
      if (error) {
        if (sesiBerakhir(error)) return;
        setEditError("Gagal menyimpan. Coba lagi.");
        return;
      }
      berhasil = true;
      // Unggah yang masih jalan di editor ditempel ke baris ini.
      for (const col of item.kolom) {
        if (col.tipe !== "image") continue;
        const janji = ambilTiket(`edit:${rowId}:${col.id}`);
        if (janji) void tindakTiket(rowId, col.id, janji);
      }
      router.refresh();
    } finally {
      if (!berhasil) setBarisOpt(prevRows);
      setEditSaving(false);
      setSimpanStatus(adaPending() ? "saving" : berhasil ? "saved" : "error");
    }
  }

  async function jalankanHapus() {
    if (terkunci || !hapus || hapusBusy) return;
    const target = hapus;
    // Optimis: hilangkan baris langsung dengan animasi keluar.
    const prevRows = barisOpt;
    setBarisOpt((prev) => prev.filter((row) => row.id !== target.id));
    if (editId === target.id) setEditId(null);
    setHapus(null);
    setHapusBusy(true);
    setSimpanStatus("saving");
    let berhasil = false;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("laporan_tambahan_baris")
        .delete()
        .eq("id", target.id)
        .eq("user_id", userId);
      if (error) {
        if (sesiBerakhir(error)) return;
        toast.error("Gagal menghapus isian. Coba lagi.");
        return;
      }
      // Best effort: berkas gambar ikut dibuang agar tidak yatim, kecuali
      // masih dipakai baris lain (tambah banyak kegiatan sekaligus).
      const dipakaiLain = new Set(
        pathsGambar(prevRows.filter((row) => row.id !== target.id))
      );
      const paths = item.kolom
        .filter((col) => col.tipe === "image")
        .map((col) => parseGambarNilai(target.nilai[col.id] ?? "")?.gambar ?? "")
        .filter((path) => path.length > 0 && !dipakaiLain.has(path));
      if (paths.length > 0) {
        await removeGambarRefs(paths);
      }
      berhasil = true;
      router.refresh();
    } finally {
      if (!berhasil) setBarisOpt(prevRows);
      setHapusBusy(false);
      setSimpanStatus(berhasil ? "saved" : "error");
    }
  }

  const reduceMotion = !!useReducedMotion();
  const durasi = reduceMotion ? 0.15 : 0.28;

  if (item.kolom.length === 0) {
    return (
      <RefListCard ariaLabel={`Section ${item.judul}`} title={item.judul} className="mt-4">
        <p className="px-1 text-sm text-neutral-500">
          Belum ada kolom untuk section ini. Hubungi admin.
        </p>
      </RefListCard>
    );
  }

  const galat = editError ?? tambahError;

  return (
    <RefListCard
      ariaLabel={`Section ${item.judul}`}
      title={item.judul}
      className="mt-4"
    >
      {item.deskripsi && (
        <p className="px-1 pb-3 text-xs whitespace-pre-wrap text-neutral-500">
          {item.deskripsi}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200/70 text-left dark:border-white/10">
              {item.kolom.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className="min-w-[160px] px-1 py-2 align-bottom"
                >
                  <span className="block text-xs font-normal text-neutral-500 dark:text-neutral-400">
                    {col.label}
                    {col.satuan ? ` (${col.satuan})` : ""}
                  </span>
                </th>
              ))}
              {terkunci ? null : (
                <th
                  scope="col"
                  className="w-24 px-1 py-2 text-right text-xs font-normal text-neutral-500 dark:text-neutral-400"
                >
                  Aksi
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
            {barisOpt.map((row) => {
              const note = revisi[row.id];
              return !terkunci && editId === row.id ? (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: durasi, ease: [0.32, 0.72, 0, 1] }}
                  className="border-b border-neutral-200/70 bg-accent/5 align-middle dark:border-white/10">
                  {item.kolom.map((col) => (
                    <td key={col.id} className="px-1 py-3 align-middle">
                      <SelInput
                        kolom={col}
                        value={editVals[col.id] ?? ""}
                        onChange={(value) => ubahEdit(col.id, value)}
                        disabled={editSaving}
                        uniq={`edit-${row.id}`}
                        lindungiPaths={pathsGambar(barisOpt.filter((r) => r.id !== editId))}
                        periode={periode}
                        tiket={`edit:${row.id}:${col.id}`}
                        onTiket={daftarTiket}
                        onLepasTiket={lepasTiket}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-3 align-middle">
                    <span className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void simpanUbah(row.id)}
                        disabled={editSaving}
                        aria-label="Simpan perubahan"
                      >
                        <Check aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditId(null)}
                        disabled={editSaving}
                        aria-label="Batal ubah"
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </span>
                  </td>
                </motion.tr>
              ) : (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: durasi, ease: [0.32, 0.72, 0, 1] }}
                  className={`border-b border-neutral-200/70 align-middle dark:border-white/10${note ? " bg-amber-50/70 dark:bg-amber-950/20" : ""}`}>
                  {item.kolom.map((col, ci) => (
                    <td key={col.id} className="px-1 py-3 align-middle whitespace-pre-wrap">
                      {col.tipe === "image" ? (
                        (() => {
                          const parsed = parseGambarNilai(row.nilai[col.id] ?? "");
                          return parsed ? (
                            <GambarNilaiTampil
                              path={parsed.gambar}
                              deskripsi={parsed.deskripsi}
                            />
                          ) : (
                            "-"
                          );
                        })()
                      ) : (
                        formatNilai(col, row.nilai[col.id] ?? "")
                      )}
                      {ci === 0 && note ? (
                        <p className="mt-1 text-[11px] font-medium whitespace-pre-wrap text-amber-700 dark:text-amber-300">
                          Perlu revisi: {note}
                        </p>
                      ) : null}
                    </td>
                  ))}
                  <td className="px-1 py-3 align-middle">
                    {terkunci ? null : (
                    <span className="flex justify-end">
                      <GlassMenu
                        label="Aksi isian"
                        items={[
                          {
                            key: "edit",
                            label: "Ubah",
                            icon: <Pencil aria-hidden="true" />,
                            onSelect: () => mulaiUbah(row),
                          },
                          {
                            key: "delete",
                            label: "Hapus",
                            icon: <Trash2 aria-hidden="true" />,
                            danger: true,
                            onSelect: () => setHapus(row),
                          },
                        ]}
                      />
                    </span>
                    )}
                  </td>
                </motion.tr>
              );
            })}
            </AnimatePresence>
            <tr aria-hidden="true" className="border-0">
              <td colSpan={item.kolom.length + 1} className="border-0 p-0 pt-2" />
            </tr>
            {terkunci ? null : multiCol ? (
              <AnimatePresence initial={false}>
              {pairs.map((pair, i) => (
                <tr key={pair.id} className="border-0 align-top">
                  {item.kolom.map((col) => (
                    <td key={col.id} className="border-0 px-1 py-2 align-top">
                      <SelAnimasi durasi={durasi}>
                      {col.id === multiCol.id ? (
                        <>
                          <Input
                            aria-label={`${col.label} ${i + 1}`}
                            value={pair.nama}
                            onChange={(event) => {
                              setPairs((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, nama: event.target.value } : p))
                              );
                              setTambahError(null);
                            }}
                            placeholder={`${col.label} ${i + 1}`}
                            disabled={tambahSaving}
                            className="h-11 min-w-[128px] border-transparent bg-black/[0.075] text-sm hover:border-transparent hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
                          />
                          {i === pairs.length - 1 && pairs.length < 20 && (
                            <button
                              type="button"
                              onClick={tambahPasangan}
                              disabled={tambahSaving}
                              className="mt-1.5 flex items-center gap-1 text-xs font-medium text-neutral-500 transition-soft hover:text-foreground disabled:opacity-50"
                            >
                              <Plus aria-hidden="true" className="size-3.5" />
                              Tambah {col.label}
                            </button>
                          )}
                        </>
                      ) : imageCol && col.id === imageCol.id ? (
                        <SelGambar
                          periode={periode}
                          kolom={col}
                          value={pair.gambar}
                          onChange={(value) => {
                            setPairs((prev) =>
                              prev.map((p, j) => (j === i ? { ...p, gambar: value } : p))
                            );
                            setTambahError(null);
                          }}
                          disabled={tambahSaving}
                          uniq={`tambah-gambar-${pair.id}`}
                          lindungiPaths={pathsGambar(barisOpt)}
                          tiket={`pair:${pair.id}`}
                          onTiket={daftarTiket}
                          onLepasTiket={lepasTiket}
                          formGen={formGenRef}
                        />
                      ) : i === 0 ? (
                        <SelInput
                          kolom={col}
                          value={tambah[col.id] ?? ""}
                          onChange={(value) => ubahTambah(col.id, value)}
                          disabled={tambahSaving}
                          uniq="tambah"
                          lindungiPaths={pathsGambar(barisOpt)}
                          periode={periode}
                          onTiket={daftarTiket}
                          onLepasTiket={lepasTiket}
                          formGen={formGenRef}
                        />
                      ) : col.tipe === "date" && tambah[col.id] ? (
                        <span className="block px-3.5 py-2.5 text-sm text-neutral-400">
                          {formatNilai(col, tambah[col.id])}
                        </span>
                      ) : null}
                      </SelAnimasi>
                    </td>
                  ))}
                  <td className="border-0 px-1 py-2 align-top">
                    <SelAnimasi durasi={durasi}>
                    {i === 0 ? (
                      <span className="flex justify-end">
                        <Button
                          onClick={() => void simpanTambah()}
                          disabled={tambahSaving || editSaving}
                          className="rounded-full"
                          aria-label="Tambah isian"
                        >
                          Tambah
                        </Button>
                      </span>
                    ) : (
                      <span className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => hapusPasangan(i)}
                          disabled={tambahSaving}
                          aria-label={`Hapus pasangan ${i + 1}`}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </span>
                    )}
                    </SelAnimasi>
                  </td>
                </tr>
              ))}
              </AnimatePresence>
            ) : (
            <tr className="border-0 align-top">
              {item.kolom.map((col) => (
                <td key={col.id} className="border-0 px-1 py-2 align-top">
                  <SelInput
                    kolom={col}
                    value={tambah[col.id] ?? ""}
                    onChange={(value) => ubahTambah(col.id, value)}
                    disabled={tambahSaving}
                    uniq="tambah"
                    lindungiPaths={pathsGambar(barisOpt)}
                    periode={periode}
                  />
                </td>
              ))}
              <td className="border-0 px-1 py-2 align-top">
                <span className="flex justify-end">
                  <Button
                    onClick={() => void simpanTambah()}
                    disabled={tambahSaving || editSaving}
                    className="rounded-full"
                    aria-label="Tambah isian"
                  >
                    Tambah
                  </Button>
                </span>
              </td>
            </tr>
            )}
          </tbody>
        </table>
      </div>

      {galat && (
        <p role="alert" className="mt-2 px-1 text-sm text-danger">
          {galat}
        </p>
      )}
      <ConfirmDialog
        open={hapus !== null}
        title="Hapus isian?"
        message="Jika isian ini dihapus, datanya hilang dan tidak ikut export."
        busy={hapusBusy}
        onCancel={() => setHapus(null)}
        onConfirm={() => void jalankanHapus()}
      />
    </RefListCard>
  );
}

// Tombol status di ujung kanan bawah, di luar kartu: Selesai menandai
// laporan bulan ini rampung agar siap direview (isian jadi baca-saja),
// Batalkan mengembalikannya agar bisa diubah lagi.
function TombolStatusLaporan({
  userId,
  periode,
  status,
  tugas,
  onStatus,
}: {
  userId: string;
  periode: Periode;
  status: MonthlyReviewStatus;
  tugas: TugasLaporan[];
  onStatus: (next: MonthlyReviewStatus) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  function sesiBerakhir(galat: unknown): boolean {
    if (galat instanceof SessionExpiredError || isSessionError(galat)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  // Pastikan baris review bulan ini ada (trigger hanya mengizinkan baris
  // baru berstatus menunggu; perubahan ke selesai lewat update sesudahnya).
  async function pastikanBaris(): Promise<boolean> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("monthly_reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("tahun", periode.tahun)
      .eq("bulan", periode.bulan)
      .maybeSingle();
    if (error) {
      if (sesiBerakhir(error)) return false;
      setGalat("Gagal memuat status laporan. Coba lagi.");
      return false;
    }
    if (!data) {
      const { error: tambahError } = await supabase
        .from("monthly_reviews")
        .insert({ user_id: userId, tahun: periode.tahun, bulan: periode.bulan });
      if (tambahError) {
        if (sesiBerakhir(tambahError)) return false;
        setGalat("Gagal memuat status laporan. Coba lagi.");
        return false;
      }
    }
    return true;
  }

  async function tandaiSelesai() {
    if (sibuk) return;
    // Kelengkapan dicek di sini (saat klik), bukan saat mengetik.
    const kurang: string[] = [];
    for (const item of tugas) {
      if (item.format === "judul") continue;
      if (item.format === "esai") {
        const baris = item.baris[0] ?? null;
        const adaKosong = item.kolom.some(
          (col) => ((baris?.nilai[col.id] ?? "").trim().length === 0)
        );
        if (adaKosong) kurang.push(item.judul);
      } else if (item.baris.length === 0) {
        kurang.push(item.judul);
      }
    }
    if (kurang.length > 0) {
      setGalat(`Masih belum lengkap: ${kurang.join(", ")}.`);
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      if (!(await pastikanBaris())) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("monthly_reviews")
        .update({ status: "selesai" })
        .eq("user_id", userId)
        .eq("tahun", periode.tahun)
        .eq("bulan", periode.bulan);
      if (error) {
        if (sesiBerakhir(error)) return;
        setGalat("Gagal mengubah status laporan. Coba lagi.");
        return;
      }
      onStatus("selesai");
      router.refresh();
    } finally {
      setSibuk(false);
    }
  }

  async function ubahStatus(next: MonthlyReviewStatus) {
    if (sibuk) return;
    setSibuk(true);
    setGalat(null);
    try {
      if (!(await pastikanBaris())) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("monthly_reviews")
        .update({ status: next })
        .eq("user_id", userId)
        .eq("tahun", periode.tahun)
        .eq("bulan", periode.bulan);
      if (error) {
        if (sesiBerakhir(error)) return;
        setGalat("Gagal mengubah status laporan. Coba lagi.");
        return;
      }
      onStatus(next);
      router.refresh();
    } finally {
      setSibuk(false);
    }
  }

  if (status === "approved") {
    return (
      <div className="mt-3 flex justify-end">
        <p className="px-1 text-sm text-neutral-500">Laporan sudah disetujui.</p>
      </div>
    );
  }

  const selesai = status === "selesai";
  return (
    <div className="mt-3 flex flex-col items-end gap-1">
      {selesai ? (
        <Button
          variant="secondary"
          onClick={() => void ubahStatus("menunggu")}
          disabled={sibuk}
          className="rounded-full"
          aria-label="Batalkan laporan selesai"
        >
          {sibuk ? "Menyimpan…" : "Batalkan"}
        </Button>
      ) : (
        <Button
          onClick={() => void tandaiSelesai()}
          disabled={sibuk}
          className="rounded-full"
          aria-label="Tandai laporan selesai"
        >
          {sibuk ? "Menyimpan…" : "Selesai"}
        </Button>
      )}
      {galat && (
        <p role="alert" className="px-1 text-sm text-danger">
          {galat}
        </p>
      )}
    </div>
  );
}

// Seksi pengisian laporan tambahan di halaman laporan user: daftar tugas
// wajib untuk satu periode bulan. Tugas tabel = tabel langsung
// (tambah/ubah/hapus baris mengikuti kolom admin); tugas esai = textarea.
// Status selesai/approved mengunci isian jadi baca-saja; revision kembali
// bisa diubah.
export function LaporanTambahanSection({
  userId,
  tugas,
  periode,
  statusAwal,
  revisiAwal = {},
  className,
}: {
  userId: string;
  tugas: TugasLaporan[];
  periode: Periode;
  statusAwal: MonthlyReviewStatus;
  /** Petunjuk baris → catatan revisi admin yang sedang aktif. */
  revisiAwal?: Record<string, string>;
  className?: string;
}) {
  const [status, setStatus] = useState<MonthlyReviewStatus>(statusAwal);
  const [prevStatus, setPrevStatus] = useState(statusAwal);
  if (prevStatus !== statusAwal) {
    setPrevStatus(statusAwal);
    setStatus(statusAwal);
  }
  if (tugas.length === 0) return null;

  const terkunci = status === "selesai" || status === "approved";

  return (
    <div className={className}>
      {tugas.map((item) => {
        if (item.format === "judul") {
          return (
            <div key={item.id} className="mt-4">
              <p className="text-sm font-semibold">{item.judul}</p>
              {item.deskripsi && (
                <p className="mt-1 text-sm whitespace-pre-wrap text-neutral-500">
                  {item.deskripsi}
                </p>
              )}
            </div>
          );
        }
        if (item.format === "esai") {
          return <EsaiIsian key={item.id} userId={userId} item={item} periode={periode} terkunci={terkunci} />;
        }
        return <TabelIsianCard key={item.id} userId={userId} item={item} periode={periode} terkunci={terkunci} revisi={revisiAwal} />;
      })}
      <TombolStatusLaporan
        userId={userId}
        periode={periode}
        status={status}
        tugas={tugas}
        onStatus={setStatus}
      />
    </div>
  );
}
