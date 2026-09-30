"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
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
