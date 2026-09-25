"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import { NAMA_BULAN } from "@/components/laporan/types";
import { formatPerBulan, formatPeriode } from "@/lib/indikator/queries";

export interface IndikatorRow {
  id: string;
  nama: string;
  target: number;
  tahun: number;
  bulanMulai: number;
  bulanSelesai: number;
  scopeLabel: string;
  capaian: number;
}

export interface ScopeOption {
  id: string;
  nama: string;
}

export interface UserScopeOption extends ScopeOption {
  username: string;
  bidangNama: string | null;
}

type DialogState =
  | { mode: "add" }
  | { mode: "edit"; item: IndikatorRow };

const TAHUN_AWAL = 2000;
const TAHUN_AKHIR = 2100;

function emptyForm(tahunBerjalan: number) {
  return {
    nama: "",
    target: "10",
    tahun: String(tahunBerjalan),
    bulanMulai: "1",
    bulanSelesai: "12",
    scope: "bidang" as "bidang" | "user",
    scopeId: "",
  };
}

export function IndikatorManager({
  initial,
  bidangOptions,
  userOptions,
}: {
  initial: IndikatorRow[];
  bidangOptions: ScopeOption[];
  userOptions: UserScopeOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [form, setForm] = useState(() => emptyForm(new Date().getFullYear()));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IndikatorRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  function openAdd() {
    setForm(emptyForm(new Date().getFullYear()));
    setFormError(null);
    setDialog({ mode: "add" });
  }

  function openEdit(item: IndikatorRow) {
    setForm({
      nama: item.nama,
      target: String(item.target),
      tahun: String(item.tahun),
      bulanMulai: String(item.bulanMulai),
      bulanSelesai: String(item.bulanSelesai),
      scope: "bidang",
      scopeId: "",
    });
    setFormError(null);
    setDialog({ mode: "edit", item });
  }

  function handleSession(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  function validate(): string | null {
    if (form.nama.trim().length < 2 || form.nama.trim().length > 120) {
      return "Nama indikator harus 2-120 karakter.";
    }
    const target = Number(form.target);
    if (!Number.isInteger(target) || target < 1 || target > 100000) {
      return "Target harus angka bulat 1 sampai 100000.";
    }
    const tahun = Number(form.tahun);
    if (!Number.isInteger(tahun) || tahun < TAHUN_AWAL || tahun > TAHUN_AKHIR) {
      return `Tahun harus ${TAHUN_AWAL} sampai ${TAHUN_AKHIR}.`;
    }
    const mulai = Number(form.bulanMulai);
    const selesai = Number(form.bulanSelesai);
    if (mulai < 1 || mulai > 12 || selesai < 1 || selesai > 12 || selesai < mulai) {
      return "Rentang bulan tidak valid. Bulan selesai harus sama atau setelah mulai.";
    }
    if (dialog?.mode === "add" && !form.scopeId) {
      return form.scope === "bidang" ? "Pilih bidang." : "Pilih user.";
    }
    return null;
  }

  function scopeLabel(): string {
    if (form.scope === "bidang") {
      const bidang = bidangOptions.find((option) => option.id === form.scopeId);
      return bidang ? `Bidang ${bidang.nama}` : "";
    }
    const user = userOptions.find((option) => option.id === form.scopeId);
    return user ? `${user.nama} (${user.username})` : "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dialog) return;
    const failed = validate();
    if (failed) {
      setFormError(failed);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const payload = {
        nama: form.nama.trim(),
        target: Number(form.target),
        tahun: Number(form.tahun),
        bulan_mulai: Number(form.bulanMulai),
        bulan_selesai: Number(form.bulanSelesai),
      };
      if (dialog.mode === "add") {
        const { data, error } = await supabase
          .from("indikator")
          .insert({
            ...payload,
            bidang_id: form.scope === "bidang" ? form.scopeId : null,
            user_id: form.scope === "user" ? form.scopeId : null,
          })
          .select("id")
          .single();
        if (error || !data) {
          if (handleSession(error)) return;
          setFormError("Gagal menambah indikator. Coba lagi.");
          return;
        }
        setItems((prev) =>
          [
            ...prev,
            {
              id: data.id,
              nama: payload.nama,
              target: payload.target,
              tahun: payload.tahun,
              bulanMulai: payload.bulan_mulai,
              bulanSelesai: payload.bulan_selesai,
              scopeLabel: scopeLabel(),
              capaian: 0,
            },
          ].sort((a, b) => a.nama.localeCompare(b.nama, "id"))
        );
        toast.success("Indikator ditambahkan.");
      } else {
        const { error } = await supabase
          .from("indikator")
          .update(payload)
          .eq("id", dialog.item.id);
        if (error) {
          if (handleSession(error)) return;
          setFormError("Gagal menyimpan. Coba lagi.");
          return;
        }
        setItems((prev) =>
          prev.map((item) =>
            item.id === dialog.item.id
              ? {
                  ...item,
                  nama: payload.nama,
                  target: payload.target,
                  tahun: payload.tahun,
                  bulanMulai: payload.bulan_mulai,
                  bulanSelesai: payload.bulan_selesai,
                }
              : item
          )
        );
        toast.success("Perubahan disimpan.");
      }
      setDialog(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setPageError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("indikator").delete().eq("id", deleteTarget.id);
      if (error) {
        if (handleSession(error)) return;
        setPageError("Gagal menghapus indikator. Coba lagi.");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Indikator dihapus.");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const scopeList = form.scope === "bidang" ? bidangOptions : userOptions;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length === 0 ? "Belum ada indikator." : `${items.length} indikator.`}
        </p>
        <Button onClick={openAdd}>
          <Plus aria-hidden="true" />
          Tambah
        </Button>
      </div>

      {pageError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {pageError}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="Belum ada indikator"
          description="Tambahkan indikator pertama untuk mulai mengukur kinerja."
          action={
            <Button onClick={openAdd}>
              <Plus aria-hidden="true" />
              Tambah Indikator
            </Button>
          }
        />
      ) : (
        <ul className="panel mt-4 divide-y divide-border overflow-hidden rounded-lg">
          {items.map((item) => {
            const bulanCount = item.bulanSelesai - item.bulanMulai + 1;
            const persen = Math.min(100, Math.round((item.capaian / item.target) * 100));
            return (
              <li key={item.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.nama}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.scopeLabel} {" · "}
                      {formatPeriode(item.tahun, item.bulanMulai, item.bulanSelesai)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      onClick={() => openEdit(item)}
                      aria-label={`Ubah ${item.nama}`}
                    >
                      <Pencil aria-hidden="true" />
                      <span className="hidden sm:inline">Ubah</span>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setPageError(null);
                        setDeleteTarget(item);
                      }}
                      aria-label={`Hapus ${item.nama}`}
                    >
                      <Trash2 aria-hidden="true" />
                      <span className="hidden sm:inline">Hapus</span>
                    </Button>
                  </div>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={item.capaian}
                  aria-valuemin={0}
                  aria-valuemax={item.target}
                  aria-label={`Capaian ${item.nama}`}
                  className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full rounded-full bg-accent" style={{ width: `${persen}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {item.capaian} dari {item.target}
                  {" · "}
                  {formatPerBulan(item.target, bulanCount)} per bulan
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog?.mode === "edit" ? "Ubah indikator" : "Tambah indikator"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="indikator-nama">Nama indikator</Label>
            <Input
              id="indikator-nama"
              value={form.nama}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, nama: event.target.value }));
                setFormError(null);
              }}
              placeholder="Contoh: Sosialisasi UMKM"
              disabled={saving}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="indikator-target">Target jumlah</Label>
              <Input
                id="indikator-target"
                type="number"
                min={1}
                max={100000}
                step={1}
                value={form.target}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, target: event.target.value }));
                  setFormError(null);
                }}
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="indikator-tahun">Tahun</Label>
              <Input
                id="indikator-tahun"
                type="number"
                min={TAHUN_AWAL}
                max={TAHUN_AKHIR}
                step={1}
                value={form.tahun}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, tahun: event.target.value }));
                  setFormError(null);
                }}
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="indikator-mulai">Bulan mulai</Label>
              <select
                id="indikator-mulai"
                value={form.bulanMulai}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, bulanMulai: event.target.value }));
                  setFormError(null);
                }}
                disabled={saving}
                className="select-chevron min-h-[44px] appearance-none rounded-md border border-border bg-surface pr-9 pl-3 text-sm"
              >
                {NAMA_BULAN.map((nama, index) => (
                  <option key={nama} value={index + 1}>
                    {nama}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="indikator-selesai">Bulan selesai</Label>
              <select
                id="indikator-selesai"
                value={form.bulanSelesai}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, bulanSelesai: event.target.value }));
                  setFormError(null);
                }}
                disabled={saving}
                className="select-chevron min-h-[44px] appearance-none rounded-md border border-border bg-surface pr-9 pl-3 text-sm"
              >
                {NAMA_BULAN.map((nama, index) => (
                  <option key={nama} value={index + 1}>
                    {nama}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {dialog?.mode === "add" && (
            <fieldset>
              <legend className="text-sm font-medium">Berlaku untuk</legend>
              <div className="mt-2 flex gap-2">
                {(["bidang", "user"] as const).map((value) => (
                  <label
                    key={value}
                    className="flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 text-sm has-checked:border-accent has-checked:bg-accent/5"
                  >
                    <input
                      type="radio"
                      name="indikator-scope"
                      value={value}
                      checked={form.scope === value}
                      onChange={() =>
                        setForm((prev) => ({ ...prev, scope: value, scopeId: "" }))
                      }
                      disabled={saving}
                      className="accent-[#0071e3]"
                    />
                    {value === "bidang" ? "Satu bidang" : "Satu user"}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <Label htmlFor="indikator-scope-id">
                  {form.scope === "bidang" ? "Bidang" : "User"}
                </Label>
                <select
                  id="indikator-scope-id"
                  value={form.scopeId}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, scopeId: event.target.value }));
                    setFormError(null);
                  }}
                  disabled={saving}
                  className="select-chevron min-h-[44px] appearance-none rounded-md border border-border bg-surface pr-9 pl-3 text-sm"
                >
                  <option value="">
                    {form.scope === "bidang" ? "Pilih bidang" : "Pilih user"}
                  </option>
                  {scopeList.map((option) => (
                    <option key={option.id} value={option.id}>
                      {form.scope === "bidang"
                        ? option.nama
                        : `${option.nama} (${(option as UserScopeOption).username})`}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
          )}

          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialog(null)}
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
        title="Hapus indikator"
        message={
          deleteTarget
            ? `Hapus indikator '${deleteTarget.nama}'? Tautan ke kegiatan ikut terhapus.`
            : ""
        }
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
