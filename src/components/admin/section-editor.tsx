"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Reorder, useDragControls } from "motion/react";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";

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

// Satu kartu section ala Google Forms: gagang geser + judul + isian +
// simpan. Draft lokal diselaraskan ulang bila data server berubah
// (mis. kolom baru dapat id sesudah simpan).
export function SectionCard({
  item,
  dragAktif,
  onMoveKey,
  onDeleteRequest,
  onSaved,
  bidangText,
}: {
  item: BuilderItem;
  dragAktif: boolean;
  onMoveKey: (item: BuilderItem, arah: -1 | 1) => void;
  onDeleteRequest: (item: BuilderItem) => void;
  onSaved: () => void;
  bidangText: string;
}) {
  const controls = useDragControls();
  const router = useRouter();
  const toast = useToast();
  const [judul, setJudul] = useState(item.judul);
  const [kolom, setKolom] = useState<KolomDraft[]>(() => keDraft(item.kolom));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sig = `${item.judul}|${item.kolom.map((col) => col.id).join(",")}`;
  const [prevSig, setPrevSig] = useState(sig);
  if (prevSig !== sig) {
    setPrevSig(sig);
    setJudul(item.judul);
    setKolom(keDraft(item.kolom));
  }

  const dinamis = item.kind === "tambahan";
  const esai = dinamis && item.format === "esai";
  const pakaiKolom = dinamis && !esai;

  const awalKolom = item.kolom;
  const samaKolom =
    !pakaiKolom ||
    (kolom.length === awalKolom.length &&
      kolom.every((col, index) => {
        const asal = awalKolom[index];
        return (
          col.id === asal.id &&
          col.label.trim() === asal.label &&
          col.tipe === asal.tipe
        );
      }));
  const dirty = judul.trim() !== item.judul || !samaKolom;

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

  async function handleSimpan() {
    if (saving) return;
    const cleanedJudul = judul.trim();
    if (cleanedJudul.length < 2 || cleanedJudul.length > 120) {
      setError("Judul section harus 2-120 karakter.");
      return;
    }
    const cleanedKolom = pakaiKolom
      ? kolom.map((col, index) => ({ ...col, label: col.label.trim(), urutan: index }))
      : [];
    if (pakaiKolom) {
      if (cleanedKolom.length === 0) {
        setError("Tambahkan minimal satu kolom isian.");
        return;
      }
      for (const col of cleanedKolom) {
        if (col.label.length < 2 || col.label.length > 120) {
          setError("Judul kolom harus 2-120 karakter.");
          return;
        }
      }
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      if (cleanedJudul !== item.judul) {
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
      toast.success("Section diperbarui.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const card = (
    <div className="ref-card p-4">
      <div className="flex items-center gap-1">
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
          className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-grab items-center justify-center rounded-md text-neutral-400 transition-soft hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
        >
          <GripVertical aria-hidden="true" className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`ejudul-${item.kind}-${item.id}`} className="sr-only">
            Judul section
          </Label>
          <Input
            id={`ejudul-${item.kind}-${item.id}`}
            value={judul}
            onChange={(event) => {
              setJudul(event.target.value);
              setError(null);
            }}
            placeholder="Judul section"
            disabled={saving}
            className="h-auto rounded-none border-0 border-b border-neutral-300 bg-transparent px-1 py-1 text-[17px] font-semibold tracking-tight placeholder:text-neutral-400 hover:border-neutral-400 focus-visible:border-accent focus-visible:ring-0 dark:border-white/15"
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDeleteRequest(item)}
          disabled={saving}
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
            disabled={saving}
          />
        ) : item.kind === "section" ? (
          <IsianSectionCard kode={item.id} />
        ) : (
          <p className="px-1 text-xs text-neutral-500">
            Bentuk esai: user mengisi satu teks panjang.
          </p>
        )}
      </div>

      <p className="mt-2 px-1 text-xs text-neutral-500">
        Bidang pengisi: {bidangText || "belum ada (atur di panel kanan)"}
      </p>

      {error && (
        <p role="alert" className="mt-2 px-1 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          onClick={handleSimpan}
          disabled={saving || !dirty}
          className="rounded-full"
        >
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </div>
  );

  if (!dragAktif) return card;
  return (
    <Reorder.Item value={editorKey(item)} as="div" dragListener={false} dragControls={controls}>
      {card}
    </Reorder.Item>
  );
}

// Kartu blanko tambah section: judul + bentuk + kolom, tanpa bidang
// (bidang boleh kosong, diatur sesudahnya di panel kanan).
export function BlankSectionCard({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [judul, setJudul] = useState("");
  const [format, setFormat] = useState<"tabel" | "esai">("tabel");
  const [kolom, setKolom] = useState<KolomDraft[]>(() => [kolomBaru()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esai = format === "esai";

  async function handleSimpan() {
    if (saving) return;
    const cleanedJudul = judul.trim();
    if (cleanedJudul.length < 2 || cleanedJudul.length > 120) {
      setError("Judul section harus 2-120 karakter.");
      return;
    }
    const cleanedKolom = esai
      ? []
      : kolom.map((col, index) => ({ ...col, label: col.label.trim(), urutan: index }));
    if (!esai) {
      if (cleanedKolom.length === 0) {
        setError("Tambahkan minimal satu kolom isian.");
        return;
      }
      for (const col of cleanedKolom) {
        if (col.label.length < 2 || col.label.length > 120) {
          setError("Judul kolom harus 2-120 karakter.");
          return;
        }
      }
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("laporan_tambahan")
        .insert({
          judul: cleanedJudul,
          deskripsi: null,
          format,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error || !data) {
        if (sesiBerakhir(toast, router, error)) return;
        setError("Gagal menambah section. Coba lagi.");
        return;
      }
      const kolomInsert = esai
        ? [{ laporan_id: data.id, label: "Isian", tipe: "textarea" as KolomTipe, wajib: true, urutan: 0 }]
        : cleanedKolom.map((col) => ({
            laporan_id: data.id,
            label: col.label,
            tipe: col.tipe,
            wajib: true,
            urutan: col.urutan,
          }));
      const { error: kolomError } = await supabase
        .from("laporan_tambahan_kolom")
        .insert(kolomInsert);
      if (kolomError) {
        await supabase.from("laporan_tambahan").delete().eq("id", data.id);
        if (sesiBerakhir(toast, router, kolomError)) return;
        setError("Gagal menyimpan kolom isian. Coba lagi.");
        return;
      }
      toast.success("Section dibuat.");
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ref-card p-4">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Label htmlFor="baru-judul" className="sr-only">
            Judul section baru
          </Label>
          <Input
            id="baru-judul"
            value={judul}
            onChange={(event) => {
              setJudul(event.target.value);
              setError(null);
            }}
            placeholder="Judul section baru"
            disabled={saving}
            autoFocus
            className="h-auto rounded-none border-0 border-b border-neutral-300 bg-transparent px-1 py-1 text-[17px] font-semibold tracking-tight placeholder:text-neutral-400 hover:border-neutral-400 focus-visible:border-accent focus-visible:ring-0 dark:border-white/15"
          />
        </div>
      </div>

      <div className="mt-2" role="radiogroup" aria-label="Bentuk isian">
        <div className="flex flex-col">
          {(["tabel", "esai"] as const).map((nilai) => (
            <label key={nilai} className="flex cursor-pointer items-start gap-3 px-1 py-2">
              <input
                type="radio"
                name="baru-bentuk"
                checked={format === nilai}
                onChange={() => {
                  setFormat(nilai);
                  setError(null);
                }}
                disabled={saving}
                className="mt-1 size-4 shrink-0 accent-[#0071e3]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {nilai === "tabel" ? "Tabel" : "Esai"}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {nilai === "tabel"
                    ? "Baris-baris data berisi kolom, mis. progres verifikasi."
                    : "Satu isian teks panjang, mis. rekomendasi."}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {!esai && (
        <div className="mt-2">
          <KolomRows
            kolom={kolom}
            onPatch={(key, patch) => {
              setKolom((prev) => prev.map((col) => (col.key === key ? { ...col, ...patch } : col)));
              setError(null);
            }}
            onDuplicate={(key) => {
              setKolom((prev) => {
                const index = prev.findIndex((col) => col.key === key);
                if (index < 0) return prev;
                return [...prev.slice(0, index + 1), kolomBaru(prev[index].label), ...prev.slice(index + 1)];
              });
              setError(null);
            }}
            onRemove={(key) => {
              setKolom((prev) => prev.filter((col) => col.key !== key));
              setError(null);
            }}
            onAdd={() => {
              setKolom((prev) => [...prev, kolomBaru()]);
              setError(null);
            }}
            disabled={saving}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 px-1 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={saving}
          className="rounded-full"
        >
          Batal
        </Button>
        <Button
          type="button"
          onClick={handleSimpan}
          disabled={saving}
          className="rounded-full"
        >
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </div>
  );
}

// Tumpukan kartu yang bisa diurutkan: drag gagang (pointer + panah
// keyboard) ala Google Forms. Geser nonaktif saat mencari.
export function SectionEditor({
  ordered,
  query,
  onReorder,
  onMoveKey,
  onDeleteRequest,
  onSaved,
  bidangTextOf,
}: {
  ordered: BuilderItem[];
  query: string;
  onReorder: (keys: string[]) => void;
  onMoveKey: (item: BuilderItem, arah: -1 | 1) => void;
  onDeleteRequest: (item: BuilderItem) => void;
  onSaved: () => void;
  bidangTextOf: (item: BuilderItem) => string;
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
            : "Tambahkan section pertama di bawah."
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
              onMoveKey={onMoveKey}
              onDeleteRequest={onDeleteRequest}
              onSaved={onSaved}
              bidangText={bidangTextOf(item)}
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
          onMoveKey={onMoveKey}
          onDeleteRequest={onDeleteRequest}
          onSaved={onSaved}
          bidangText={bidangTextOf(item)}
        />
      ))}
    </Reorder.Group>
  );
}
