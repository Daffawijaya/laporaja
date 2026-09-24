"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KegiatanFormDialog, type KegiatanFormInput } from "@/components/laporan/kegiatan-form-dialog";
import { useKegiatanMutations } from "@/components/laporan/use-kegiatan-mutations";
import { tanggalISO } from "@/components/laporan/types";

// Tombol utama dashboard user. Tanggal bisa dipilih langsung di dialog.
export function TambahKegiatanButton({ userId }: { userId: string }) {
  const { saving, error, setError, saveAdd } = useKegiatanMutations(userId);
  const [open, setOpen] = useState(false);
  const [today] = useState(() => {
    const now = new Date();
    return tanggalISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
  });

  async function handleSubmit(input: KegiatanFormInput) {
    const ok = await saveAdd(input);
    if (ok) setOpen(false);
  }

  return (
    <>
      <Button
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="w-full sm:w-auto"
      >
        <Plus aria-hidden="true" />
        Tambah Kegiatan
      </Button>

      {open && (
        <KegiatanFormDialog
          open
          title="Tambah kegiatan"
          initial={{ nama: "", tanggal: today, blocks: [] }}
          dateLabel="Pilih tanggal kegiatan"
          allowDateChange
          saving={saving}
          serverError={error}
          onClose={() => setOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
