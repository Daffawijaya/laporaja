"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Reorder, useDragControls } from "motion/react";
import { Copy, GripHorizontal, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassSelect } from "@/components/ui/glass-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import type { SectionKode } from "@/lib/supabase/database.types";
import type { KolomTipe } from "@/lib/laporan-tambahan/queries";
import type { BuilderItem } from "@/lib/laporan-tambahan/queries";
import {
  IsianSectionCard,
  TIPE_OPTIONS,
} from "@/components/admin/laporan-tambahan-form";

export function editorKey(item: Pick<BuilderItem, "kind" | "id">): string {
  return `${item.kind}-${item.id}`;
}

interface KolomDraft {
  key: number;
  /** Id baris DB; null = baris baru yang belum tersimpan. */
  id: string | null;
  label: string;
  tipe: KolomTipe;
}

let kolomSeq = 0;
function kolomBaru(label = "", id: string | null = null, tipe: KolomTipe = "text"): KolomDraft {
  kolomSeq += 1;
  return { key: kolomSeq, id, label, tipe };
}

function keDraft(kolom: { id: string; label: string; tipe: KolomTipe }[]): KolomDraft[] {
  return kolom.length > 0
    ? kolom.map((col) => kolomBaru(col.label, col.id, col.tipe))
    : [kolomBaru()];
}

// Potret draft untuk banding kotor vs tersimpan.
function snapOf(judul: string, deskripsi: string, kolom: KolomDraft[]): string {
  return JSON.stringify({
    j: judul.trim(),
    d: deskripsi.trim(),
    k: kolom.map((col) => [col.id, col.label.trim(), col.tipe]),
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

// Baris-baris editor kolom ala Google Forms: label + tipe + gandakan/hapus.
function KolomRows({
  kolom,
  onPatch,
  onDuplicate,
  onRemove,
  onAdd,
  disabled,
}: {
  kolom: KolomDraft[];
  onPatch: (key: number, patch: Partial<KolomDraft>) => void;
  onDuplicate: (key: number) => void;
  onRemove: (key: number) => void;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <div>
      <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
        {kolom.map((col, index) => (
          <li
            key={col.key}
            className={
              kolom.length === 1
                ? "px-1"
                : index === 0
                  ? "px-1 pb-3"
                  : index === kolom.length - 1
                    ? "px-1 pt-3"
                    : "px-1 py-3"
            }
          >
            <div className="flex items-center gap-2">
              <Label htmlFor={`ekolom-${col.key}`} className="sr-only">
                {`Kolom ${index + 1}`}
              </Label>
              <Input
                id={`ekolom-${col.key}`}
                value={col.label}
                onChange={(event) => onPatch(col.key, { label: event.target.value })}
                placeholder="Judul kolom"
                disabled={disabled}
                className="h-11 min-w-0 flex-1 border-transparent bg-black/[0.075] text-sm hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
              />
              <GlassSelect
                ariaLabel={`Bentuk isian kolom ${index + 1}`}
                value={col.tipe}
                onChange={(value) => onPatch(col.key, { tipe: value as KolomTipe })}
                options={TIPE_OPTIONS}
                disabled={disabled}
                className="w-32 shrink-0 sm:w-36"
              />
              <span className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onDuplicate(col.key)}
                  disabled={disabled}
                  aria-label={`Gandakan kolom ${index + 1}`}
                >
                  <Copy aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(col.key)}
                  disabled={disabled || kolom.length <= 1}
                  aria-label={`Hapus kolom ${index + 1}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="secondary"
        onClick={onAdd}
        disabled={disabled}
        className="mt-2 w-full rounded-full"
      >
        <Plus aria-hidden="true" />
        Tambah Kolom
      </Button>
    </div>
  );
}

const INFO_LABELS = ["Bulan", "Tahun", "Nama"];

// Isian kartu Info: baris dokumentasi (mengikuti data user, tanpa
// dropdown) + Jabatan dan Unit kerja yang bisa diketik dan tersimpan
// otomatis. Jabatan di sini hanya awalan; sisanya ikut bidang dan
// sub bidang user.
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
    if (j.length < 2 || j.length > 120) return "Jabatan harus 2-120 karakter.";
    if (u.length === 0) return "Unit kerja wajib diisi.";
    if (u.length > 200) return "Unit kerja maksimal 200 karakter.";
    return null;
  })();

  const simpan = useCallback(
    async (snapAwal: { j: string; u: string }) => {
      setSaving(true);
      setError(null);
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
      } finally {
        setSaving(false);
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

  const baris = [...INFO_LABELS, "Jabatan", "Unit kerja"];
  return (
    <div>
      <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
        {baris.map((label, index) => {
          const pad =
            baris.length === 1
              ? "px-1"
              : index === 0
                ? "px-1 pb-3"
                : index === baris.length - 1
                  ? "px-1 pt-3"
                  : "px-1 py-3";
          const editable = label === "Jabatan" || label === "Unit kerja";
          const isJabatan = label === "Jabatan";
          return (
            <li key={label} className={pad}>
              <Label htmlFor={`info-${label}`} className="sr-only">
                {label}
              </Label>
              <Input
                id={`info-${label}`}
                value={isJabatan ? jabatan : editable ? unit : label}
                onChange={
                  editable
                    ? (event) => {
                        if (isJabatan) setJabatan(event.target.value);
                        else setUnit(event.target.value);
                        setError(null);
                      }
                    : undefined
                }
                disabled={!editable}
                placeholder={editable ? label : undefined}
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
      {saving && (
        <p aria-live="polite" className="mt-2 px-1 text-xs text-neutral-500">
          Menyimpan…
        </p>
      )}
    </div>
  );
}
export function SectionCard({
  item,
  dragAktif,
  autoFocusJudul,
  jabatanAwal,
  unitKerjaAwal,
  onMoveKey,
  onDeleteRequest,
  onSaved,
}: {
  item: BuilderItem;
  dragAktif: boolean;
  autoFocusJudul?: boolean;
  jabatanAwal: string;
  unitKerjaAwal: string;
  onMoveKey: (item: BuilderItem, arah: -1 | 1) => void;
  onDeleteRequest: (item: BuilderItem) => void;
  onSaved: () => void;
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

  useEffect(() => {
    if (autoFocusJudul) judulRef.current?.focus();
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

  const dinamis = item.kind === "tambahan";
  const esai = dinamis && item.format === "esai";
  const kepala = dinamis && item.format === "judul";
  const pakaiKolom = dinamis && item.format === "tabel";
  const infoRingkas = item.kind === "section" && item.id === "info";

  // Validasi ringan saat mengetik (ditampilkan, tidak toast).
  let masalah: string | null = null;
  const cj = judul.trim();
  if (!infoRingkas) {
    if (cj.length < 2 || cj.length > 120) {
      masalah = "Judul section harus 2-120 karakter.";
    } else if (pakaiKolom) {
      if (kolom.length === 0) {
        masalah = "Tambahkan minimal satu kolom isian.";
      } else {
        const buruk = kolom.find((col) => {
          const label = col.label.trim();
          return label.length < 2 || label.length > 120;
        });
        if (buruk) masalah = "Judul kolom harus 2-120 karakter.";
      }
    }
  }

  function patchKolom(key: number, patch: Partial<KolomDraft>) {
    setKolom((prev) => prev.map((col) => (col.key === key ? { ...col, ...patch } : col)));
    setError(null);
  }

  function duplicateKolom(key: number) {
    setKolom((prev) => {
      const index = prev.findIndex((col) => col.key === key);
      if (index < 0) return prev;
      return [...prev.slice(0, index + 1), kolomBaru(prev[index].label), ...prev.slice(index + 1)];
    });
    setError(null);
  }

  const simpan = useCallback(async (snapAwal: string) => {
    const cleanedJudul = judul.trim();
    const cleanedKolom = pakaiKolom
      ? kolom.map((col, index) => ({ ...col, label: col.label.trim(), urutan: index }))
      : [];
    const awalKolom = item.kolom;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      if (kepala && dinamis) {
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
        const { error } =
          item.kind === "section"
            ? await supabase
                .from("laporan_section")
                .update({ judul: cleanedJudul })
                .eq("kode", item.id as SectionKode)
            : await supabase
                .from("laporan_tambahan")
                .update({ judul: cleanedJudul })
                .eq("id", item.id);
        if (error) {
          if (sesiBerakhir(toast, router, error)) return;
          setError("Gagal menyimpan. Coba lagi.");
          return;
        }
      }
      if (pakaiKolom && dinamis) {
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
      onSaved();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [dinamis, item, judul, deskripsi, kepala, kolom, onSaved, pakaiKolom, router, toast]);

  // Simpan otomatis 800 mdetik sesudah berhenti mengetik.
  useEffect(() => {
    if (infoRingkas || snap === savedSnap || masalah || saving) return;
    const timer = window.setTimeout(() => {
      void simpan(snap);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [snap, savedSnap, masalah, saving, infoRingkas, simpan]);

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

  // Kartu Info ringkas: hanya gagang + isian (jabatan dan unit kerja
  // tersimpan otomatis, sisanya mengikuti data user).
  if (infoRingkas) {
    const minimal = (
      <div className="ref-card px-4 pt-1 pb-4">
        {gagang}
        <InfoIsianCard jabatanAwal={jabatanAwal} unitAwal={unitKerjaAwal} />
      </div>
    );
    if (!dragAktif) return minimal;
    return (
      <Reorder.Item value={editorKey(item)} as="div" dragListener={false} dragControls={controls}>
        {minimal}
      </Reorder.Item>
    );
  }

  const card = (
    <div className="ref-card px-4 pt-1 pb-4">
      {gagang}
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`ejudul-${item.kind}-${item.id}`} className="sr-only">
            Judul section
          </Label>
          <Input
            ref={judulRef}
            id={`ejudul-${item.kind}-${item.id}`}
            value={judul}
            onChange={(event) => {
              setJudul(event.target.value);
              setError(null);
            }}
            placeholder="Judul section"
            className="h-auto rounded-none border-0 border-b border-neutral-300 bg-transparent px-1 pt-0 pb-1 text-[17px] leading-none font-semibold tracking-tight placeholder:text-neutral-400 hover:border-neutral-400 focus-visible:border-accent focus-visible:ring-0 dark:border-white/15"
          />
        </div>
        {item.kind === "section" && (
          <span className="shrink-0 rounded-full bg-black/[0.075] px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-white/10">
            Section
          </span>
        )}
        {esai && (
          <span className="shrink-0 rounded-full bg-black/[0.075] px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-white/10">
            Esai
          </span>
        )}
        {kepala && (
          <span className="shrink-0 rounded-full bg-black/[0.075] px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-white/10">
            Judul
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDeleteRequest(item)}
          aria-label={`Hapus ${item.judul}`}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-2">
        {pakaiKolom ? (
          <KolomRows
            kolom={kolom}
            onPatch={patchKolom}
            onDuplicate={duplicateKolom}
            onRemove={(key) => {
              setKolom((prev) => prev.filter((col) => col.key !== key));
              setError(null);
            }}
            onAdd={() => {
              setKolom((prev) => [...prev, kolomBaru()]);
              setError(null);
            }}
            disabled={false}
          />
        ) : item.kind === "section" ? (
          <IsianSectionCard kode={item.id} />
        ) : esai ? (
          <p className="px-1 text-xs text-neutral-500">
            Bentuk esai: user mengisi satu teks panjang.
          </p>
        ) : null}
      </div>

      {(error ?? masalah) && (
        <p role="alert" className="mt-2 px-1 text-sm text-danger">
          {error ?? masalah}
        </p>
      )}
      {saving && (
        <p aria-live="polite" className="mt-2 px-1 text-xs text-neutral-500">
          Menyimpan…
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
  jabatanAwal,
  unitKerjaAwal,
  onReorder,
  onMoveKey,
  onDeleteRequest,
  onSaved,
  onTambah,
}: {
  ordered: BuilderItem[];
  query: string;
  focusId: string | null;
  jabatanAwal: string;
  unitKerjaAwal: string;
  onReorder: (keys: string[]) => void;
  onMoveKey: (item: BuilderItem, arah: -1 | 1) => void;
  onDeleteRequest: (item: BuilderItem) => void;
  onSaved: () => void;
  onTambah: () => void;
}) {
  const visible = query
    ? ordered.filter((item) => item.judul.toLowerCase().includes(query))
    : ordered;

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
              jabatanAwal={jabatanAwal}
              unitKerjaAwal={unitKerjaAwal}
              onMoveKey={onMoveKey}
              onDeleteRequest={onDeleteRequest}
              onSaved={onSaved}
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
          jabatanAwal={jabatanAwal}
          unitKerjaAwal={unitKerjaAwal}
          onMoveKey={onMoveKey}
          onDeleteRequest={onDeleteRequest}
          onSaved={onSaved}
        />
      ))}
    </Reorder.Group>
  );
}
