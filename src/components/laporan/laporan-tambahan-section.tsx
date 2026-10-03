"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
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

function FieldInput({
  kolom,
  index,
  value,
  onChange,
  disabled,
  userId,
  folderId,
}: {
  kolom: KolomDef;
  index: number;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  userId: string;
  folderId: string;
}) {
  const id = `baris-${kolom.id}-${index}`;
  const label = `${kolom.label}${kolom.wajib ? "" : " (opsional)"}`;
  if (kolom.tipe === "image") {
    return (
      <GambarField
        userId={userId}
        folderId={folderId}
        kolom={kolom}
        index={index}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }
  if (kolom.tipe === "textarea") {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          disabled={disabled}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={kolom.tipe === "date" ? "date" : kolom.tipe === "number" ? "number" : "text"}
        inputMode={kolom.tipe === "number" ? "decimal" : undefined}
        disabled={disabled}
      />
    </div>
  );
}

// Isian kolom gambar: satu upload berkas + satu deskripsi. Nilai disimpan
// sebagai JSON {"gambar": path storage, "deskripsi": teks}; keduanya wajib.
function GambarField({
  userId,
  folderId,
  kolom,
  index,
  value,
  onChange,
  disabled,
}: {
  userId: string;
  folderId: string;
  kolom: KolomDef;
  index: number;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const parsed = parseGambarNilai(value);
  const path = parsed?.gambar ?? "";
  const deskripsi = parsed?.deskripsi ?? "";
  const [url, setUrl] = useState<string | null>(null);
  const [prevPath, setPrevPath] = useState(path);
  // Reset pratinjau saat path berganti (pola render-phase sync).
  if (prevPath !== path) {
    setPrevPath(path);
    setUrl(null);
  }
  const [mengunggah, setMengunggah] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

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
      // Best effort: berkas lama dibuang saat diganti.
      if (path && path !== pathBaru) {
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
      const supabase = createClient();
      await removeStoragePaths(supabase, [path]);
    } finally {
      tulis("", deskripsi);
      setMengunggah(false);
    }
  }

  const sibuk = disabled || mengunggah;
  return (
    <div className="flex flex-col gap-2">
      <Label>{kolom.label}</Label>
      {path ? (
        <div className="flex items-start gap-3">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={deskripsi || kolom.label}
              className="h-24 w-32 rounded-md object-cover"
            />
          ) : (
            <span className="text-xs text-neutral-500">Memuat gambar…</span>
          )}
          <span className="flex gap-1">
            <Button
              type="button"
              variant="secondary"
              disabled={sibuk}
              onClick={() => document.getElementById(`gambar-${kolom.id}-${index}`)?.click()}
            >
              Ganti
            </Button>
            <Button type="button" variant="ghost" disabled={sibuk} onClick={hapusGambar}>
              <Trash2 aria-hidden="true" />
              <span className="sr-only">Hapus gambar</span>
            </Button>
          </span>
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Belum ada gambar.</p>
      )}
      <Input
        id={`gambar-${kolom.id}-${index}`}
        type="file"
        accept="image/*"
        disabled={sibuk}
        onChange={(event) => {
          void pilihBerkas(event.target.files?.[0]);
          event.target.value = "";
        }}
        className={path ? "hidden" : undefined}
      />
      <Label htmlFor={`gambar-deskripsi-${kolom.id}-${index}`}>Deskripsi gambar</Label>
      <Input
        id={`gambar-deskripsi-${kolom.id}-${index}`}
        value={deskripsi}
        onChange={(event) => tulis(path, event.target.value)}
        placeholder="Tulis deskripsi gambar."
        disabled={sibuk}
      />
      {galat && (
        <p role="alert" className="text-sm text-danger">
          {galat}
        </p>
      )}
      {mengunggah && <p className="text-xs text-neutral-500">Mengunggah…</p>}
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
      <div className="flex items-center justify-between gap-3 px-1 pb-3">
        <span className="text-xs text-neutral-500">
          Wajib diisi · {kolomList.length} subjudul
        </span>
        <span
          className={
            item.terisi
              ? "text-xs font-medium text-emerald-700 dark:text-emerald-300"
              : "text-xs font-medium text-amber-700 dark:text-amber-300"
          }
        >
          {item.terisi ? "Sudah diisi" : "Belum diisi"}
        </span>
      </div>
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
      <p className="mt-2 px-1 text-xs text-neutral-500">
        Kosongkan semua lalu Simpan untuk menghapus isian.
      </p>
    </RefListCard>
  );
}

// Seksi pengisian laporan tambahan di halaman laporan user: daftar tugas
// wajib untuk satu periode bulan. Tugas tabel = tambah/ubah/hapus baris
// isian mengikuti kolom admin; tugas esai = satu textarea.
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
  const router = useRouter();
  const toast = useToast();
  const reduceMotion = !!useReducedMotion();
  const [laporanId, setLaporanId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<BarisIsi | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    judul: string;
    baris: BarisIsi;
    kolom: KolomDef[];
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Tutup form inline pakai Escape.
  useEffect(() => {
    if (!laporanId) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLaporanId(null);
        setEditTarget(null);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [laporanId]);

  if (tugas.length === 0) return null;

  const aktif = tugas.find((item) => item.id === laporanId) ?? null;

  function setField(kolomId: string, value: string) {
    setForm((prev) => ({ ...prev, [kolomId]: value }));
    setFormError(null);
  }

  function scrollToForm(id: string) {
    window.setTimeout(() => {
      document
        .getElementById(`laporan-form-${id}`)
        ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    }, 60);
  }

  function closeForm() {
    setLaporanId(null);
    setEditTarget(null);
    setFormError(null);
  }

  function openAdd(item: TugasLaporan) {
    // Toggle: klik lagi saat form tambah sudah terbuka = tutup.
    if (laporanId === item.id && editTarget === null) {
      closeForm();
      return;
    }
    setLaporanId(item.id);
    setEditTarget(null);
    setForm({});
    setFormError(null);
    scrollToForm(item.id);
  }

  function openEdit(item: TugasLaporan, row: BarisIsi) {
    setLaporanId(item.id);
    setEditTarget(row);
    setForm({ ...row.nilai });
    setFormError(null);
    scrollToForm(item.id);
  }

  function handleSession(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !aktif) return;
    let cleaned: Record<string, string>;
    try {
      cleaned = cleanNilai(aktif.kolom, form);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Isian belum valid.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      if (editTarget) {
        const { error } = await supabase
          .from("laporan_tambahan_nilai")
          .upsert(
            aktif.kolom.map((col) => ({
              baris_id: editTarget.id,
              kolom_id: col.id,
              nilai: cleaned[col.id] ?? "",
            })),
            { onConflict: "baris_id,kolom_id" }
          );
        if (error) {
          if (handleSession(error)) return;
          setFormError("Gagal menyimpan. Coba lagi.");
          return;
        }
        toast.success("Isian diperbarui.");
      } else {
        const { data: baris, error: barisError } = await supabase
          .from("laporan_tambahan_baris")
          .insert({ laporan_id: aktif.id, user_id: userId, bulan: periode.bulan, tahun: periode.tahun })
          .select("id")
          .single();
        if (barisError || !baris) {
          if (handleSession(barisError)) return;
          setFormError("Gagal menyimpan. Coba lagi.");
          return;
        }
        const { error: nilaiError } = await supabase.from("laporan_tambahan_nilai").insert(
          aktif.kolom.map((col) => ({
            baris_id: baris.id,
            kolom_id: col.id,
            nilai: cleaned[col.id] ?? "",
          }))
        );
        if (nilaiError) {
          await supabase.from("laporan_tambahan_baris").delete().eq("id", baris.id);
          setFormError("Gagal menyimpan. Coba lagi.");
          return;
        }
        toast.success("Isian ditambahkan.");
      }
      setLaporanId(null);
      setEditTarget(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("laporan_tambahan_baris")
        .delete()
        .eq("id", deleteTarget.baris.id)
        .eq("user_id", userId);
      if (error) {
        if (handleSession(error)) return;
        toast.error("Gagal menghapus isian. Coba lagi.");
        return;
      }
      // Best effort: berkas gambar ikut dibuang agar tidak yatim.
      const paths = deleteTarget.kolom
        .filter((col) => col.tipe === "image")
        .map((col) => parseGambarNilai(deleteTarget.baris.nilai[col.id] ?? "")?.gambar ?? "")
        .filter((path) => path.length > 0);
      if (paths.length > 0) {
        await removeStoragePaths(createClient(), paths);
      }
      setDeleteTarget(null);
      toast.success("Isian dihapus.");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

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
        const isOpen = aktif?.id === item.id;
        const isEditing = isOpen && editTarget !== null;
        return (
          <RefListCard
            key={item.id}
            ariaLabel={`Section ${item.judul}`}
            title={item.judul}
            className="mt-4"
          >
            <div className="flex items-center justify-between gap-3 px-1 pb-3">
              <span className="text-xs text-neutral-500">
                Wajib diisi · {item.baris.length} baris
              </span>
              <span
                className={
                  item.terisi
                    ? "text-xs font-medium text-emerald-700 dark:text-emerald-300"
                    : "text-xs font-medium text-amber-700 dark:text-amber-300"
                }
              >
                {item.terisi ? "Sudah diisi" : "Belum diisi"}
              </span>
            </div>
            {item.deskripsi && (
              <p className="px-1 pb-3 text-xs whitespace-pre-wrap text-neutral-500">
                {item.deskripsi}
              </p>
            )}

            {item.baris.length === 0 ? (
              <EmptyState
                title="Belum ada isian"
                description="Tambahkan baris pertama isian."
                action={
                  <Button onClick={() => openAdd(item)}>
                    <Plus aria-hidden="true" />
                    {isOpen ? "Tutup" : "Tambah Isian"}
                  </Button>
                }
              />
            ) : (
              <>
                <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
                  {item.baris.map((row, index) => {
                    const kolomPertama = item.kolom[0];
                    const ringkas = kolomPertama
                      ? kolomPertama.tipe === "image"
                        ? (parseGambarNilai(row.nilai[kolomPertama.id] ?? "")?.deskripsi || "Gambar")
                        : row.nilai[kolomPertama.id] || `Baris ${index + 1}`
                      : `Baris ${index + 1}`;
                    return (
                      <li key={row.id} className="px-1 py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-medium">
                            <span className="mr-2 text-neutral-500">{index + 1}.</span>
                            {ringkas}
                          </p>
                          <span className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              onClick={() => openEdit(item, row)}
                              aria-label={`Ubah isian ${index + 1}`}
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => setDeleteTarget({ judul: item.judul, baris: row, kolom: item.kolom })}
                              aria-label={`Hapus isian ${index + 1}`}
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </span>
                        </div>
                        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                          {item.kolom.map((col) => (
                            <div key={col.id} className="contents">
                              <dt className="text-neutral-500">{col.label}</dt>
                              <dd className="whitespace-pre-wrap">
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
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </li>
                    );
                  })}
                </ul>
                {!isOpen && (
                  <div className="mt-3 flex justify-end">
                    <Button onClick={() => openAdd(item)} className="rounded-full">
                      <Plus aria-hidden="true" />
                      Tambah
                    </Button>
                  </div>
                )}
              </>
            )}

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key={`form-${item.id}`}
                  id={`laporan-form-${item.id}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: reduceMotion ? 0.15 : 0.28,
                    ease: [0.32, 0.72, 0, 1],
                  }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 rounded-2xl border border-neutral-200/70 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        {isEditing ? "Ubah isian" : "Tambah isian"}
                      </p>
                      <span className="text-xs text-neutral-500">
                        {item.kolom.length} kolom
                      </span>
                    </div>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                      {item.kolom.map((col, index) => (
                        <FieldInput
                          key={col.id}
                          kolom={col}
                          index={index}
                          value={form[col.id] ?? ""}
                          onChange={(value) => setField(col.id, value)}
                          disabled={saving}
                          userId={userId}
                          folderId={item.id}
                        />
                      ))}
                      {formError && (
                        <p role="alert" className="text-sm text-danger">
                          {formError}
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={closeForm}
                          disabled={saving}
                        >
                          Batal
                        </Button>
                        <Button type="submit" disabled={saving}>
                          {saving ? "Menyimpan..." : "Simpan"}
                        </Button>
                      </div>
                    </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </RefListCard>
        );
      })}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus isian?"
        message="Jika isian ini dihapus, datanya hilang dan tidak ikut export."
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
