"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassMenu } from "@/components/ui/glass-menu";
import { RefListCard } from "@/components/ui/ref-list-card";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";

export interface IndikatorRow {
  id: string;
  nama: string;
  target: number | null;
  owner: string;
  bulanIni: number;
  total: number;
}

// Tabel lengkap semua indikator. Target per bulan opsional (boleh kosong).
export function IndikatorManager({ initial }: { initial: IndikatorRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [tambahOpen, setTambahOpen] = useState(false);
  const [editItem, setEditItem] = useState<IndikatorRow | null>(null);
  const [nama, setNama] = useState("");
  const [target, setTarget] = useState("10");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IndikatorRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // Filter dari search global titlebar (?q=).
  const searchParams = useSearchParams();
  const query = ((searchParams.get("q") ?? "").trim().toLowerCase());
  const visibleItems = query
    ? items.filter(
        (item) =>
          item.nama.toLowerCase().includes(query) ||
          item.owner.toLowerCase().includes(query)
      )
    : items;

  function handleSession(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  function openAdd() {
    setNama("");
    setTarget("");
    setFormError(null);
    setTambahOpen(true);
  }

  // Target opsional: kosong = null (tanpa target).
  function validasiNamaTarget(): { jumlah: number | null } | null {
    if (nama.trim().length < 2 || nama.trim().length > 120) {
      setFormError("Nama indikator harus 2-120 karakter.");
      return null;
    }
    if (target.trim() === "") return { jumlah: null };
    const jumlah = Number(target);
    if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > 100000) {
      setFormError("Target per bulan harus angka bulat 1 sampai 100000.");
      return null;
    }
    return { jumlah };
  }

  async function handleTambah(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const valid = validasiNamaTarget();
    if (!valid) return;
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("indikator")
        .insert({
          nama: nama.trim(),
          target_bulanan: valid.jumlah,
          bidang_id: null,
          user_id: null,
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
          {
            id: data.id,
            nama: nama.trim(),
            target: valid.jumlah,
            owner: "Semua",
            bulanIni: 0,
            total: 0,
          },
          ...prev,
        ].sort((a, b) => a.nama.localeCompare(b.nama, "id"))
      );
      setTambahOpen(false);
      toast.success("Indikator ditambahkan.");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(item: IndikatorRow) {
    setEditItem(item);
    setNama(item.nama);
    setTarget(item.target == null ? "" : String(item.target));
    setFormError(null);
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !editItem) return;
    const valid = validasiNamaTarget();
    if (!valid) return;
    const jumlah = valid.jumlah;
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const payload = { nama: nama.trim(), target_bulanan: jumlah };
      const { error } = await supabase.from("indikator").update(payload).eq("id", editItem.id);
      if (error) {
        if (handleSession(error)) return;
        setFormError("Gagal menyimpan. Coba lagi.");
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === editItem.id
            ? { ...item, nama: payload.nama, target: payload.target_bulanan }
            : item
        )
      );
      setEditItem(null);
      toast.success("Perubahan disimpan.");
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

  return (
    <div className="w-full">
      <RefListCard ariaLabel="Indikator">
        {pageError && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {pageError}
          </p>
        )}

        {visibleItems.length === 0 ? (
          <EmptyState
            title={query ? "Tidak ada hasil" : "Belum ada indikator"}
            description={
              query
                ? `Tidak ada yang cocok dengan "${query}".`
                : "Tambahkan indikator pertama lewat tombol Tambah di bawah."
            }
            action={
              query ? undefined : (
                <Button onClick={openAdd}>
                  <Plus aria-hidden="true" />
                  Tambah Indikator
                </Button>
              )
            }
          />
        ) : (
          /* Satu list responsif ala halaman Pengguna: judul + subtitle,
             aksi menciut jadi menu titik-tiga abu di kanan. */
          <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
            {visibleItems.map((item, i) => {
              const pad =
                visibleItems.length === 1
                  ? ""
                  : i === 0
                    ? " pb-3"
                    : i === visibleItems.length - 1
                      ? " pt-3"
                      : " py-3";
              const subtitle = `${item.owner} · ${item.target == null ? "Target belum diatur" : `Target ${item.target}/bln`} · ${item.bulanIni} bulan ini · total ${item.total}`;
              return (
                <li key={item.id}>
                  <div className={`flex items-center justify-between gap-3 px-1${pad}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.nama}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-neutral-500">
                        {subtitle}
                      </span>
                    </span>
                    <GlassMenu
                      label={`Aksi ${item.nama}`}
                      items={[
                        {
                          key: "edit",
                          label: "Ubah",
                          icon: <Pencil aria-hidden="true" />,
                          onSelect: () => openEdit(item),
                        },
                        {
                          key: "delete",
                          label: "Hapus",
                          icon: <Trash2 aria-hidden="true" />,
                          danger: true,
                          onSelect: () => {
                            setPageError(null);
                            setDeleteTarget(item);
                          },
                        },
                      ]}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </RefListCard>
      {visibleItems.length > 0 && (
        <div className="mt-3 flex justify-end">
          <Button onClick={openAdd} className="rounded-full">
            <Plus aria-hidden="true" />
            Tambah
          </Button>
        </div>
      )}

      <Dialog
        open={tambahOpen}
        onClose={() => setTambahOpen(false)}
        title="Tambah indikator"
      >
        <form onSubmit={handleTambah} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="indikator-baru-nama">Nama indikator</Label>
            <Input
              id="indikator-baru-nama"
              value={nama}
              onChange={(event) => {
                setNama(event.target.value);
                setFormError(null);
              }}
              placeholder="Contoh: Sosialisasi UMKM"
              disabled={saving}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="indikator-baru-target">Target per bulan</Label>
            <Input
              id="indikator-baru-target"
              type="number"
              min={1}
              max={100000}
              step={1}
              value={target}
              placeholder="Opsional"
              onChange={(event) => {
                setTarget(event.target.value);
                setFormError(null);
              }}
              disabled={saving}
            />
          </div>

          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTambahOpen(false)}
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

      <Dialog
        open={editItem !== null}
        onClose={() => setEditItem(null)}
        title="Ubah indikator"
      >
        <form onSubmit={handleEdit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="indikator-nama">Nama indikator</Label>
            <Input
              id="indikator-nama"
              value={nama}
              onChange={(event) => {
                setNama(event.target.value);
                setFormError(null);
              }}
              placeholder="Contoh: Sosialisasi UMKM"
              disabled={saving}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="indikator-target">Target per bulan</Label>
            <Input
              id="indikator-target"
              type="number"
              min={1}
              max={100000}
              step={1}
              value={target}
              placeholder="Opsional"
              onChange={(event) => {
                setTarget(event.target.value);
                setFormError(null);
              }}
              disabled={saving}
            />
          </div>

          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditItem(null)}
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
