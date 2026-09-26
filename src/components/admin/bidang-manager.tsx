"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, useModalKey } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IndikatorBidangDialog } from "@/components/admin/indikator-bidang-dialog";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import type { BidangWithCount } from "@/app/admin/bidang/page";

export function BidangManager({ initial }: { initial: BidangWithCount[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; id: string } | null>(null);
  const [nama, setNama] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BidangWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [indikatorBidang, setIndikatorBidang] = useState<BidangWithCount | null>(null);

  // Selalu ke-mount agar exit animation jalan; key diganti tiap dibuka.
  const [indikatorKey, reopenIndikator] = useModalKey();

  function openIndikator(item: BidangWithCount) {
    reopenIndikator(`indikator-${item.id}`);
    setIndikatorBidang(item);
  }

  // Filter dari search global titlebar (?q=).
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const visibleItems = query
    ? items.filter((item) => item.nama.toLowerCase().includes(query))
    : items;

  function openAdd() {
    setNama("");
    setFormError(null);
    setDialog({ mode: "add" });
  }

  function openEdit(item: BidangWithCount) {
    setNama(item.nama);
    setFormError(null);
    setDialog({ mode: "edit", id: item.id });
  }

  function handleSession(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  function isDuplicate(error: { message?: string } | null): boolean {
    return /duplicate|unique|already/i.test(error?.message ?? "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dialog) return;
    const cleaned = nama.trim();
    if (cleaned.length === 0) {
      setFormError("Nama bidang wajib diisi.");
      return;
    }
    if (cleaned.length < 2 || cleaned.length > 120) {
      setFormError("Nama bidang harus 2-120 karakter.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      if (dialog.mode === "add") {
        const { data, error } = await supabase
          .from("bidang")
          .insert({ nama: cleaned })
          .select("id, nama")
          .single();
        if (error || !data) {
          if (handleSession(error)) return;
          setFormError(
            isDuplicate(error)
              ? "Nama bidang sudah dipakai."
              : "Gagal menambah bidang. Coba lagi."
          );
          return;
        }
        setItems((prev) =>
          [...prev, { id: data.id, nama: data.nama, userCount: 0 }].sort((a, b) =>
            a.nama.localeCompare(b.nama, "id")
          )
        );
        toast.success("Bidang ditambahkan.");
      } else {
        const { error } = await supabase
          .from("bidang")
          .update({ nama: cleaned })
          .eq("id", dialog.id);
        if (error) {
          if (handleSession(error)) return;
          setFormError(
            isDuplicate(error) ? "Nama bidang sudah dipakai." : "Gagal menyimpan. Coba lagi."
          );
          return;
        }
        setItems((prev) =>
          prev.map((item) => (item.id === dialog.id ? { ...item, nama: cleaned } : item))
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
      const { error } = await supabase.from("bidang").delete().eq("id", deleteTarget.id);
      if (error) {
        if (handleSession(error)) return;
        setPageError("Gagal menghapus bidang. Coba lagi.");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Bidang dihapus.");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          {visibleItems.length === 0 ? "Belum ada bidang." : `${visibleItems.length} bidang.`}
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

      {visibleItems.length === 0 ? (
        <EmptyState
          className="mt-4"
          title={query ? "Tidak ada hasil" : "Belum ada bidang"}
          description={
            query
              ? `Tidak ada yang cocok dengan "${query}".`
              : "Tambahkan bidang pertama untuk mengelompokkan pengguna."
          }
          action={
            query ? undefined : (
              <Button onClick={openAdd}>
                <Plus aria-hidden="true" />
                Tambah Bidang
              </Button>
            )
          }
        />
      ) : (
        <ul className="mt-2 divide-y divide-neutral-200/70 dark:divide-white/10">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="flex min-h-[56px] items-center justify-between gap-3 px-1 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.nama}</p>
                <p className="text-xs text-neutral-500">
                  {item.userCount === 0 ? "Belum ada user" : `${item.userCount} user`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  onClick={() => openIndikator(item)}
                  aria-label={`Indikator ${item.nama}`}
                >
                  <Target aria-hidden="true" />
                  <span className="hidden sm:inline">Indikator</span>
                </Button>
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
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog?.mode === "edit" ? "Ubah bidang" : "Tambah bidang"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bidang-nama">Nama bidang</Label>
            <Input
              id="bidang-nama"
              value={nama}
              onChange={(event) => {
                setNama(event.target.value);
                setFormError(null);
              }}
              placeholder="Contoh: Digitalisasi"
              disabled={saving}
              autoFocus
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
        title="Hapus bidang"
        message={
          deleteTarget
            ? deleteTarget.userCount > 0
              ? `Hapus bidang '${deleteTarget.nama}'? ${deleteTarget.userCount} user akan menjadi tanpa bidang.`
              : `Hapus bidang '${deleteTarget.nama}'?`
            : ""
        }
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <IndikatorBidangDialog
        key={indikatorKey}
        bidangId={indikatorBidang?.id ?? ""}
        bidangNama={indikatorBidang?.nama ?? ""}
        open={indikatorBidang !== null}
        onClose={() => setIndikatorBidang(null)}
      />
    </div>
  );
}
