"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Editor daftar sub bidang sebagai state string sederhana, bukan nested form.
// Dipakai di dalam form user, hasilnya dikirim sebagai array nama.
export function SubBidangEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  function validate(nama: string, skipIndex: number | null): string | null {
    const cleaned = nama.trim();
    if (cleaned.length < 2 || cleaned.length > 120) {
      return "Sub bidang harus 2-120 karakter.";
    }
    const duplikat = value.some(
      (item, index) =>
        index !== skipIndex && item.toLowerCase() === cleaned.toLowerCase()
    );
    if (duplikat) return "Sub bidang ini sudah ada di daftar.";
    return null;
  }

  function handleAdd() {
    if (disabled) return;
    const failed = validate(draft, null);
    if (failed) {
      setError(failed);
      return;
    }
    setError(null);
    onChange([...value, draft.trim()]);
    setDraft("");
  }

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditDraft(value[index]);
    setError(null);
  }

  function saveEdit() {
    if (editingIndex === null) return;
    const failed = validate(editDraft, editingIndex);
    if (failed) {
      setError(failed);
      return;
    }
    setError(null);
    onChange(value.map((item, index) => (index === editingIndex ? editDraft.trim() : item)));
    setEditingIndex(null);
    setEditDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="sub-bidang-input">Sub bidang</Label>
      <div className="flex gap-2">
        <Input
          id="sub-bidang-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Contoh: Kecamatan Tenggarong"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleAdd}
          disabled={disabled}
          aria-label="Tambah sub bidang"
        >
          <Plus aria-hidden="true" />
          Tambah
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {value.length > 0 && (
        <ul className="flex flex-col gap-1">
          {value.map((item, index) =>
            editingIndex === index ? (
              <li key={`${item}-${index}`} className="flex gap-2">
                <Input
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveEdit();
                    }
                  }}
                  disabled={disabled}
                  aria-label="Ubah sub bidang"
                />
                <Button type="button" onClick={saveEdit} disabled={disabled}>
                  Simpan
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingIndex(null)}
                  disabled={disabled}
                >
                  Batal
                </Button>
              </li>
            ) : (
              <li
                key={`${item}-${index}`}
                className="flex min-h-[44px] items-center justify-between gap-2 rounded-md border border-border bg-surface px-3"
              >
                <span className="min-w-0 truncate text-sm">{item}</span>
                <span className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => startEdit(index)}
                    disabled={disabled}
                    aria-label={`Ubah ${item}`}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                    disabled={disabled}
                    aria-label={`Hapus ${item}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </span>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
