"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlignLeft, Table, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import type { BuilderItem } from "@/lib/laporan-tambahan/queries";
import {
  InfoCard,
  SectionEditor,
  editorKey,
} from "@/components/admin/section-editor";

// Builder susun laporan ala Google Forms: tumpukan kartu yang bisa
// digeser (drag gagang atau panah keyboard), tiap kartu langsung bisa
// diubah isinya. Panel kanan mengatur bidang pengisi per section.
export function SectionBuilder({
  initialItems,
  bidangList,
  userCountByBidang,
  jabatanAwal,
  unitKerjaAwal,
  infoJudulAwal,
}: {
  initialItems: BuilderItem[];
  bidangList: { id: string; nama: string }[];
  userCountByBidang: Record<string, number>;
  jabatanAwal: string;
  unitKerjaAwal: string;
  infoJudulAwal: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  // Selaraskan dengan data server sesudah refresh/navigasi (render-phase
  // sync: hanya saat referensi data server berganti, optimisme lokal aman).
  const [synced, setSynced] = useState(initialItems);
  if (synced !== initialItems) {
    setSynced(initialItems);
    setItems(initialItems);
  }
  const [orderBusy, setOrderBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BuilderItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [bidangBusy, setBidangBusy] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menambah, setMenambah] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Tambah instan ala Google Forms: kartu langsung jadi di paling bawah,
  // judulnya terfokus. Bidang diatur sesudahnya di panel kanan.
  async function tambahCepat(format: "tabel" | "esai" | "judul") {
    if (menambah) return;
    setMenambah(true);
    setPageError(null);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const urutan =
        ordered.length > 0 ? Math.max(...ordered.map((row) => row.urutan)) + 10 : 0;
      const { data, error } = await supabase
        .from("laporan_tambahan")
        .insert({
          judul: "Section tanpa judul",
          deskripsi: null,
          format,
          urutan,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error || !data) {
        if (handleSession(error)) return;
        setPageError("Gagal menambah section. Coba lagi.");
        return;
      }
      if (format !== "judul") {
        const { error: kolomError } = await supabase
          .from("laporan_tambahan_kolom")
          .insert(
            format === "esai"
              ? [{ laporan_id: data.id, label: "Isian", tipe: "textarea" as const, wajib: true, urutan: 0 }]
              : [{ laporan_id: data.id, label: "Kolom 1", tipe: "text" as const, wajib: true, urutan: 0 }]
          );
        if (kolomError) {
          await supabase.from("laporan_tambahan").delete().eq("id", data.id);
          if (handleSession(kolomError)) return;
          setPageError("Gagal menambah section. Coba lagi.");
          return;
        }
      }
      setFocusId(`tambahan-${data.id}`);
      toast.success("Section ditambahkan.");
      router.refresh();
    } finally {
      setMenambah(false);
    }
  }

  // Gandakan section: judul + bentuk + kolom + bidang, jadi di paling
  // bawah dan langsung terfokus.
  async function duplicateSection(item: BuilderItem) {
    if (duplicating) return;
    setDuplicating(true);
    setPageError(null);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const urutan =
        ordered.length > 0 ? Math.max(...ordered.map((row) => row.urutan)) + 10 : 0;
      const { data: kolomSrc, error: kolomErr } = await supabase
        .from("laporan_tambahan_kolom")
        .select("label, tipe, wajib, urutan")
        .eq("laporan_id", item.id)
        .order("urutan");
      if (kolomErr) {
        if (handleSession(kolomErr)) return;
        setPageError("Gagal menyalin section. Coba lagi.");
        return;
      }
      const { data, error } = await supabase
        .from("laporan_tambahan")
        .insert({
          judul: item.judul,
          deskripsi: item.deskripsi,
          format: item.format,
          urutan,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error || !data) {
        if (handleSession(error)) return;
        setPageError("Gagal menyalin section. Coba lagi.");
        return;
      }
      const kolomRows = (kolomSrc ?? []).map((col) => ({
        laporan_id: data.id,
        label: col.label,
        tipe: col.tipe,
        wajib: col.wajib,
        urutan: col.urutan,
      }));
      if (kolomRows.length > 0) {
        const { error: kolomError } = await supabase
          .from("laporan_tambahan_kolom")
          .insert(kolomRows);
        if (kolomError) {
          await supabase.from("laporan_tambahan").delete().eq("id", data.id);
          if (handleSession(kolomError)) return;
          setPageError("Gagal menyalin section. Coba lagi.");
          return;
        }
      }
      const bidangIds = item.bidang.map((bidang) => bidang.id);
      if (bidangIds.length > 0) {
        const { error: linkError } = await supabase
          .from("laporan_tambahan_bidang")
          .insert(bidangIds.map((bidang_id) => ({ laporan_id: data.id, bidang_id })));
        if (linkError) {
          await supabase.from("laporan_tambahan").delete().eq("id", data.id);
          if (handleSession(linkError)) return;
          setPageError("Gagal menyalin section. Coba lagi.");
          return;
        }
      }
      setFocusId(`tambahan-${data.id}`);
      toast.success("Section disalin.");
      router.refresh();
    } finally {
      setDuplicating(false);
    }
  }

  // Filter dari search global titlebar (?q=). Geser nonaktif saat mencari.
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  const ordered = [...items].sort((a, b) => a.urutan - b.urutan);

  function handleSession(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  // Terapkan susunan baru: urutan = posisi x 10, simpan yang berubah.
  async function applyOrder(next: BuilderItem[]) {
    if (orderBusy) return;
    const prev = items;
    const denganUrutan = next.map((row, index) => ({ ...row, urutan: index * 10 }));
    setOrderBusy(true);
    setPageError(null);
    setItems(denganUrutan);
    try {
      const supabase = createClient();
      const berubah = denganUrutan.filter((row) => {
        const lama = prev.find((row2) => editorKey(row2) === editorKey(row));
        return !lama || lama.urutan !== row.urutan;
      });
      const hasil = await Promise.all(
        berubah.map((row) =>
          supabase.from("laporan_tambahan").update({ urutan: row.urutan }).eq("id", row.id)
        )
      );
      const gagal = hasil.find((row) => row.error)?.error;
      if (gagal) {
        if (handleSession(gagal)) return;
        setItems(prev);
        setPageError("Gagal menyimpan urutan. Coba lagi.");
        return;
      }
      router.refresh();
    } finally {
      setOrderBusy(false);
    }
  }

  function handleReorder(keys: string[]) {
    const byKey = new Map(ordered.map((row) => [editorKey(row), row]));
    const next = keys
      .map((key) => byKey.get(key))
      .filter((row): row is BuilderItem => row !== undefined);
    if (next.length !== ordered.length) return;
    void applyOrder(next);
  }

  function handleMoveKey(item: BuilderItem, arah: -1 | 1) {
    const index = ordered.findIndex((row) => editorKey(row) === editorKey(item));
    const j = index + arah;
    if (index < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    next[index] = ordered[j];
    next[j] = ordered[index];
    void applyOrder(next);
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
        setPageError("Gagal menghapus section. Coba lagi.");
        return;
      }
      const targetId = deleteTarget.id;
      setItems((prev) => prev.filter((item) => item.id !== targetId));
      setDeleteTarget(null);
      toast.success("Section dihapus.");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  // Centang bidang langsung tersimpan: tambah/hapus tautan lalu hitung
  // ulang daftar bidang dan target user dari matriks.
  async function toggleBidang(item: BuilderItem, bidangId: string) {
    const kunci = `${editorKey(item)}-${bidangId}`;
    if (bidangBusy) return;
    const punya = item.bidang.some((bidang) => bidang.id === bidangId);
    const idsBaru = punya
      ? item.bidang.map((bidang) => bidang.id).filter((id) => id !== bidangId)
      : [...item.bidang.map((bidang) => bidang.id), bidangId];
    const bidangBaru = bidangList.filter((bidang) => idsBaru.includes(bidang.id));
    const targetBaru = idsBaru.reduce((sum, id) => sum + (userCountByBidang[id] ?? 0), 0);
    setBidangBusy(kunci);
    setPageError(null);
    const prev = items;
    setItems((cur) =>
      cur.map((row) =>
        editorKey(row) === editorKey(item)
          ? { ...row, bidang: bidangBaru, targetUser: targetBaru }
          : row
      )
    );
    try {
      const supabase = createClient();
      const { error } = punya
        ? await supabase
            .from("laporan_tambahan_bidang")
            .delete()
            .eq("laporan_id", item.id)
            .eq("bidang_id", bidangId)
        : await supabase
            .from("laporan_tambahan_bidang")
            .insert({ laporan_id: item.id, bidang_id: bidangId });
      if (error) {
        if (handleSession(error)) return;
        setItems(prev);
        setPageError("Gagal menyimpan bidang. Coba lagi.");
        return;
      }
      toast.success("Bidang diperbarui.");
      router.refresh();
    } finally {
      setBidangBusy(null);
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <div id="daftar" className="scroll-mt-20">
            {pageError && (
              <p role="alert" className="mb-3 text-sm text-danger">
                {pageError}
              </p>
            )}
            <div className="mb-4">
              <InfoCard
                judulAwal={infoJudulAwal}
                jabatanAwal={jabatanAwal}
                unitAwal={unitKerjaAwal}
              />
            </div>
            <SectionEditor
              ordered={ordered}
              query={query}
              focusId={focusId}
              bidangList={bidangList}
              bidangBusy={bidangBusy}
              onToggleBidang={toggleBidang}
              onReorder={handleReorder}
              onMoveKey={handleMoveKey}
              onDuplicateRequest={duplicateSection}
              onDeleteRequest={(item) => {
                setPageError(null);
                setDeleteTarget(item);
              }}
              onSaved={() => router.refresh()}
              onTambah={() => tambahCepat("tabel")}
              aksiBusy={duplicating}
            />
          </div>
        </div>

        {/* Rel aksi ala Google Forms: tambah tabel/esai/judul. */}
        <div className="sticky top-20 shrink-0">
          <div
            role="toolbar"
            aria-label="Tambah section"
            className="ref-card flex flex-col gap-1 rounded-full p-1.5"
          >
            {(
              [
                { nilai: "tabel", label: "Tambah tabel", Icon: Table },
                { nilai: "esai", label: "Tambah esai", Icon: AlignLeft },
                { nilai: "judul", label: "Tambah judul", Icon: Type },
              ] as const
            ).map(({ nilai, label, Icon }) => (
              <Button
                key={nilai}
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => tambahCepat(nilai)}
                disabled={menambah}
                aria-label={label}
                title={label}
                className="rounded-full"
              >
                <Icon aria-hidden="true" />
              </Button>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget ? `Hapus section "${deleteTarget.judul}"?` : "Hapus section"
        }
        message={
          deleteTarget
            ? "Jika section ini dihapus, seluruh baris isiannya ikut terhapus."
            : ""
        }
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
