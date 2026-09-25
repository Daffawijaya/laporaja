"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  UserFormDialog,
  type BidangOption,
  type IndikatorAwal,
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

export function UserManager({
  users,
  bidangOptions,
  indikatorsByUser,
}: {
  users: AdminUserRow[];
  bidangOptions: BidangOption[];
  indikatorsByUser: Map<string, IndikatorAwal[]>;
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

  const dialogKey = useMemo(
    () => (dialog?.mode === "edit" ? `edit-${dialog.user.profile.id}` : "add"),
    [dialog]
  );

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
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {users.length === 0 ? "Belum ada user." : `${users.length} user.`}
        </p>
        <Button
          onClick={() => {
            setServerError(null);
            setDialog({ mode: "add" });
          }}
        >
          <Plus aria-hidden="true" />
          Tambah
        </Button>
      </div>

      {pageError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {pageError}
        </p>
      )}

      {users.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="Belum ada user"
          description="Tambahkan user pertama agar mereka dapat mulai melapor."
          action={
            <Button
              onClick={() => {
                setServerError(null);
                setDialog({ mode: "add" });
              }}
            >
              <Plus aria-hidden="true" />
              Tambah User
            </Button>
          }
        />
      ) : (
        <>
          <div className="panel mt-4 hidden overflow-x-auto rounded-lg md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Nama</th>
                  <th scope="col" className="px-4 py-3 font-medium">Username</th>
                  <th scope="col" className="px-4 py-3 font-medium">Bidang</th>
                  <th scope="col" className="px-4 py-3 font-medium">Sub bidang</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.profile.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{user.profile.nama}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.profile.username}</td>
                    <td className="px-4 py-3">{user.bidangNama ?? "Tanpa bidang"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.subBidang.length === 0 ? "Belum ada" : user.subBidang.join(", ")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setServerError(null);
                            setDialog({ mode: "edit", user });
                          }}
                          aria-label={`Ubah ${user.profile.username}`}
                        >
                          <Pencil aria-hidden="true" />
                          Ubah
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setPageError(null);
                            setDeleteTarget(user);
                          }}
                          aria-label={`Hapus ${user.profile.username}`}
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
            {users.map((user) => (
              <li key={user.profile.id} className="px-4 py-4">
                <p className="text-sm font-medium">{user.profile.nama}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{user.profile.username}</p>
                <dl className="mt-3 flex flex-col gap-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Bidang</dt>
                    <dd>{user.bidangNama ?? "Tanpa bidang"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Sub bidang</dt>
                    <dd className="text-muted-foreground">
                      {user.subBidang.length === 0 ? "Belum ada" : user.subBidang.join(", ")}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setServerError(null);
                      setDialog({ mode: "edit", user });
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    Ubah
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setPageError(null);
                      setDeleteTarget(user);
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

      {dialog && (
        <UserFormDialog
          key={dialogKey}
          open
          title={dialog.mode === "add" ? "Tambah user" : `Ubah ${dialog.user.profile.username}`}
          initial={initialFor(dialog)}
          bidangOptions={bidangOptions}
          passwordOptional={dialog.mode === "edit"}
          indikatorAwal={
            dialog.mode === "add"
              ? []
              : (indikatorsByUser.get(dialog.user.profile.id) ?? [])
          }
          saving={saving}
          serverError={serverError}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus user"
        message={
          deleteTarget
            ? `Hapus user '${deleteTarget.profile.username}'? Akun login beserta seluruh datanya ikut terhapus.`
            : ""
        }
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
