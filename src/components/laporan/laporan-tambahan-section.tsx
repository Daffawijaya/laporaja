"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GlassMenu } from "@/components/ui/glass-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefListCard } from "@/components/ui/ref-list-card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import {
  MAX_IMAGE_BYTES,
  getSignedImageUrl,
  removeStoragePaths,
  uploadKegiatanImage,
} from "@/lib/supabase/storage";
import { formatTanggalPanjang } from "@/components/laporan/types";
import { GambarNilaiTampil } from "@/components/laporan/gambar-nilai";
import {
  cleanNilai,
  parseGambarNilai,
  type BarisIsi,
  type KolomDef,
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
  userId,
  folderId,
  uniq,
  lindungiPaths = [],
}: {
  kolom: KolomDef;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  userId: string;
  folderId: string;
  uniq: string;
  /** Path gambar milik baris lain: jangan hapus dari storage (dipakai bersama). */
  lindungiPaths?: string[];
}) {
  if (kolom.tipe === "image") {
    return (
      <SelGambar
        userId={userId}
        folderId={folderId}
        kolom={kolom}
        value={value}
        onChange={onChange}
        disabled={disabled}
        uniq={uniq}
        lindungiPaths={lindungiPaths}
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
  return (
    <Input
      aria-label={kolom.label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      type={kolom.tipe === "date" ? "date" : kolom.tipe === "number" ? "number" : "text"}
      inputMode={kolom.tipe === "number" ? "decimal" : undefined}
      disabled={disabled}
      placeholder={kolom.label}
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
  userId,
  folderId,
  kolom,
  value,
  onChange,
  disabled,
  uniq,
  lindungiPaths = [],
}: {
  userId: string;
  folderId: string;
  kolom: KolomDef;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  uniq: string;
  /** Path gambar milik baris lain: jangan hapus dari storage (dipakai bersama). */
  lindungiPaths?: string[];
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
  const [mengunggah, setMengunggah] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const descId = useId();

  useEffect(() => {
    let hidup = true;
    if (!path) return;
    const supabase = createClient();
    void getSignedImageUrl(supabase, path).then((signed) => {
      if (hidup) setUrl(signed);
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
      const supabase = createClient();
      const pathBaru = await uploadKegiatanImage(supabase, userId, folderId, file);
      // Best effort: berkas lama dibuang saat diganti, kecuali dipakai
      // baris lain (hasil tambah banyak kegiatan sekaligus).
      if (path && path !== pathBaru && !lindungiPaths.includes(path)) {
        await removeStoragePaths(supabase, [path]);
      }
      tulis(pathBaru, deskripsi);
    } catch (err) {
      if (err instanceof SessionExpiredError || isSessionError(err)) {
        toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
        router.replace("/login?expired=1");
        return;
      }
      setGalat(err instanceof Error ? err.message : "Gagal mengunggah gambar. Coba lagi.");
    } finally {
      setMengunggah(false);
    }
  }

  async function hapusGambar() {
    if (!path || mengunggah || disabled) return;
    setMengunggah(true);
    try {
      // Berkas yang dipakai baris lain tidak ikut dibuang.
      if (!lindungiPaths.includes(path)) {
        const supabase = createClient();
        await removeStoragePaths(supabase, [path]);
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
      {path ? (
        <div className="flex items-center gap-2.5 rounded-2xl bg-black/[0.075] p-2.5 dark:bg-white/[0.075]">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={deskripsi || kolom.label}
              className="h-16 w-24 shrink-0 rounded-xl object-cover"
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
          <span className="text-[11px] text-neutral-500">PNG/JPG · maks {maksMb} MB</span>
        </div>
      )}
      <Input
        ref={fileRef}
        id={`${fileId}-${uniq}-${kolom.id}`}
        type="file"
        accept="image/*"
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

// Kartu isian esai: satu textarea per subjudul dalam satu baris user
// (buat sekali, simpan = tambah bila belum ada atau ubah bila sudah ada).
// Semua subjudul wajib diisi; kosongkan semua lalu Simpan untuk menghapus
// (kembali belum diisi).
function EsaiIsian({
  userId,
  item,
  periode,
}: {
  userId: string;
  item: TugasLaporan;
  periode: Periode;
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function sesiBerakhir(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  function setSatu(kolomId: string, value: string) {
    setIsi((prev) => ({ ...prev, [kolomId]: value }));
    setError(null);
  }

  async function handleSimpan() {
    if (saving || kolomList.length === 0) return;
    const cleaned = kolomList.map((col) => ({ col, nilai: (isi[col.id] ?? "").trim() }));
    const adaIsi = cleaned.some(({ nilai }) => nilai.length > 0);
    if (!adaIsi) {
      if (!baris) {
        setError(`Subjudul "${kolomList[0].label}" wajib diisi.`);
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("laporan_tambahan_baris")
          .delete()
          .eq("id", baris.id)
          .eq("user_id", userId);
        if (error) {
          if (sesiBerakhir(error)) return;
          setError("Gagal menghapus isian. Coba lagi.");
          return;
        }
        toast.success("Isian dihapus.");
        router.refresh();
      } finally {
        setSaving(false);
      }
      return;
    }
    for (const { col, nilai } of cleaned) {
      if (nilai.length === 0) {
        setError(`Subjudul "${col.label}" wajib diisi.`);
        return;
      }
      if (nilai.length > ESAI_MAKS) {
        setError(`Subjudul "${col.label}" maksimal ${ESAI_MAKS} karakter.`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      if (baris) {
        const { error } = await supabase.from("laporan_tambahan_nilai").upsert(
          cleaned.map(({ col, nilai }) => ({
            baris_id: baris.id,
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
        toast.success("Isian diperbarui.");
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
        toast.success("Isian ditambahkan.");
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

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
              disabled={saving}
            />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 px-1 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end px-1">
        <Button onClick={handleSimpan} disabled={saving} className="w-full sm:w-auto">
          {saving ? "Menyimpan..." : "Simpan isian"}
        </Button>
      </div>
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
}: {
  userId: string;
  item: TugasLaporan;
  periode: Periode;
}) {
  const router = useRouter();
  const toast = useToast();
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
    if (berkas && !pathsGambar(item.baris).includes(berkas)) {
      void removeStoragePaths(createClient(), [berkas]).catch(() => undefined);
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
    setEditId(row.id);
    setEditVals({ ...row.nilai });
    setEditError(null);
    setTambahError(null);
  }

  async function simpanTambah() {
    if (tambahSaving || editSaving) return;
    // Pasangan sebaris: tiap nama kegiatan + gambarnya jadi satu baris.
    // Pasangan yang keduanya kosong diabaikan.
    let pasangan: { nama: string; gambar: string }[] | null = null;
    if (multiCol) {
      const semua = pairs.map((p) => ({
        nama: p.nama.trim(),
        gambar: imageCol ? p.gambar : "",
      }));
      pasangan = semua.filter((p) => p.nama.length > 0 || p.gambar.length > 0);
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
    setTambahSaving(true);
    setTambahError(null);
    try {
      const supabase = createClient();
      const { data: barisBaru, error: barisError } = await supabase
        .from("laporan_tambahan_baris")
        .insert(
          bersih.map(() => ({
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
        barisBaru.flatMap((baris, i) =>
          item.kolom.map((col) => ({
            baris_id: baris.id,
            kolom_id: col.id,
            nilai: bersih[i][col.id] ?? "",
          }))
        )
      );
      if (nilaiError) {
        await supabase.from("laporan_tambahan_baris").delete().in(
          "id",
          barisBaru.map((b) => b.id)
        );
        setTambahError("Gagal menyimpan. Coba lagi.");
        return;
      }
      // Tanggal tetap terisi untuk kegiatan berikutnya; keterangan dan
      // gambar dikosongkan lagi. Gambar tetap wajib per baris.
      const tanggalTetap: Record<string, string> = {};
      for (const col of item.kolom) {
        if (col.tipe === "date" && tambah[col.id]) tanggalTetap[col.id] = tambah[col.id];
      }
      setTambah(tanggalTetap);
      setPairs([{ id: nextPairId(), nama: "", gambar: "" }]);
      toast.success(
        bersih.length > 1 ? `${bersih.length} isian ditambahkan.` : "Isian ditambahkan."
      );
      router.refresh();
    } finally {
      setTambahSaving(false);
    }
  }

  async function simpanUbah(rowId: string) {
    if (editSaving) return;
    let cleaned: Record<string, string>;
    try {
      cleaned = cleanNilai(item.kolom, editVals);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Isian belum valid.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
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
      setEditId(null);
      toast.success("Isian diperbarui.");
      router.refresh();
    } finally {
      setEditSaving(false);
    }
  }

  async function jalankanHapus() {
    if (!hapus || hapusBusy) return;
    setHapusBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("laporan_tambahan_baris")
        .delete()
        .eq("id", hapus.id)
        .eq("user_id", userId);
      if (error) {
        if (sesiBerakhir(error)) return;
        toast.error("Gagal menghapus isian. Coba lagi.");
        return;
      }
      // Best effort: berkas gambar ikut dibuang agar tidak yatim, kecuali
      // masih dipakai baris lain (tambah banyak kegiatan sekaligus).
      const dipakaiLain = new Set(
        pathsGambar(item.baris.filter((row) => row.id !== hapus.id))
      );
      const paths = item.kolom
        .filter((col) => col.tipe === "image")
        .map((col) => parseGambarNilai(hapus.nilai[col.id] ?? "")?.gambar ?? "")
        .filter((path) => path.length > 0 && !dipakaiLain.has(path));
      if (paths.length > 0) {
        await removeStoragePaths(createClient(), paths);
      }
      if (editId === hapus.id) setEditId(null);
      setHapus(null);
      toast.success("Isian dihapus.");
      router.refresh();
    } finally {
      setHapusBusy(false);
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
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="w-24 px-1 py-2 text-right text-xs font-normal text-neutral-500 dark:text-neutral-400"
              >
                Aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {item.baris.map((row) =>
              editId === row.id ? (
                <tr key={row.id} className="border-b border-neutral-200/70 bg-accent/5 align-middle dark:border-white/10">
                  {item.kolom.map((col) => (
                    <td key={col.id} className="px-1 py-3 align-middle">
                      <SelInput
                        kolom={col}
                        value={editVals[col.id] ?? ""}
                        onChange={(value) => ubahEdit(col.id, value)}
                        disabled={editSaving}
                        userId={userId}
                        folderId={item.id}
                        uniq={`edit-${row.id}`}
                        lindungiPaths={pathsGambar(item.baris.filter((r) => r.id !== editId))}
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
                </tr>
              ) : (
                <tr key={row.id} className="border-b border-neutral-200/70 align-middle dark:border-white/10">
                  {item.kolom.map((col) => (
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
                    </td>
                  ))}
                  <td className="px-1 py-3 align-middle">
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
                  </td>
                </tr>
              )
            )}
            <tr aria-hidden="true" className="border-0">
              <td colSpan={item.kolom.length + 1} className="border-0 p-0 pt-2" />
            </tr>
            {multiCol ? (
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
                          userId={userId}
                          folderId={item.id}
                          kolom={col}
                          value={pair.gambar}
                          onChange={(value) => {
                            setPairs((prev) =>
                              prev.map((p, j) => (j === i ? { ...p, gambar: value } : p))
                            );
                            setTambahError(null);
                          }}
                          disabled={tambahSaving}
                          uniq={`tambah-gambar-${i}`}
                          lindungiPaths={pathsGambar(item.baris)}
                        />
                      ) : i === 0 ? (
                        <SelInput
                          kolom={col}
                          value={tambah[col.id] ?? ""}
                          onChange={(value) => ubahTambah(col.id, value)}
                          disabled={tambahSaving}
                          userId={userId}
                          folderId={item.id}
                          uniq="tambah"
                          lindungiPaths={pathsGambar(item.baris)}
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
                          {tambahSaving ? "Menyimpan…" : "Tambah"}
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
                    userId={userId}
                    folderId={item.id}
                    uniq="tambah"
                    lindungiPaths={pathsGambar(item.baris)}
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
                    {tambahSaving ? "Menyimpan…" : "Tambah"}
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

// Seksi pengisian laporan tambahan di halaman laporan user: daftar tugas
// wajib untuk satu periode bulan. Tugas tabel = tabel langsung
// (tambah/ubah/hapus baris mengikuti kolom admin); tugas esai = textarea.
export function LaporanTambahanSection({
  userId,
  tugas,
  periode,
  className,
}: {
  userId: string;
  tugas: TugasLaporan[];
  periode: Periode;
  className?: string;
}) {
  if (tugas.length === 0) return null;

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
          return <EsaiIsian key={item.id} userId={userId} item={item} periode={periode} />;
        }
        return <TabelIsianCard key={item.id} userId={userId} item={item} periode={periode} />;
      })}
    </div>
  );
}
