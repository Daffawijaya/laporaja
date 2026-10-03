"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassMenu } from "@/components/ui/glass-menu";
import { LiquidGlassTabs } from "@/components/ui/liquid-glass-tabs";
import { RefListCard } from "@/components/ui/ref-list-card";
import { useModalKey } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  UserFormDialog,
  type BidangOption,
  type UserFormInitial,
} from "@/components/admin/user-form-dialog";
import {
  createUserAction,
  deleteUserAction,
  updateUserAction,
  type UserActionResult,
  type UserFormInput,
} from "@/app/admin/users/actions";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export interface AdminUserRow {
  profile: Profile;
  bidangNama: string | null;
  subBidang: string[];
}

// Initial kosong untuk render cadangan saat modal tertutup (tak terlihat).
const EMPTY_USER_FORM_INITIAL: UserFormInitial = {
  nama: "",
  username: "",
  bidangId: null,
  subBidang: [],
};

export function UserManager({
  users,
  bidangOptions,
}: {
  users: AdminUserRow[];
  bidangOptions: BidangOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<
    | { mode: "add" }
    | { mode: "edit"; user: AdminUserRow }
    | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // Modal selalu ke-mount agar exit animation jalan. Key diganti tiap
  // dibuka (form segar), dibiarkan saat ditutup (animasi tutup terbaca).
  const [dialogKey, reopenModal] = useModalKey();

  function openAdd() {
    setServerError(null);
    reopenModal("add");
    setDialog({ mode: "add" });
  }

  function openEdit(user: AdminUserRow) {
    setServerError(null);
    reopenModal(`edit-${user.profile.id}`);
    setDialog({ mode: "edit", user });
  }

  // Filter tab bidang persis pola AdminMonthRecap (laporan): Semua +
  // tiap bidang + Tanpa bidang. Tanpa angka (showCounts false).
  const [filter, setFilter] = useState("semua");
  const filterTabs = [
    { key: "semua", label: "Semua" },
    ...bidangOptions.map((bidang) => ({
      key: `bidang:${bidang.id}`,
      label: bidang.nama,
    })),
    { key: "tanpa", label: "Tanpa bidang" },
  ];

  // Filter dari search global titlebar (?q=).
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const visibleUsers = users.filter((user) => {
    if (
      query &&
      !user.profile.nama.toLowerCase().includes(query) &&
      !user.profile.username.toLowerCase().includes(query)
    ) {
      return false;
    }
    if (filter === "tanpa") return user.profile.bidang_id == null;
    if (filter.startsWith("bidang:")) {
      return user.profile.bidang_id === filter.slice("bidang:".length);
    }
    return true;
  });

  function initialFor(target: { mode: "add" } | { mode: "edit"; user: AdminUserRow }): UserFormInitial {
    if (target.mode === "add") {
      return { nama: "", username: "", bidangId: null, subBidang: [] };
    }
    return {
      nama: target.user.profile.nama,
      username: target.user.profile.username,
      bidangId: target.user.profile.bidang_id,
      subBidang: target.user.subBidang,
    };
  }

  // Sesi berakhir dikembalikan sebagai kode dari Server Action.
  function handleUnauthorized(result: UserActionResult, setLocalError: (value: string) => void): boolean {
    if (result.code === "unauthorized") {
      toast.error(result.message);
      router.replace("/login?expired=1");
      return true;
    }
    setLocalError(result.message);
    return false;
  }

  async function handleSubmit(input: UserFormInput) {
    if (!dialog || saving) return;
    setSaving(true);
    setServerError(null);
    const result =
      dialog.mode === "add"
        ? await createUserAction(input)
        : await updateUserAction(dialog.user.profile.id, input);
    setSaving(false);
    if (!result.ok) {
      handleUnauthorized(result, setServerError);
      return;
    }
    toast.success(result.message);
    setDialog(null);
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setPageError(null);
    const result = await deleteUserAction(deleteTarget.profile.id);
    setDeleting(false);
    if (!result.ok) {
      handleUnauthorized(result, setPageError);
      return;
    }
    toast.success(result.message);
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <div className="w-full">
      {/* Bar filter tab persis AdminMonthRecap (tanpa pilih bulan/tahun). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LiquidGlassTabs
          ariaLabel="Filter bidang"
          value={filter}
          onChange={setFilter}
          showCounts={false}
          tabs={filterTabs}
        />
      </div>

      <RefListCard
        ariaLabel="Tenaga Ahli Pendamping 2026"
        title="Tenaga Ahli Pendamping 2026"
        className="mt-2"
      >
        {pageError && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {pageError}
          </p>
        )}

        {visibleUsers.length === 0 ? (
          <EmptyState
            title={
              query || filter !== "semua" ? "Tidak ada hasil" : "Belum ada user"
            }
            description={
              query
                ? `Tidak ada yang cocok dengan "${query}".`
                : filter !== "semua"
                  ? "Tidak ada user pada filter ini."
                  : "Tambahkan user pertama agar mereka dapat mulai melapor."
            }
            action={
              query || filter !== "semua" ? undefined : (
                <Button onClick={openAdd}>
                  <Plus aria-hidden="true" />
                  Tambah User
                </Button>
              )
            }
          />
        ) : (
          /* Baris ramping ala daftar laporan (RefListCard): judul + subtitle,
             aksi menciut jadi menu titik-tiga lingkaran di kanan. */
          <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
            {visibleUsers.map((user, i) => {
              const pad =
                visibleUsers.length === 1
                  ? ""
                  : i === 0
                    ? " pb-3"
                    : i === visibleUsers.length - 1
                      ? " pt-3"
                      : " py-3";
              const subtitle = `${user.profile.username} · ${user.bidangNama ?? "Tanpa bidang"} · ${
                user.subBidang.length === 0 ? "Belum ada" : user.subBidang.join(", ")
              }`;
              return (
                <li key={user.profile.id}>
                  <div className={`flex items-center justify-between gap-3 px-1${pad}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {user.profile.nama}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-neutral-500">
                        {subtitle}
                      </span>
                    </span>
                    <GlassMenu
                      label={`Aksi ${user.profile.nama}`}
                      items={[
                        {
                          key: "laporan",
                          label: "Lihat laporan",
                          icon: <FileText aria-hidden="true" />,
                          onSelect: () =>
                            router.push(`/admin/laporan?user=${user.profile.id}`),
                        },
                        {
                          key: "edit",
                          label: "Ubah",
                          icon: <Pencil aria-hidden="true" />,
                          onSelect: () => openEdit(user),
                        },
                        {
                          key: "delete",
                          label: "Hapus",
                          icon: <Trash2 aria-hidden="true" />,
                          danger: true,
                          onSelect: () => {
                            setPageError(null);
                            setDeleteTarget(user);
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
      {visibleUsers.length > 0 && (
        <div className="mt-3 flex justify-end">
          <Button onClick={openAdd} className="rounded-full">
            <Plus aria-hidden="true" />
            Tambah
          </Button>
        </div>
      )}

      <UserFormDialog
        key={dialogKey}
        open={dialog !== null}
        title={
          dialog && dialog.mode === "edit"
            ? `Ubah ${dialog.user.profile.username}`
            : "Tambah user"
        }
        initial={dialog ? initialFor(dialog) : EMPTY_USER_FORM_INITIAL}
        bidangOptions={bidangOptions}
        passwordOptional={dialog?.mode === "edit"}
        saving={saving}
        serverError={serverError}
        onClose={() => setDialog(null)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget ? `Hapus user "${deleteTarget.profile.username}"?` : "Hapus user"
        }
        message={
          deleteTarget
            ? "Jika user ini dihapus, akun login beserta seluruh datanya ikut terhapus."
            : ""
        }
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
