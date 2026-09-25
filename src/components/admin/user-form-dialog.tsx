"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { SubBidangEditor } from "@/components/admin/sub-bidang-editor";
import { isValidUsername } from "@/lib/auth/username";
import type { UserFormInput } from "@/app/admin/users/actions";

export interface UserFormInitial {
  nama: string;
  username: string;
  bidangId: string | null;
  subBidang: string[];
}

export interface BidangOption {
  id: string;
  nama: string;
}

export function UserFormDialog({
  open,
  title,
  initial,
  bidangOptions,
  passwordOptional,
  saving,
  serverError,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: UserFormInitial;
  bidangOptions: BidangOption[];
  passwordOptional: boolean;
  saving: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (input: UserFormInput) => void;
}) {
  const [nama, setNama] = useState(initial.nama);
  const [username, setUsername] = useState(initial.username);
  const [password, setPassword] = useState("");
  const [bidangId, setBidangId] = useState(initial.bidangId ?? "");
  const [subBidang, setSubBidang] = useState<string[]>(initial.subBidang);
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (nama.trim().length === 0) {
      setFormError("Nama wajib diisi.");
      return;
    }
    if (nama.trim().length < 2 || nama.trim().length > 120) {
      setFormError("Nama harus 2-120 karakter.");
      return;
    }
    if (username.trim().length === 0) {
      setFormError("Username wajib diisi.");
      return;
    }
    if (!isValidUsername(username)) {
      setFormError("Username harus 3-32 karakter: huruf kecil, angka, titik, underscore, atau strip.");
      return;
    }
    if (!passwordOptional && password.length === 0) {
      setFormError("Kata sandi wajib diisi.");
      return;
    }
    if (!passwordOptional && password.length < 8) {
      setFormError("Kata sandi minimal 8 karakter.");
      return;
    }
    if (passwordOptional && password.length > 0 && password.length < 8) {
      setFormError("Kata sandi minimal 8 karakter.");
      return;
    }
    setFormError(null);
    onSubmit({
      nama: nama.trim(),
      username,
      password,
      bidangId: bidangId === "" ? null : bidangId,
      subBidang,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="user-nama">Nama</Label>
          <Input
            id="user-nama"
            value={nama}
            onChange={(event) => {
              setNama(event.target.value);
              setFormError(null);
            }}
            placeholder="Contoh: Daffa"
            disabled={saving}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="user-username">Username</Label>
          <Input
            id="user-username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setFormError(null);
            }}
            placeholder="Contoh: daffa"
            autoComplete="off"
            disabled={saving}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="user-password">Kata sandi</Label>
          <Input
            id="user-password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFormError(null);
            }}
            placeholder={passwordOptional ? "Kosongkan bila tidak diubah" : "Minimal 8 karakter"}
            autoComplete="new-password"
            disabled={saving}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="user-bidang">Bidang</Label>
          <Select
            id="user-bidang"
            value={bidangId}
            onChange={(event) => setBidangId(event.target.value)}
            disabled={saving}
          >
            <option value="">Tanpa bidang</option>
            {bidangOptions.map((bidang) => (
              <option key={bidang.id} value={bidang.id}>
                {bidang.nama}
              </option>
            ))}
          </Select>
        </div>

        <SubBidangEditor
          value={subBidang}
          onChange={(next) => {
            setSubBidang(next);
            setFormError(null);
          }}
          disabled={saving}
        />

        {(formError || serverError) && (
          <p role="alert" className="text-sm text-danger">
            {formError ?? serverError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
