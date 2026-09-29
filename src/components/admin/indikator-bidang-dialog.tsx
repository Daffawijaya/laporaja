"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassMenu } from "@/components/ui/glass-menu";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";

interface BidangIndikator {
  id: string;
  nama: string;
  target: number | null;
  bulanIni: number;
  total: number;
}

// Kelola indikator milik satu bidang. Dibuka dari menu Bidang, tanpa pilih user.
export function IndikatorBidangDialog({
  bidangId,
  bidangNama,
  open,
  onClose,
}: {
  bidangId: string;
  bidangNama: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<BidangIndikator[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Satu form inline untuk tambah-baru & ubah (null = tutup).
  const [form, setForm] = useState<null | { mode: "add" } | { mode: "edit"; item: BidangIndikator }>(null);
  const [nama, setNama] = useState("");
  const [target, setTarget] = useState("");
  const [globalList, setGlobalList] = useState<
    { id: string; nama: string; target: number | null }[]
  >([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BidangIndikator | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function muat(batalRef: { batal: boolean }) {
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = createClient();
      const [{ data, error }, { data: globalData, error: globalError }] =
        await Promise.all([
          supabase
            .from("indikator")
            .select("id, nama, target_bulanan")
            .eq("bidang_id", bidangId)
            .order("nama"),
          // Kandidat tautan: indikator global (tanpa bidang & tanpa user).
          supabase
            .from("indikator")
            .select("id, nama, target_bulanan")
            .is("bidang_id", null)
            .is("user_id", null)
            .order("nama"),
        ]);
      if (error) throw error;
      if (globalError) throw globalError;
      const list = data ?? [];
      const hitung = new Map<string, { bulanIni: number; total: number }>();
      if (list.length > 0) {
        const now = new Date();
        const awal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const { data: links, error: linksError } = await supabase
          .from("kegiatan_indikator")
          .select("indikator_id, kegiatan!inner(tanggal)")
          .in("indikator_id", list.map((row) => row.id));
        if (linksError) throw linksError;
        for (const row of list) hitung.set(row.id, { bulanIni: 0, total: 0 });
        for (const link of links ?? []) {
          const tanggal = (link.kegiatan as unknown as { tanggal: string } | null)?.tanggal;
          if (!tanggal) continue;
          const hit = hitung.get(link.indikator_id);
          if (!hit) continue;
          hit.total += 1;
          if (tanggal >= awal) hit.bulanIni += 1;
        }
      }
      if (!batalRef.batal) {
        setItems(
          list.map((row) => ({
            id: row.id,
            nama: row.nama,
            target: row.target_bulanan,
            bulanIni: hitung.get(row.id)?.bulanIni ?? 0,
            total: hitung.get(row.id)?.total ?? 0,
          }))
        );
        setGlobalList(
          (globalData ?? []).map((row) => ({
            id: row.id,
            nama: row.nama,
            target: row.target_bulanan,
          }))
        );
      }
    } catch (error) {
      if (error instanceof SessionExpiredError || isSessionError(error)) {
        toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
        return;
      }
      if (!batalRef.batal) setLoadError("Gagal memuat indikator. Coba lagi.");
    } finally {
      if (!batalRef.batal) setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const batalRef = { batal: false };
    // Fetch-on-open yang sah: muat() melakukan setState awal lalu await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    muat(batalRef);
    return () => {
      batalRef.batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bidangId]);

  function openAdd() {
    setForm({ mode: "add" });
    setNama("");
    setTarget("");
    setFormError(null);
  }

  function openEdit(item: BidangIndikator) {
    setForm({ mode: "edit", item });
    setNama(item.nama);
    setTarget(item.target == null ? "" : String(item.target));
    setFormError(null);
  }

  function closeForm() {
    setForm(null);
    setFormError(null);
  }

  // Tautkan indikator global yang sudah ada ke bidang ini (klik langsung
  // dari dropdown, tanpa form).
  async function tautkan(id: string) {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("indikator")
        .update({ bidang_id: bidangId })
        .eq("id", id);
      if (error) throw error;
      await muat({ batal: false });
      toast.success("Indikator ditambahkan ke bidang ini.");
    } catch (error) {
      if (error instanceof SessionExpiredError || isSessionError(error)) {
        toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
        return;
      }
      toast.error("Gagal menambahkan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  // Target opsional: kosong = null (tanpa target).
  function validate(): { jumlah: number | null } | { error: string } {
    if (nama.trim().length < 2 || nama.trim().length > 120) {
      return { error: "Nama indikator harus 2-120 karakter." };
    }
    if (target.trim() === "") return { jumlah: null };
    const jumlah = Number(target);
    if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > 100000) {
      return { error: "Target per bulan harus angka bulat 1 sampai 100000." };
    }
    return { jumlah };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const valid = validate();
    if ("error" in valid) {
      setFormError(valid.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const payload = { nama: nama.trim(), target_bulanan: valid.jumlah };
      const editItem = form?.mode === "edit" ? form.item : null;
      if (editItem) {
        const { error } = await supabase
          .from("indikator")
          .update(payload)
          .eq("id", editItem.id);
        if (error) throw error;
        setItems((prev) =>
          prev.map((item) =>
            item.id === editItem.id
              ? { ...item, nama: payload.nama, target: payload.target_bulanan }
              : item
          )
        );
        toast.success("Perubahan disimpan.");
      } else {
        const { data, error } = await supabase
          .from("indikator")
          .insert({ ...payload, bidang_id: bidangId })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("Gagal menambah indikator.");
        setItems((prev) =>
          [
            ...prev,
            { id: data.id, nama: payload.nama, target: payload.target_bulanan, bulanIni: 0, total: 0 },
          ].sort((a, b) => a.nama.localeCompare(b.nama, "id"))
        );
        toast.success("Indikator ditambahkan.");
      }
      setForm(null);
    } catch (error) {
      if (error instanceof SessionExpiredError || isSessionError(error)) {
        toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
        return;
      }
      setFormError("Gagal menyimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("indikator").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Indikator dihapus.");
    } catch (error) {
      if (error instanceof SessionExpiredError || isSessionError(error)) {
        toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
        return;
      }
      toast.error("Gagal menghapus indikator. Coba lagi.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} title={`Indikator ${bidangNama}`}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Memuat...</p>
        ) : loadError ? (
          <p role="alert" className="text-sm text-danger">
            {loadError}
          </p>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{items.length} indikator.</p>
              {/* Dropdown Tambah: Buat baru + indikator global yang belum
                  dipilih. Klik global langsung menautkan ke list. */}
              <GlassMenu
                label="Tambah indikator"
                trigger={(api) => (
                  <Button
                    ref={api.ref}
                    type="button"
                    onClick={api.onClick}
                    onKeyDown={api.onKeyDown}
                    aria-haspopup="menu"
                    aria-expanded={api.open}
                    aria-label={api.label}
                    disabled={saving}
                  >
                    <Plus aria-hidden="true" />
                    Tambah
                  </Button>
                )}
                items={[
                  {
                    key: "baru",
                    label: "Buat baru",
                    icon: <Plus aria-hidden="true" />,
                    onSelect: openAdd,
                  },
                  ...globalList.map((row) => ({
                    key: row.id,
                    label: row.nama,
                    onSelect: () => tautkan(row.id),
                  })),
                ]}
              />
            </div>
            {/* Form tambah-baru / ubah, mengembang smooth di dalam modal. */}
            <AnimatePresence initial={false}>
              {form && (
                <motion.div
                  key="indikator-form"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <form
                    onSubmit={handleSubmit}
                    className="mt-3 flex flex-col gap-4 rounded-2xl bg-neutral-50 p-3 dark:bg-white/5"
                  >
                    <p className="text-sm font-medium">
                      {form.mode === "edit" ? "Ubah indikator" : "Buat indikator baru"}
                    </p>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="bidang-indikator-nama">Nama indikator</Label>
                      <Input
                        id="bidang-indikator-nama"
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
                      <Label htmlFor="bidang-indikator-target">Target per bulan</Label>
                      <Input
                        id="bidang-indikator-target"
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
                </motion.div>
              )}
            </AnimatePresence>
            {items.length === 0 ? (
              <EmptyState
                className="mt-3"
                title="Belum ada indikator"
                description="Tambahkan lewat tombol Tambah di atas."
              />
            ) : (
            <ul className="panel mt-3 divide-y divide-border overflow-hidden rounded-lg">
              {items.map((item) => {
                const persen =
                  item.target == null
                    ? 0
                    : Math.min(100, Math.round((item.bulanIni / item.target) * 100));
                return (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.nama}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.target == null
                            ? `${item.bulanIni} (target belum diatur)`
                            : `${item.bulanIni} dari ${item.target} bulan ini`}
                          {" · "}
                          total {item.total}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          onClick={() => openEdit(item)}
                          aria-label={`Ubah ${item.nama}`}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setDeleteTarget(item)}
                          aria-label={`Hapus ${item.nama}`}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    {item.target != null && (
                      <div
                        role="progressbar"
                        aria-valuenow={item.bulanIni}
                        aria-valuemin={0}
                        aria-valuemax={item.target}
                        aria-label={`Capaian ${item.nama}`}
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                      >
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${persen}%` }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            )}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget ? `Hapus indikator "${deleteTarget.nama}"?` : "Hapus indikator"
        }
        message={
          deleteTarget
            ? "Jika indikator ini dihapus, tautan ke kegiatan ikut terhapus."
            : ""
        }
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}
