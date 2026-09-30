"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassMenu } from "@/components/ui/glass-menu";
import { RefListCard } from "@/components/ui/ref-list-card";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import type { LaporanAdminItem } from "@/lib/laporan-tambahan/queries";

export function LaporanTambahanManager({
  initial,
}: {
  initial: LaporanAdminItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [deleteTarget, setDeleteTarget] = useState<LaporanAdminItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  // Modal tambah bidang: semua bidang + checkbox, tautan awal dimuat ulang
  // saat dibuka agar segar.
  const [bidangTarget, setBidangTarget] = useState<LaporanAdminItem | null>(null);
  const [semuaBidang, setSemuaBidang] = useState<{ id: string; nama: string }[]>([]);
  const [awalIds, setAwalIds] = useState<string[]>([]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [bidangLoading, setBidangLoading] = useState(false);
  const [bidangError, setBidangError] = useState<string | null>(null);
  const [bidangSaving, setBidangSaving] = useState(false);

  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const visibleItems = query
    ? items.filter((item) => item.judul.toLowerCase().includes(query))
    : items;

  function goAdd() {
    router.push("/admin/laporan-tambahan/baru");
  }

  function handleSession(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  async function openBidang(item: LaporanAdminItem) {
    setBidangTarget(item);
    setBidangError(null);
    setAwalIds(item.bidang.map((bidang) => bidang.id));
    setCheckedIds(item.bidang.map((bidang) => bidang.id));
    setBidangLoading(true);
    try {
      const supabase = createClient();
      const [bidangRes, linkRes] = await Promise.all([
        supabase.from("bidang").select("id, nama").order("nama"),
        supabase.from("laporan_tambahan_bidang").select("bidang_id").eq("laporan_id", item.id),
      ]);
      if (bidangRes.error || linkRes.error) {
        if (handleSession(bidangRes.error ?? linkRes.error)) return;
        setBidangError("Gagal memuat bidang. Coba lagi.");
        return;
      }
      setSemuaBidang(bidangRes.data ?? []);
      const taut = (linkRes.data ?? []).map((row) => row.bidang_id);
      setAwalIds(taut);
      setCheckedIds(taut);
    } finally {
      setBidangLoading(false);
    }
  }

  function toggleBidangModal(id: string) {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setBidangError(null);
  }

  async function handleSimpanBidang(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bidangTarget || bidangSaving) return;
    const tambah = checkedIds.filter((id) => !awalIds.includes(id));
    const hapus = awalIds.filter((id) => !checkedIds.includes(id));
    if (tambah.length === 0 && hapus.length === 0) {
      setBidangTarget(null);
      return;
    }
    setBidangSaving(true);
    setBidangError(null);
    try {
      const supabase = createClient();
      if (hapus.length > 0) {
        const { error } = await supabase
          .from("laporan_tambahan_bidang")
          .delete()
          .eq("laporan_id", bidangTarget.id)
          .in("bidang_id", hapus);
        if (error) {
          if (handleSession(error)) return;
          setBidangError("Gagal menyimpan. Coba lagi.");
          return;
        }
      }
      if (tambah.length > 0) {
        const { error } = await supabase.from("laporan_tambahan_bidang").insert(
          tambah.map((bidang_id) => ({ laporan_id: bidangTarget.id, bidang_id }))
        );
        if (error) {
          if (handleSession(error)) return;
          setBidangError("Gagal menyimpan. Coba lagi.");
          return;
        }
      }
      // Hitung ulang target & pengisi agar angka di daftar langsung benar.
      const laporanId = bidangTarget.id;
      const [userRes, barisRes] = await Promise.all([
        checkedIds.length > 0
          ? supabase.from("profiles").select("id").eq("role", "user").in("bidang_id", checkedIds)
          : Promise.resolve({ data: [] as { id: string }[], error: null }),
        supabase.from("laporan_tambahan_baris").select("user_id").eq("laporan_id", laporanId),
      ]);
      if (userRes.error || barisRes.error) {
        if (handleSession(userRes.error ?? barisRes.error)) return;
        setBidangError("Bidang tersimpan, tapi gagal memuat ulang. Muat ulang halaman.");
        return;
      }
      const targetUser = (userRes.data ?? []).length;
      const terisiUser = new Set((barisRes.data ?? []).map((row) => row.user_id)).size;
      const bidangBaru = semuaBidang.filter((bidang) => checkedIds.includes(bidang.id));
      setItems((prev) =>
        prev.map((item) =>
          item.id === laporanId ? { ...item, bidang: bidangBaru, targetUser, terisiUser } : item
        )
      );
      setBidangTarget(null);
      toast.success("Bidang diperbarui.");
      router.refresh();
    } finally {
      setBidangSaving(false);
    }
  }

  async function handleDelete() {    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setPageError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("laporan_tambahan").delete().eq("id", deleteTarget.id);
      if (error) {
        if (handleSession(error)) return;
        setPageError("Gagal menghapus laporan. Coba lagi.");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Laporan tambahan dihapus.");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="w-full">
      <RefListCard ariaLabel="Laporan tambahan">
        {pageError && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {pageError}
          </p>
        )}

        {visibleItems.length === 0 ? (
          <EmptyState
            title={query ? "Tidak ada hasil" : "Belum ada laporan tambahan"}
            description={
              query
                ? `Tidak ada yang cocok dengan "${query}".`
                : "Buat laporan tambahan pertama untuk ditugaskan ke bidang."
            }
            action={
              query ? undefined : (
                <Button onClick={goAdd}>
                  <Plus aria-hidden="true" />
                  Buat Laporan
                </Button>
              )
            }
          />
        ) : (
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
              const lengkap = item.targetUser > 0 && item.terisiUser >= item.targetUser;
              return (
                <li key={item.id}>
                  <div className={`flex items-center justify-between gap-3 px-1${pad}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.judul}</span>
                      <span className="mt-0.5 block truncate text-xs text-neutral-500">
                        {item.jumlahKolom} kolom
                        {" · "}
                        {item.bidang.map((bidang) => bidang.nama).join(", ") || "Tanpa bidang"}
                        {" · "}
                        {item.targetUser === 0
                          ? "Belum ada user target"
                          : lengkap
                            ? "Semua user sudah mengisi"
                            : `${item.terisiUser}/${item.targetUser} user mengisi`}
                      </span>
                    </span>
                    <GlassMenu
                      label={`Aksi ${item.judul}`}
                      items={[
                        {
                          key: "lihat",
                          label: "Lihat",
                          icon: <Eye aria-hidden="true" />,
                          onSelect: () => router.push(`/admin/laporan-tambahan?id=${item.id}`),
                        },
                        {
                          key: "bidang",
                          label: "Tambah bidang",
                          icon: <Plus aria-hidden="true" />,
                          onSelect: () => {
                            setPageError(null);
                            openBidang(item);
                          },
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
          <Button onClick={goAdd} className="rounded-full">
            <Plus aria-hidden="true" />
            Buat
          </Button>
        </div>
      )}

      <Dialog
        open={bidangTarget !== null}
        onClose={() => setBidangTarget(null)}
        title={bidangTarget ? `Tambah bidang ${bidangTarget.judul}` : "Tambah bidang"}
      >
        {bidangLoading ? (
          <p className="text-sm text-muted-foreground">Memuat...</p>
        ) : (
          <>
            <h3 className="text-[15px] font-semibold text-foreground">
              {bidangTarget ? `Tambah bidang "${bidangTarget.judul}"` : "Tambah bidang"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pilih bidang yang wajib mengisi laporan ini.
            </p>
            <form onSubmit={handleSimpanBidang} className="mt-4">
              {semuaBidang.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Belum ada bidang. Tambahkan dulu di menu Bidang.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {semuaBidang.map((bidang) => (
                    <li key={bidang.id} className="px-1 py-0.5">
                      <label className="flex min-h-[28px] cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checkedIds.includes(bidang.id)}
                          onChange={() => toggleBidangModal(bidang.id)}
                          disabled={bidangSaving}
                          className="size-4 shrink-0 accent-[#0071e3]"
                        />
                        <span className="min-w-0 truncate text-sm">{bidang.nama}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {bidangError && (
                <p role="alert" className="mt-4 text-sm text-danger">
                  {bidangError}
                </p>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setBidangTarget(null)}
                  disabled={bidangSaving}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={bidangSaving || bidangLoading}
                >
                  {bidangSaving ? "Menyimpan..." : "Simpan"}
                </Button>
              </div>
            </form>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget ? `Hapus laporan tambahan "${deleteTarget.judul}"?` : "Hapus laporan tambahan"
        }
        message={
          deleteTarget
            ? "Jika laporan ini dihapus, seluruh baris isiannya ikut terhapus."
            : ""
        }
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
