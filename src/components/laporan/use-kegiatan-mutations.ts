"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  removeKegiatanFolder,
  removeStoragePaths,
  uploadKegiatanImage,
} from "@/lib/supabase/storage";
import type { DraftBlock } from "@/components/laporan/blocks-editor";
import type { KegiatanItem } from "@/components/laporan/types";

export interface KegiatanSaveInput {
  nama: string;
  tanggal: string;
  blocks: DraftBlock[];
}

// Seluruh tulis data memakai sesi user sendiri sehingga RLS pemilik berlaku.
// Tidak ada service role di sisi client.
export function useKegiatanMutations(userId: string) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cleanInput(input: KegiatanSaveInput) {
    const nama = input.nama.trim();
    if (nama.length < 2 || nama.length > 200) {
      throw new Error("Nama kegiatan harus 2-200 karakter.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.tanggal)) {
      throw new Error("Tanggal tidak valid.");
    }
    const blocks = input.blocks.filter((block) =>
      block.tipe === "text"
        ? block.text.trim().length > 0
        : block.file !== null || block.storedPath !== null
    );
    return { nama, tanggal: input.tanggal, blocks };
  }

  async function saveAdd(input: KegiatanSaveInput): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const cleaned = cleanInput(input);
      const supabase = createClient();
      const { data: kegiatan, error: insertError } = await supabase
        .from("kegiatan")
        .insert({ user_id: userId, tanggal: cleaned.tanggal, nama_kegiatan: cleaned.nama })
        .select("id")
        .single();
      if (insertError || !kegiatan) {
        throw new Error("Gagal menambah kegiatan. Coba lagi.");
      }
      await replaceKeterangan(supabase, userId, kegiatan.id, cleaned.blocks, []);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(item: KegiatanItem, input: KegiatanSaveInput): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const cleaned = cleanInput(input);
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("kegiatan")
        .update({ tanggal: cleaned.tanggal, nama_kegiatan: cleaned.nama })
        .eq("id", item.id)
        .eq("user_id", userId);
      if (updateError) throw new Error("Gagal menyimpan perubahan. Coba lagi.");
      const oldPaths = item.keterangan
        .filter((row) => row.tipe === "image" && row.image_url)
        .map((row) => row.image_url as string);
      await replaceKeterangan(supabase, userId, item.id, cleaned.blocks, oldPaths);
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: KegiatanItem): Promise<boolean> {
    setDeleting(true);
    setError(null);
    try {
      const supabase = createClient();
      await removeKegiatanFolder(supabase, userId, item.id);
      const { error: deleteError } = await supabase
        .from("kegiatan")
        .delete()
        .eq("id", item.id)
        .eq("user_id", userId);
      if (deleteError) throw new Error("Gagal menghapus kegiatan. Coba lagi.");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus.");
      return false;
    } finally {
      setDeleting(false);
    }
  }

  return { saving, deleting, error, setError, saveAdd, saveEdit, remove };
}

type Client = ReturnType<typeof createClient>;

async function replaceKeterangan(
  supabase: Client,
  userId: string,
  kegiatanId: string,
  blocks: DraftBlock[],
  oldPaths: string[]
): Promise<void> {
  const { error: hapusError } = await supabase
    .from("keterangan_kegiatan")
    .delete()
    .eq("kegiatan_id", kegiatanId);
  if (hapusError) throw new Error("Gagal menyimpan keterangan. Coba lagi.");

  const rows: {
    kegiatan_id: string;
    tipe: "text" | "image";
    isi_text: string | null;
    image_url: string | null;
    urutan: number;
  }[] = [];
  const usedPaths = new Set<string>();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.tipe === "text") {
      rows.push({
        kegiatan_id: kegiatanId,
        tipe: "text",
        isi_text: block.text.trim(),
        image_url: null,
        urutan: i,
      });
    } else {
      const path = block.file
        ? await uploadKegiatanImage(supabase, userId, kegiatanId, block.file)
        : (block.storedPath as string);
      usedPaths.add(path);
      const caption = block.text.trim();
      rows.push({
        kegiatan_id: kegiatanId,
        tipe: "image",
        isi_text: caption.length > 0 ? caption : null,
        image_url: path,
        urutan: i,
      });
    }
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("keterangan_kegiatan").insert(rows);
    if (insertError) throw new Error("Gagal menyimpan keterangan. Coba lagi.");
  }

  await removeStoragePaths(
    supabase,
    oldPaths.filter((path) => !usedPaths.has(path))
  );
}
