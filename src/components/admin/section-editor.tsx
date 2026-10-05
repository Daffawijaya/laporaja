"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, Reorder, motion, useDragControls } from "motion/react";
import { ChevronDown, Copy, GripHorizontal, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassSelect } from "@/components/ui/glass-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { setSimpanStatus } from "@/lib/simpan-status";
import { useSectionPending } from "@/lib/section-pending";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import type { KolomTipe } from "@/lib/laporan-tambahan/queries";
import type { BuilderItem } from "@/lib/laporan-tambahan/queries";

export const TIPE_OPTIONS: { value: KolomTipe; label: string }[] = [
  { value: "text", label: "Isian" },
  { value: "textarea", label: "Paragraf" },
  { value: "date", label: "Tanggal" },
  { value: "number", label: "Angka" },
  { value: "image", label: "Gambar" },
];

export function labelTipe(tipe: KolomTipe): string {
  return TIPE_OPTIONS.find((opsi) => opsi.value === tipe)?.label ?? tipe;
}

export function editorKey(item: Pick<BuilderItem, "kind" | "id">): string {
  return `${item.kind}-${item.id}`;
}

interface KolomDraft {
  key: number;
  /** Id baris DB; null = baris baru yang belum tersimpan. */
  id: string | null;
  label: string;
  tipe: KolomTipe;
  /** Satuan isian (format indikator), "" bila tanpa satuan. */
  satuan: string;
}

let kolomSeq = 0;
function kolomBaru(label = "", id: string | null = null, tipe: KolomTipe = "text", satuan = ""): KolomDraft {
  kolomSeq += 1;
  return { key: kolomSeq, id, label, tipe, satuan };
}

function keDraft(kolom: { id: string; label: string; tipe: KolomTipe; satuan: string }[]): KolomDraft[] {
  return kolom.length > 0
    ? kolom.map((col) => kolomBaru(col.label, col.id, col.tipe, col.satuan))
    : [kolomBaru()];
}

// Potret draft untuk banding kotor vs tersimpan.
function snapOf(judul: string, deskripsi: string, kolom: KolomDraft[]): string {
  return JSON.stringify({
    j: judul.trim(),
    d: deskripsi.trim(),
    k: kolom.map((col) => [col.id, col.label.trim(), col.tipe, col.satuan.trim()]),
  });
}

function sesiBerakhir(
  toast: ReturnType<typeof useToast>,
  router: { replace: (url: string) => void },
  error: unknown
): boolean {
  if (error instanceof SessionExpiredError || isSessionError(error)) {
    toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
    router.replace("/login?expired=1");
    return true;
  }
  return false;
}

// Baris-baris editor kolom ala Google Forms: label + tipe + hapus.
// Untuk esai, tipe dikunci (auto esai) dan yang disunting hanya subjudul.
function KolomRows({
  kolom,
  onPatch,
  onRemove,
  onAdd,
  disabled,
  terpilih,
  satuan = "Kolom",
  tambahLabel = "Tambah Kolom",
  kunciTipe = null,
  tipeTerkunci = null,
  denganSatuan = false,
}: {
  kolom: KolomDraft[];
  onPatch: (key: number, patch: Partial<KolomDraft>) => void;
  onRemove: (key: number) => void;
  onAdd: () => void;
  disabled: boolean;
  terpilih: boolean;
  satuan?: string;
  tambahLabel?: string;
  kunciTipe?: KolomTipe | null;
  /** Tipe terkunci tapi tata letak tetap tabel (indikator = selalu Angka). */
  tipeTerkunci?: KolomTipe | null;
  /** Entri tersusun vertikal per baris (nama + satuan) khusus indikator. */
  denganSatuan?: boolean;
}) {
  if (kunciTipe) {
    // Esai: subjudul ditumpuk ke bawah, tombol hapus tepat di kanan input.
    return (
      <div>
        <div className="flex flex-col gap-2 px-1">
          {kolom.map((col, index) => (
            <div key={col.key} className="flex items-center gap-1">
              <Label htmlFor={`ekolom-${col.key}`} className="sr-only">
                {`${satuan} ${index + 1}`}
              </Label>
              <Input
                id={`ekolom-${col.key}`}
                value={col.label}
                onChange={(event) => onPatch(col.key, { label: event.target.value })}
                placeholder={`${satuan} ${index + 1}`}
                disabled={disabled}
                className="h-11 min-w-0 flex-1 border-transparent bg-black/[0.075] text-sm hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
              />
              <AnimatePresence initial={false}>
                {terpilih && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="inline-flex shrink-0 overflow-hidden"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemove(col.key)}
                      disabled={disabled || kolom.length <= 1}
                      aria-label={`Hapus ${satuan.toLowerCase()} ${index + 1}`}
                      className="shrink-0 rounded-full"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {terpilih && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-2 flex justify-end px-1">
                <Button
                  type="button"
                  onClick={onAdd}
                  disabled={disabled}
                  className="rounded-full"
                >
                  <Plus aria-hidden="true" />
                  {tambahLabel}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (denganSatuan) {
    // Indikator: tiap entri satu baris ke bawah (nama + satuan), tipe
    // terkunci Angka. Nanti user tinggal mengisi angka per entri.
    return (
      <div>
        <div className="flex flex-col gap-2 px-1">
          {kolom.map((col, index) => (
            <div key={col.key} className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <Label htmlFor={`ekolom-${col.key}`} className="sr-only">
                  {`Nama indikator ${index + 1}`}
                </Label>
                <Input
                  id={`ekolom-${col.key}`}
                  value={col.label}
                  onChange={(event) => onPatch(col.key, { label: event.target.value })}
                  placeholder={`Indikator ${index + 1}`}
                  disabled={disabled}
                  className="h-11 w-full border-transparent bg-black/[0.075] text-sm hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
                />
              </div>
              <div className="w-32 shrink-0">
                <Label htmlFor={`esatuan-${col.key}`} className="sr-only">
                  {`Satuan indikator ${index + 1}`}
                </Label>
                <Input
                  id={`esatuan-${col.key}`}
                  value={col.satuan}
                  onChange={(event) => onPatch(col.key, { satuan: event.target.value })}
                  placeholder="Satuan"
                  disabled={disabled}
                  maxLength={40}
                  className="h-11 w-full border-transparent bg-black/[0.075] text-sm hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
                />
              </div>
              <AnimatePresence initial={false}>
                {terpilih && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="inline-flex shrink-0 overflow-hidden"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemove(col.key)}
                      disabled={disabled || kolom.length <= 1}
                      aria-label={`Hapus indikator ${index + 1}`}
                      className="shrink-0 rounded-full"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {terpilih && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-2 flex justify-end px-1">
                <Button
                  type="button"
                  onClick={onAdd}
                  disabled={disabled}
                  className="rounded-full"
                >
                  <Plus aria-hidden="true" />
                  {tambahLabel}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200/70 dark:border-white/10">
              {kolom.map((col, index) => (
                <th
                  key={col.key}
                  scope="col"
                  className="min-w-36 px-1 py-2 text-left align-top"
                >
                  <Label htmlFor={`ekolom-${col.key}`} className="sr-only">
                    {`${satuan} ${index + 1}`}
                  </Label>
                  <Input
                    id={`ekolom-${col.key}`}
                    value={col.label}
                    onChange={(event) => onPatch(col.key, { label: event.target.value })}
                    placeholder={`${satuan} ${index + 1}`}
                    disabled={disabled}
                    className="h-11 w-full border-transparent bg-black/[0.075] text-sm hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
                  />
                </th>
              ))}
            </tr>
            <tr>
              {kolom.map((col, index) => (
                <td key={col.key} className="px-1 py-2">
                  <span className="flex items-center gap-1">
                    {kunciTipe ? (
                      <span className="min-w-0 flex-1 px-1 text-xs text-neutral-500">
                        Esai · teks panjang
                      </span>
                    ) : tipeTerkunci ? (
                      <span className="min-w-0 flex-1 px-1 text-xs text-neutral-500">
                        {labelTipe(tipeTerkunci)}
                      </span>
                    ) : (
                      <GlassSelect
                        ariaLabel={`Bentuk isian kolom ${index + 1}`}
                        value={col.tipe}
                        onChange={(value) => onPatch(col.key, { tipe: value as KolomTipe })}
                        options={TIPE_OPTIONS}
                        disabled={disabled}
                        className="min-w-0 flex-1"
                      />
                    )}
                    <AnimatePresence initial={false}>
                      {terpilih && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.2 }}
                          className="inline-flex shrink-0 overflow-hidden"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onRemove(col.key)}
                            disabled={disabled || kolom.length <= 1}
                            aria-label={`Hapus ${satuan.toLowerCase()} ${index + 1}`}
                            className="shrink-0 rounded-full"
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </motion.span>
                      )}
                    </AnimatePresence>
                    </span>
                  </td>
              ))}
            </tr>
          </thead>
        </table>
      </div>
      <AnimatePresence initial={false}>
        {terpilih && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex justify-end px-1">
              <Button
                type="button"
                onClick={onAdd}
                disabled={disabled}
                className="rounded-full"
              >
                <Plus aria-hidden="true" />
                {tambahLabel}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const INFO_BARIS = [
  { kunci: "bulan", label: "Bulan", sunting: false },
  { kunci: "tahun", label: "Tahun", sunting: false },
  { kunci: "nama", label: "Nama", sunting: false },
  { kunci: "jabatan", label: "Jabatan", sunting: true },
  { kunci: "unit_kerja", label: "Unit kerja", sunting: true },
] as const;

// Isian kartu Info: baris dokumentasi (mengikuti data user) + Jabatan dan
// Unit kerja yang bisa diketik dan tersimpan otomatis.
function InfoIsianCard({
  jabatanAwal,
  unitAwal,
}: {
  jabatanAwal: string;
  unitAwal: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [jabatan, setJabatan] = useState(jabatanAwal);
  const [unit, setUnit] = useState(unitAwal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prev, setPrev] = useState(`${jabatanAwal}|${unitAwal}`);
  const sig = `${jabatanAwal}|${unitAwal}`;
  const snap = JSON.stringify({ j: jabatan.trim(), u: unit.trim() });
  const [savedSnap, setSavedSnap] = useState(snap);
  if (prev !== sig) {
    setPrev(sig);
    setJabatan(jabatanAwal);
    setUnit(unitAwal);
    setSavedSnap(JSON.stringify({ j: jabatanAwal.trim(), u: unitAwal.trim() }));
  }

  const masalah = (() => {
    const j = jabatan.trim();
    const u = unit.trim();
    if (j.length < 1 || j.length > 120) return "Jabatan harus 1-120 karakter.";
    if (u.length === 0) return "Unit kerja wajib diisi.";
    if (u.length > 200) return "Unit kerja maksimal 200 karakter.";
    return null;
  })();

  const simpan = useCallback(
    async (snapAwal: { j: string; u: string }) => {
      setSaving(true);
      setError(null);
      setSimpanStatus("saving");
      let berhasil = false;
      try {
        const supabase = createClient();
        const [r1, r2] = await Promise.all([
          supabase
            .from("pengaturan")
            .upsert({ kunci: "jabatan_awalan", nilai: snapAwal.j }, { onConflict: "kunci" }),
          supabase
            .from("pengaturan")
            .upsert({ kunci: "unit_kerja", nilai: snapAwal.u }, { onConflict: "kunci" }),
        ]);
        const gagal = r1.error ?? r2.error;
        if (gagal) {
          if (gagal instanceof SessionExpiredError || isSessionError(gagal)) {
            toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
            router.replace("/login?expired=1");
            return;
          }
          setError("Gagal menyimpan. Coba lagi.");
          return;
        }
        setSavedSnap(JSON.stringify(snapAwal));
        berhasil = true;
      } finally {
        setSaving(false);
        setSimpanStatus(berhasil ? "saved" : "error");
      }
    },
    [router, toast]
  );

  useEffect(() => {
    if (snap === savedSnap || masalah || saving) return;
    const timer = window.setTimeout(() => {
      void simpan({ j: jabatan.trim(), u: unit.trim() });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [snap, savedSnap, masalah, saving, simpan, jabatan, unit]);

  return (
    <div>
      <ul>
        {INFO_BARIS.map((baris, index) => {
          const pad =
            index === 0
              ? "px-1 pb-1"
              : index === INFO_BARIS.length - 1
                ? "px-1 pt-1"
                : "px-1 py-1";
          const nilai =
            baris.kunci === "jabatan" ? jabatan : baris.kunci === "unit_kerja" ? unit : baris.label;
          return (
            <li key={baris.kunci} className={pad}>
              <Label htmlFor={`info-${baris.label}`} className="sr-only">
                {baris.label}
              </Label>
              <Input
                id={`info-${baris.label}`}
                value={nilai}
                onChange={
                  baris.sunting
                    ? (event) => {
                        if (baris.kunci === "jabatan") setJabatan(event.target.value);
                        else setUnit(event.target.value);
                        setError(null);
                      }
                    : undefined
                }
                disabled={!baris.sunting}
                placeholder={baris.sunting ? baris.label : undefined}
                className="h-11 w-full min-w-0 flex-1 border-transparent bg-black/[0.075] text-sm hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
              />
            </li>
          );
        })}
      </ul>
      {(error ?? masalah) && (
        <p role="alert" className="mt-2 px-1 text-sm text-danger">
          {error ?? masalah}
        </p>
      )}
    </div>
  );
}



// Kartu Info statis di atas tumpukan (bukan section, tidak bisa
// digeser/dihapus): jabatan dan unit kerja tersimpan otomatis.
// Bisa "dipilih" sebagai posisi 0 supaya tambah section jatuh tepat di
// bawahnya.
export function InfoCard({
  judulAwal,
  jabatanAwal,
  unitAwal,
  onPilih,
}: {
  judulAwal: string;
  jabatanAwal: string;
  unitAwal: string;
  onPilih: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [judul, setJudul] = useState(judulAwal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terbuka, setTerbuka] = useState(true);

  const [prev, setPrev] = useState(judulAwal);
  if (prev !== judulAwal) {
    setPrev(judulAwal);
    setJudul(judulAwal);
  }
  const snap = judul.trim();
  const [savedSnap, setSavedSnap] = useState(judulAwal.trim());
  const masalah =
    snap.length < 1 || snap.length > 120 ? "Judul harus 1-120 karakter." : null;

  const simpan = useCallback(
    async (nilai: string) => {
      setSaving(true);
      setError(null);
      setSimpanStatus("saving");
      let berhasil = false;
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("pengaturan")
          .upsert({ kunci: "info_judul", nilai }, { onConflict: "kunci" });
        if (error) {
          if (error instanceof SessionExpiredError || isSessionError(error)) {
            toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
            router.replace("/login?expired=1");
            return;
          }
          setError("Gagal menyimpan. Coba lagi.");
          return;
        }
        setSavedSnap(nilai);
        berhasil = true;
      } finally {
        setSaving(false);
        setSimpanStatus(berhasil ? "saved" : "error");
      }
    },
    [router, toast]
  );

  useEffect(() => {
    if (snap === savedSnap || masalah || saving) return;
    const timer = window.setTimeout(() => {
      void simpan(snap);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [snap, savedSnap, masalah, saving, simpan]);

  return (
    <div
      className="ref-card p-4"
      data-kartu-section
      data-section-key="info"
      onPointerDown={onPilih}
      onFocusCapture={onPilih}
    >
      <div className="flex items-center gap-2">
        <Label htmlFor="info-judul" className="sr-only">
          Judul info
        </Label>
        <Input
          id="info-judul"
          value={judul}
          onChange={(event) => {
            setJudul(event.target.value);
            setError(null);
          }}
          placeholder="Judul info"
          className="h-auto min-w-0 flex-1 rounded-none border-0 border-b border-neutral-300 bg-transparent px-1 pt-0 pb-1 text-[17px] leading-none font-semibold tracking-tight placeholder:text-neutral-400 hover:border-neutral-400 hover:bg-transparent focus-visible:border-accent focus-visible:ring-0 dark:border-white/15 dark:hover:bg-transparent"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setTerbuka((v) => !v)}
          aria-expanded={terbuka}
          aria-label={terbuka ? "Tutup isian info" : "Buka isian info"}
          className="shrink-0 rounded-full"
        >
          <motion.span
            animate={{ rotate: terbuka ? 180 : 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="flex items-center justify-center"
          >
            <ChevronDown aria-hidden="true" />
          </motion.span>
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {terbuka && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            {(error ?? masalah) && (
              <p role="alert" className="mt-2 px-1 text-sm text-danger">
                {error ?? masalah}
              </p>
            )}
            <div className="mt-2">
              <InfoIsianCard jabatanAwal={jabatanAwal} unitAwal={unitAwal} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SectionCard({
  item,
  dragAktif,
  autoFocusJudul,
  bidangList,
  onToggleBidang,
  onMoveKey,
  onDuplicateRequest,
  onDeleteRequest,
  onSaved,
  terpilih,
  onPilih,
}: {
  item: BuilderItem;
  dragAktif: boolean;
  autoFocusJudul?: boolean;
  bidangList: { id: string; nama: string }[];
  onToggleBidang: (item: BuilderItem, bidangId: string) => void;
  onMoveKey: (item: BuilderItem, arah: -1 | 1) => void;
  onDuplicateRequest: (item: BuilderItem) => void;
  onDeleteRequest: (item: BuilderItem) => void;
  onSaved: () => void;
  terpilih: boolean;
  onPilih: () => void;
}) {
  const controls = useDragControls();
  const router = useRouter();
  const toast = useToast();
  const [judul, setJudul] = useState(item.judul);
  const [deskripsi, setDeskripsi] = useState(item.deskripsi ?? "");
  const [kolom, setKolom] = useState<KolomDraft[]>(() => keDraft(item.kolom));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const judulRef = useRef<HTMLInputElement>(null);
  const kartuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocusJudul) {
      kartuRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      judulRef.current?.focus({ preventScroll: true });
      judulRef.current?.select();
      onPilih();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusJudul]);

  const sig = `${item.judul}|${item.deskripsi ?? ""}|${item.kolom.map((col) => col.id).join(",")}`;
  const [prevSig, setPrevSig] = useState(sig);
  // Potret draft untuk banding kotor vs tersimpan.
  const snap = snapOf(judul, deskripsi, kolom);
  const [savedSnap, setSavedSnap] = useState(() =>
    snapOf(item.judul, item.deskripsi ?? "", keDraft(item.kolom))
  );
  if (prevSig !== sig) {
    setPrevSig(sig);
    setJudul(item.judul);
    setDeskripsi(item.deskripsi ?? "");
    const segar = keDraft(item.kolom);
    setKolom(segar);
    setSavedSnap(snapOf(item.judul, item.deskripsi ?? "", segar));
  }

  const esai = item.format === "esai";
  const kepala = item.format === "judul";
  // Indikator = tabel (pakai kolom isian per baris), beda label saja.
  const pakaiKolom = item.format === "tabel" || item.format === "indikator";
  // Esai memakai kolom sebagai daftar subjudul (tipe terkunci esai).
  const kelolaKolom = pakaiKolom || esai;

  // Validasi ringan saat mengetik (ditampilkan, tidak toast).
  let masalah: string | null = null;
  const cj = judul.trim();
  if (cj.length < 1 || cj.length > 120) {
    masalah = "Judul section harus 1-120 karakter.";
  } else if (kelolaKolom) {
    if (kolom.length === 0) {
      masalah = esai ? "Tambahkan minimal satu subjudul." : "Tambahkan minimal satu kolom isian.";
    } else {
      const buruk = kolom.find((col) => {
        const label = col.label.trim();
        // Baris yang baru ditambah (belum diketik apa-apa) tidak dianggap
        // salah — kosongnya diisi default "Kolom N" saat menyimpan.
        if (label.length === 0) return false;
        return label.length > 120;
      });
      if (buruk) masalah = esai ? "Judul subjudul harus 1-120 karakter." : "Judul kolom harus 1-120 karakter.";
    }
  }

  function patchKolom(key: number, patch: Partial<KolomDraft>) {
    setKolom((prev) => prev.map((col) => (col.key === key ? { ...col, ...patch } : col)));
    setError(null);
  }

  const simpan = useCallback(async (snapAwal: string) => {
    const cleanedJudul = judul.trim();
    const cleanedKolom = kelolaKolom
      ? kolom.map((col, index) => {
          const label = col.label.trim();
          return {
            ...col,
            // Label kosong diisi default supaya tetap valid di DB.
            label:
              label.length > 0
                ? label
                : `${esai ? "Subjudul" : item.format === "indikator" ? "Indikator" : "Kolom"} ${index + 1}`,
            // Subjudul esai selalu tersimpan sebagai teks panjang;
            // kolom indikator selalu tersimpan sebagai angka.
            tipe: (esai ? "textarea" : item.format === "indikator" ? "number" : col.tipe) as KolomTipe,
            satuan: col.satuan.trim().slice(0, 40),
            urutan: index,
          };
        })
      : [];
    const awalKolom = item.kolom;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setSimpanStatus("saving");
    let berhasil = false;
    try {
      const supabase = createClient();
      if (kepala) {
        const patch: { judul?: string; deskripsi?: string | null } = {};
        if (cleanedJudul !== item.judul) patch.judul = cleanedJudul;
        const cleanedDesc = deskripsi.trim();
        if (cleanedDesc !== (item.deskripsi ?? "")) {
          patch.deskripsi = cleanedDesc.length > 0 ? cleanedDesc : null;
        }
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase
            .from("laporan_tambahan")
            .update(patch)
            .eq("id", item.id);
          if (error) {
            if (sesiBerakhir(toast, router, error)) return;
            setError("Gagal menyimpan. Coba lagi.");
            return;
          }
        }
      } else if (cleanedJudul !== item.judul) {
        const { error } = await supabase
          .from("laporan_tambahan")
          .update({ judul: cleanedJudul })
          .eq("id", item.id);
        if (error) {
          if (sesiBerakhir(toast, router, error)) return;
          setError("Gagal menyimpan. Coba lagi.");
          return;
        }
      }
      if (kelolaKolom) {
        const keptIds = new Set(
          cleanedKolom.filter((col) => col.id !== null).map((col) => col.id as string)
        );
        const hapusIds = awalKolom.map((col) => col.id).filter((id) => !keptIds.has(id));
        if (hapusIds.length > 0) {
          const { error } = await supabase
            .from("laporan_tambahan_kolom")
            .delete()
            .in("id", hapusIds);
          if (error) {
            if (sesiBerakhir(toast, router, error)) return;
            setError("Gagal menyimpan. Coba lagi.");
            return;
          }
        }
        const kept = cleanedKolom.filter((col) => col.id !== null);
        if (kept.length > 0) {
          const { error } = await supabase.from("laporan_tambahan_kolom").upsert(
            kept.map((col) => ({
              id: col.id as string,
              laporan_id: item.id,
              label: col.label,
              tipe: col.tipe,
              wajib: true,
              urutan: col.urutan,
              satuan: col.satuan,
            })),
            { onConflict: "id" }
          );
          if (error) {
            if (sesiBerakhir(toast, router, error)) return;
            setError("Gagal menyimpan. Coba lagi.");
            return;
          }
        }
        const baru = cleanedKolom.filter((col) => col.id === null);
        if (baru.length > 0) {
          const { error } = await supabase.from("laporan_tambahan_kolom").insert(
            baru.map((col) => ({
              laporan_id: item.id,
              label: col.label,
              tipe: col.tipe,
              wajib: true,
              urutan: col.urutan,
              satuan: col.satuan,
            }))
          );
          if (error) {
            if (sesiBerakhir(toast, router, error)) return;
            setError("Gagal menyimpan. Coba lagi.");
            return;
          }
        }
      }
      setSavedSnap(snapAwal);
      berhasil = true;
      onSaved();
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSimpanStatus(berhasil ? "saved" : "error");
    }
  }, [item, judul, deskripsi, kepala, kolom, onSaved, kelolaKolom, esai, router, toast]);

  // Simpan otomatis 800 mdetik sesudah berhenti mengetik. Kartu yang
  // baris DB-nya belum rampung ditulis menunggu dulu (efek jalan lagi
  // otomatis saat status pending berubah).
  const menungguTulis = useSectionPending(item.id);
  useEffect(() => {
    if (snap === savedSnap || masalah || saving || menungguTulis) return;
    const timer = window.setTimeout(() => {
      void simpan(snap);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [snap, savedSnap, masalah, saving, menungguTulis, simpan]);

  const gagang = (
    <div className="flex justify-center">
      <button
        type="button"
        onPointerDown={(event) => {
          if (dragAktif) controls.start(event);
        }}
        onKeyDown={(event) => {
          if (!dragAktif) return;
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onMoveKey(item, -1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            onMoveKey(item, 1);
          }
        }}
        disabled={!dragAktif}
        aria-label={`Geser ${item.judul} (panah atas bawah untuk pindah)`}
        title="Tahan dan geser untuk pindah"
        style={{ touchAction: "none" }}
        className="flex min-w-[56px] cursor-grab items-center justify-center rounded-md text-neutral-400 transition-soft hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
      >
        <GripHorizontal aria-hidden="true" className="size-5" />
      </button>
    </div>
  );

  const card = (
    <div
      ref={kartuRef}
      className="ref-card px-4 pt-1 pb-4"
      data-kartu-section
      data-section-key={editorKey(item)}
      onPointerDown={onPilih}
      onFocusCapture={onPilih}
    >
      {gagang}
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`ejudul-${item.id}`} className="sr-only">
            Judul section
          </Label>
          <Input
            ref={judulRef}
            id={`ejudul-${item.id}`}
            value={judul}
            onChange={(event) => {
              setJudul(event.target.value);
              setError(null);
            }}
            placeholder="Judul section"
            className="h-auto rounded-none border-0 border-b border-neutral-300 bg-transparent px-1 pt-0 pb-1 text-[17px] leading-none font-semibold tracking-tight placeholder:text-neutral-400 hover:border-neutral-400 hover:bg-transparent focus-visible:border-accent focus-visible:ring-0 dark:border-white/15 dark:hover:bg-transparent"
          />
        </div>
        {esai && (
          <span className="shrink-0 rounded-full bg-black/[0.075] px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-white/10">
            Esai
          </span>
        )}
        {item.format === "indikator" ? (
          <span className="shrink-0 rounded-full bg-black/[0.075] px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-white/10">
            Indikator
          </span>
        ) : pakaiKolom ? (
          <span className="shrink-0 rounded-full bg-black/[0.075] px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-white/10">
            Tabel
          </span>
        ) : null}
        {kepala && (
          <span className="shrink-0 rounded-full bg-black/[0.075] px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-white/10">
            Judul
          </span>
        )}
      </div>
      <div className="mt-1 px-1">
        <Label htmlFor={`edesc-${item.id}`} className="sr-only">
          Deskripsi section (opsional)
        </Label>
        <Input
          id={`edesc-${item.id}`}
          value={deskripsi}
          onChange={(event) => {
            setDeskripsi(event.target.value);
            setError(null);
          }}
          placeholder="Deskripsi (opsional)"
          className="h-auto rounded-none border-0 bg-transparent px-0 pt-0 pb-1 text-sm font-normal text-neutral-500 placeholder:text-neutral-400 hover:bg-transparent hover:text-foreground focus-visible:border-accent focus-visible:ring-0 dark:text-neutral-400 dark:hover:bg-transparent"
        />
      </div>

      <div className="mt-2">
        {kelolaKolom ? (
          <KolomRows
            kolom={kolom}
            onPatch={patchKolom}
            onRemove={(key) => {
              setKolom((prev) => prev.filter((col) => col.key !== key));
              setError(null);
            }}
            onAdd={() => {
              setKolom((prev) => [
                ...prev,
                esai ? kolomBaru("", null, "textarea") : item.format === "indikator" ? kolomBaru("", null, "number") : kolomBaru(),
              ]);
              setError(null);
            }}
            disabled={false}
            terpilih={terpilih}
            satuan={esai ? "Subjudul" : "Kolom"}
            tambahLabel={esai ? "Tambah Subjudul" : item.format === "indikator" ? "Tambah Indikator" : "Tambah Kolom"}
            kunciTipe={esai ? "textarea" : null}
            tipeTerkunci={item.format === "indikator" ? "number" : null}
            denganSatuan={item.format === "indikator"}
          />
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {terpilih && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
      <div className="mt-3 border-t border-neutral-200/70 px-1 pt-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            {bidangList.length === 0 ? (
              <p className="text-xs text-neutral-500">
                Belum ada bidang. Tambahkan dulu di menu Bidang.
              </p>
            ) : (
              bidangList.map((bidang) => {
                const aktif = item.bidang.some((row) => row.id === bidang.id);
                return (
                  <button
                    key={bidang.id}
                    type="button"
                    aria-pressed={aktif}
                    aria-label={`${aktif ? "Hapus" : "Tambah"} bidang ${bidang.nama} untuk ${item.judul}`}
                    onClick={() => onToggleBidang(item, bidang.id)}
                    className={
                      aktif
                        ? "inline-flex min-h-[44px] items-center rounded-full border border-transparent bg-foreground px-4 text-xs font-medium text-background transition-soft disabled:opacity-50"
                        : "inline-flex min-h-[44px] items-center rounded-full border border-border px-4 text-xs font-medium text-muted-foreground transition-soft hover:text-foreground disabled:opacity-50"
                    }
                  >
                    {bidang.nama}
                  </button>
                );
              })
            )}
          </div>
          <span className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDuplicateRequest(item)}
              aria-label={`Salin ${item.judul}`}
              title={`Salin ${item.judul}`}
              className="rounded-full"
            >
              <Copy aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDeleteRequest(item)}
              aria-label={`Hapus ${item.judul}`}
              title={`Hapus ${item.judul}`}
              className="rounded-full"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </span>
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(error ?? masalah) && (
        <p role="alert" className="mt-2 px-1 text-sm text-danger">
          {error ?? masalah}
        </p>
      )}
    </div>
  );

  if (!dragAktif) return card;
  return (
    <Reorder.Item value={editorKey(item)} as="div" dragListener={false} dragControls={controls}>
      {card}
    </Reorder.Item>
  );
}





// Tumpukan kartu yang bisa diurutkan: drag gagang (pointer + panah
// keyboard) ala Google Forms. Geser nonaktif saat mencari.
export function SectionEditor({
  ordered,
  query,
  focusId,
  bidangList,
  onToggleBidang,
  onReorder,
  onMoveKey,
  onDuplicateRequest,
  onDeleteRequest,
  onSaved,
  onTambah,
  terpilih,
  setTerpilih,
}: {
  ordered: BuilderItem[];
  query: string;
  focusId: string | null;
  bidangList: { id: string; nama: string }[];
  onToggleBidang: (item: BuilderItem, bidangId: string) => void;
  onReorder: (keys: string[]) => void;
  onMoveKey: (item: BuilderItem, arah: -1 | 1) => void;
  onDuplicateRequest: (item: BuilderItem) => void;
  onDeleteRequest: (item: BuilderItem) => void;
  onSaved: () => void;
  onTambah: () => void;
  terpilih: string | null;
  setTerpilih: (key: string | null) => void;
}) {
  const visible = query
    ? ordered.filter((item) => item.judul.toLowerCase().includes(query))
    : ordered;

  useEffect(() => {
    function klikLuar(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.("[data-kartu-section], [data-rel-tambah]")) {
        setTerpilih(null);
      }
    }
    document.addEventListener("pointerdown", klikLuar);
    return () => document.removeEventListener("pointerdown", klikLuar);
  }, [setTerpilih]);

  if (visible.length === 0) {
    return (
      <EmptyState
        title={query ? "Tidak ada hasil" : "Belum ada section"}
        description={
          query
            ? `Tidak ada yang cocok dengan "${query}".`
            : "Tambahkan section pertama lewat rel di kanan."
        }
        action={
          query ? undefined : (
            <Button onClick={onTambah}>
              <Plus aria-hidden="true" />
              Tambah Section
            </Button>
          )
        }
      />
    );
  }

  if (query) {
    return (
      <>
        <div className="flex flex-col gap-3">
          {visible.map((item) => (
            <SectionCard
              key={editorKey(item)}
              item={item}
              dragAktif={false}
              autoFocusJudul={focusId === editorKey(item)}
              bidangList={bidangList}
              onToggleBidang={onToggleBidang}
              onMoveKey={onMoveKey}
              onDuplicateRequest={onDuplicateRequest}
              onDeleteRequest={onDeleteRequest}
              onSaved={onSaved}
              terpilih={terpilih === editorKey(item)}
              onPilih={() => setTerpilih(editorKey(item))}
            />
          ))}
        </div>
        <p className="mt-3 px-1 text-xs text-neutral-500">
          Urutan hanya bisa diubah tanpa pencarian.
        </p>
      </>
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={ordered.map((item) => editorKey(item))}
      onReorder={onReorder}
      className="flex flex-col gap-3"
    >
      {ordered.map((item) => (
        <SectionCard
          key={editorKey(item)}
          item={item}
          dragAktif
          autoFocusJudul={focusId === editorKey(item)}
          bidangList={bidangList}
          onToggleBidang={onToggleBidang}
          onMoveKey={onMoveKey}
          onDuplicateRequest={onDuplicateRequest}
          onDeleteRequest={onDeleteRequest}
          onSaved={onSaved}
          terpilih={terpilih === editorKey(item)}
          onPilih={() => setTerpilih(editorKey(item))}
        />
      ))}
    </Reorder.Group>
  );
}
