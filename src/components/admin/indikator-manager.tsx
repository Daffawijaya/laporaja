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

// Tabel lengkap semua indikator. Tambah baru langsung isi nama di tabel,
// tersimpan sebagai global. Jumlah per bulan diisi belakangan di menu
// Bidang atau menu Pengguna.
export function IndikatorManager({ initial }: { initial: IndikatorRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [namaBaru, setNamaBaru] = useState("");
  const [tambahError, setTambahError] = useState<string | null>(null);
  const [menambah, setMenambah] = useState(false);
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

  async function handleTambah(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (menambah) return;
    const cleaned = namaBaru.trim();
    if (cleaned.length < 2 || cleaned.length > 120) {
      setTambahError("Nama indikator harus 2-120 karakter.");
      return;
    }
    setMenambah(true);
    setTambahError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("indikator")
        .insert({ nama: cleaned, bidang_id: null, user_id: null })
        .select("id")
        .single();
      if (error || !data) {
        if (handleSession(error)) return;
        setTambahError("Gagal menambah indikator. Coba lagi.");
        return;
      }
      setItems((prev) =>
        [
          { id: data.id, nama: cleaned, target: null, owner: "Semua", bulanIni: 0, total: 0 },
          ...prev,
        ].sort((a, b) => a.nama.localeCompare(b.nama, "id"))
      );
      setNamaBaru("");
      toast.success("Indikator ditambahkan. Atur jumlahnya di menu Bidang atau Pengguna.");
    } finally {
      setMenambah(false);
    }
  }

  function openEdit(item: IndikatorRow) {
    setEditItem(item);
    setNama(item.nama);
    setTarget(item.target == null ? "10" : String(item.target));
    setFormError(null);
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !editItem) return;
    if (nama.trim().length < 2 || nama.trim().length > 120) {
      setFormError("Nama indikator harus 2-120 karakter.");
      return;
    }
    const jumlah = Number(target);
    if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > 100000) {
      setFormError("Jumlah per bulan harus angka bulat 1 sampai 100000.");
      return;
    }
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

  function targetText(item: IndikatorRow): string {
    return item.target == null ? "Belum diatur" : String(item.target);
  }

  function bulanIniText(item: IndikatorRow): string {
    return item.target == null
      ? `${item.bulanIni} (target belum diatur)`
      : `${item.bulanIni} dari ${item.target}`;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {items.length === 0 ? "Belum ada indikator." : `${items.length} indikator.`}
      </p>

      {pageError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {pageError}
        </p>
      )}

      <form
        onSubmit={handleTambah}
        className="panel mt-4 hidden items-center gap-2 rounded-lg p-3 md:flex"
      >
        <label htmlFor="indikator-baru" className="sr-only">
          Nama indikator baru
        </label>
        <Input
          id="indikator-baru"
          value={namaBaru}
          onChange={(event) => {
            setNamaBaru(event.target.value);
            setTambahError(null);
          }}
          placeholder="Ketik nama indikator baru..."
          disabled={menambah}
          className="flex-1"
        />
        <Button type="submit" disabled={menambah}>
          <Plus aria-hidden="true" />
          {menambah ? "Menambah..." : "Tambah"}
        </Button>
      </form>
      {tambahError && (
        <p role="alert" className="mt-2 hidden text-sm text-danger md:block">
          {tambahError}
        </p>
      )}

      <form
        onSubmit={handleTambah}
        className="panel mt-4 flex flex-col gap-2 rounded-lg p-3 md:hidden"
      >
        <label htmlFor="indikator-baru-mobile" className="text-sm font-medium">
          Indikator baru
        </label>
        <Input
          id="indikator-baru-mobile"
          value={namaBaru}
          onChange={(event) => {
            setNamaBaru(event.target.value);
            setTambahError(null);
          }}
          placeholder="Ketik nama indikator baru..."
          disabled={menambah}
        />
        {tambahError && (
          <p role="alert" className="text-sm text-danger">
            {tambahError}
          </p>
        )}
        <Button type="submit" disabled={menambah} className="w-full">
          <Plus aria-hidden="true" />
          {menambah ? "Menambah..." : "Tambah"}
        </Button>
      </form>

      {visibleItems.length === 0 ? (
        <EmptyState
          className="mt-4"
          title={query ? "Tidak ada hasil" : "Belum ada indikator"}
          description={
            query
              ? `Tidak ada yang cocok dengan "${query}".`
              : "Ketik nama di atas untuk menambah yang pertama."
          }
        />
      ) : (
        <>
          <div className="panel mt-4 hidden overflow-x-auto rounded-lg md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Nama</th>
                  <th scope="col" className="px-4 py-3 font-medium">Milik</th>
                  <th scope="col" className="px-4 py-3 font-medium">Target per bulan</th>
                  <th scope="col" className="px-4 py-3 font-medium">Bulan ini</th>
                  <th scope="col" className="px-4 py-3 font-medium">Total</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{item.nama}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.owner}</td>
                    <td className="px-4 py-3">{targetText(item)}</td>
                    <td className="px-4 py-3">{bulanIniText(item)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.total}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          onClick={() => openEdit(item)}
                          aria-label={`Ubah ${item.nama}`}
                        >
                          <Pencil aria-hidden="true" />
                          Ubah
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
                          Hapus
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="panel mt-4 divide-y divide-border overflow-hidden rounded-lg md:hidden">
            {visibleItems.map((item) => (
              <li key={item.id} className="px-4 py-4">
                <p className="text-sm font-medium">{item.nama}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.owner}</p>
                <dl className="mt-3 flex flex-col gap-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Target</dt>
                    <dd>{targetText(item)} per bulan</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Bulan ini</dt>
                    <dd>{bulanIniText(item)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Total</dt>
                    <dd className="text-muted-foreground">{item.total}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => openEdit(item)}
                  >
                    <Pencil aria-hidden="true" />
                    Ubah
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setPageError(null);
                      setDeleteTarget(item);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    Hapus
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

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
            <Label htmlFor="indikator-target">Jumlah per bulan</Label>
            <Input
              id="indikator-target"
              type="number"
              min={1}
              max={100000}
              step={1}
              value={target}
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
