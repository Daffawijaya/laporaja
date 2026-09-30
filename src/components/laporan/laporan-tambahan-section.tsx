"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefListCard } from "@/components/ui/ref-list-card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import { formatTanggalPanjang } from "@/components/laporan/types";
import {
  cleanNilai,
  type BarisIsi,
  type KolomDef,
  type TugasLaporan,
} from "@/lib/laporan-tambahan/queries";

function FieldInput({
  kolom,
  index,
  value,
  onChange,
  disabled,
}: {
  kolom: KolomDef;
  index: number;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const id = `baris-${kolom.id}-${index}`;
  const label = `${kolom.label}${kolom.wajib ? "" : " (opsional)"}`;
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

// Nilai tanggal (YYYY-MM-DD) ditampilkan sebagai "hari, tanggal bulan tahun"
// cth: "Senin, 12 Januari 2026". Nilai lain/non-ISO dikembalikan apa adanya.
function formatNilai(col: KolomDef, raw: string): string {
  if (!raw) return "-";
  if (col.tipe !== "date") return raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  try {
    return formatTanggalPanjang(raw);
  } catch {
    return raw;
  }
}

// Seksi pengisian laporan tambahan di halaman laporan user: daftar tugas
// wajib + tambah/ubah/hapus baris isian milik sendiri mengikuti kolom
// yang ditentukan admin.
export function LaporanTambahanSection({
  userId,
  tugas,
  className,
}: {
  userId: string;
  tugas: TugasLaporan[];
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [laporanId, setLaporanId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<BarisIsi | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ judul: string; baris: BarisIsi } | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (tugas.length === 0) return null;

  const aktif = tugas.find((item) => item.id === laporanId) ?? null;
  const dialogOpen = aktif !== null;

  function setField(kolomId: string, value: string) {
    setForm((prev) => ({ ...prev, [kolomId]: value }));
    setFormError(null);
  }

  function openAdd(item: TugasLaporan) {
    setLaporanId(item.id);
    setEditTarget(null);
    setForm({});
    setFormError(null);
  }

  function openEdit(item: TugasLaporan, row: BarisIsi) {
    setLaporanId(item.id);
    setEditTarget(row);
    setForm({ ...row.nilai });
    setFormError(null);
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
          .insert({ laporan_id: aktif.id, user_id: userId })
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
      setDeleteTarget(null);
      toast.success("Isian dihapus.");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={className}>
      {tugas.map((item) => (
        <RefListCard
          key={item.id}
          ariaLabel={`Laporan tambahan ${item.judul}`}
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
                  Tambah Isian
                </Button>
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
                {item.baris.map((row, index) => {
                  const ringkas =
                    row.nilai[item.kolom[0]?.id ?? ""] || `Baris ${index + 1}`;
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
                            onClick={() => setDeleteTarget({ judul: item.judul, baris: row })}
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
                              {formatNilai(col, row.nilai[col.id] ?? "")}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex justify-end">
                <Button onClick={() => openAdd(item)} className="rounded-full">
                  <Plus aria-hidden="true" />
                  Tambah
                </Button>
              </div>
            </>
          )}
        </RefListCard>
      ))}

      <Dialog
        open={dialogOpen}
        onClose={() => setLaporanId(null)}
        title={editTarget ? "Ubah isian" : aktif ? `Isi ${aktif.judul}` : "Isi laporan"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {aktif?.kolom.map((col, index) => (
            <FieldInput
              key={col.id}
              kolom={col}
              index={index}
              value={form[col.id] ?? ""}
              onChange={(value) => setField(col.id, value)}
              disabled={saving}
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
              onClick={() => setLaporanId(null)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </form>
      </Dialog>

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
