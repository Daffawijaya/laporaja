"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

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

export interface IndikatorAwal {
  nama: string;
  target: number | null;
}

export function UserFormDialog({
  open,
  title,
  initial,
  bidangOptions,
  passwordOptional,
  indikatorAwal,
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
  indikatorAwal: IndikatorAwal[];
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
  const [indikatorRows, setIndikatorRows] = useState<
    { key: number; nama: string; target: string }[]
  >(() =>
    indikatorAwal.map((row, index) => ({
      key: index + 1,
      nama: row.nama,
      target: row.target == null ? "" : String(row.target),
    }))
  );
  const keyRef = useRef(indikatorAwal.length);
  const [formError, setFormError] = useState<string | null>(null);

  function addIndikatorRow() {
    keyRef.current += 1;
    setIndikatorRows((prev) => [...prev, { key: keyRef.current, nama: "", target: "10" }]);
    setFormError(null);
  }

  function updateIndikatorRow(key: number, patch: { nama?: string; target?: string }) {
    setIndikatorRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
    setFormError(null);
  }

  function removeIndikatorRow(key: number) {
    setIndikatorRows((prev) => prev.filter((row) => row.key !== key));
    setFormError(null);
  }

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
    for (const row of indikatorRows) {
      if (row.nama.trim().length < 2 || row.nama.trim().length > 120) {
        setFormError("Setiap indikator harus 2-120 karakter.");
        return;
      }
      const jumlah = Number(row.target);
      if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > 100000) {
        setFormError("Jumlah per bulan harus angka bulat 1 sampai 100000.");
        return;
      }
    }
    setFormError(null);
    onSubmit({
      nama: nama.trim(),
      username,
      password,
      bidangId: bidangId === "" ? null : bidangId,
      subBidang,
      indikators: indikatorRows.map((row) => ({ nama: row.nama.trim(), target: Number(row.target) })),
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

        <fieldset>
          <legend className="text-sm font-medium">Indikator kinerja</legend>
          <p className="mt-1 text-xs text-muted-foreground">
            Opsional. Isi nama dan jumlah target per bulan.
          </p>
            {indikatorRows.length > 0 && (
              <ul className="mt-2 flex flex-col gap-2">
                {indikatorRows.map((row) => (
                  <li key={row.key} className="flex items-end gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <Label htmlFor={`indikator-nama-${row.key}`}>Nama</Label>
                      <Input
                        id={`indikator-nama-${row.key}`}
                        value={row.nama}
                        onChange={(event) =>
                          updateIndikatorRow(row.key, { nama: event.target.value })
                        }
                        placeholder="Contoh: Sosialisasi"
                        disabled={saving}
                      />
                    </div>
                    <div className="flex w-24 shrink-0 flex-col gap-1.5">
                      <Label htmlFor={`indikator-target-${row.key}`}>Per bulan</Label>
                      <Input
                        id={`indikator-target-${row.key}`}
                        type="number"
                        min={1}
                        max={100000}
                        step={1}
                        value={row.target}
                        onChange={(event) =>
                          updateIndikatorRow(row.key, { target: event.target.value })
                        }
                        disabled={saving}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeIndikatorRow(row.key)}
                      disabled={saving}
                      aria-label={`Hapus indikator ${row.nama || "baru"}`}
                      className="shrink-0"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={addIndikatorRow}
              disabled={saving}
              className="mt-2 w-full"
            >
              <Plus aria-hidden="true" />
              Tambah Indikator
            </Button>
          </fieldset>

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
