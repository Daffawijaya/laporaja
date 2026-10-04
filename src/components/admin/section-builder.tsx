"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlignLeft, Flag, Table, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RefListCard } from "@/components/ui/ref-list-card";
import { useToast } from "@/components/ui/toast";
import { setSimpanStatus } from "@/lib/simpan-status";
import { hapusPending, isPending, tambahPending } from "@/lib/section-pending";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import type { BuilderItem } from "@/lib/laporan-tambahan/queries";
import {
  TandaTanganEditor,
  type TtdItem,
} from "@/components/anda/tanda-tangan-editor";
import {
  InfoCard,
  SectionEditor,
  editorKey,
} from "@/components/admin/section-editor";

// Opsi tambah section (dipakai rel samping desktop + toolbar apung mobile).
// Indikator = salinan tabel (judul + kolom isian per baris), beda label.
const TAMBAH_OPSI = [
  { nilai: "tabel", label: "Tambah tabel", Icon: Table },
  { nilai: "esai", label: "Tambah esai", Icon: AlignLeft },
  { nilai: "judul", label: "Tambah judul", Icon: Type },
  { nilai: "indikator", label: "Tambah indikator", Icon: Flag },
] as const;

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
  ttdAwal,
  ttdPeranUserAwal = "",
}: {
  initialItems: BuilderItem[];
  bidangList: { id: string; nama: string }[];
  userCountByBidang: Record<string, number>;
  jabatanAwal: string;
  unitKerjaAwal: string;
  infoJudulAwal: string;
  ttdAwal: TtdItem[];
  ttdPeranUserAwal?: string;
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
  const [terpilih, setTerpilih] = useState<string | null>(null);
  const terpilihRef = useRef<string | null>(null);
  // Kunci kartu yang sedang ditempeli rel (terpilih, atau terakhir saat
  // pilihan dilepas): posisi sisip tambah selalu mengikutinya.
  const relKunciRef = useRef<string | null>(null);
  useEffect(() => {
    terpilihRef.current = terpilih;
  }, [terpilih]);
  const [terukur, setTerukur] = useState(false);
  const daftarRef = useRef<HTMLDivElement>(null);
  const barisRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Rel tambah menempel di tepi atas kartu terpilih. Posisi dihitung
  // relatif terhadap baris (koordinat dokumen), jadi saat scroll rel ikut
  // kartu secara natural tanpa perlu update. Pindah kartu: tween 450ms
  // ease-in-out (pelan-cepat-pelan).
  useLayoutEffect(() => {
    let raf = 0;
    let lastLeft: number | null = null;
    let lastWidth: number | null = null;
    let sudah = false;
    const DUR = 450;
    const easeInOutCubic = (p: number) =>
      p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    let pos: number | null = null;
    let animFrom = 0;
    let animTo = 0;
    let animStart = 0;
    let lastKey: string | null | undefined;
    // Posisi terakhir kartu yang dipilih (koordinat dokumen): dipakai agar
    // rel diam di tempat saat pilihan dilepas.
    let lastCardTarget: number | null = null;
    let lastKunci: string | null = null;
    const tick = (now: number) => {
      const ghost = ghostRef.current;
      const rail = railRef.current;
      const daftar = daftarRef.current;
      const baris = barisRef.current;
      if (ghost && rail && baris) {
        const rowRect = baris.getBoundingClientRect();
        const gr = ghost.getBoundingClientRect();
        const leftRel = gr.left - rowRect.left;
        if (lastLeft === null || Math.abs(lastLeft - leftRel) > 0.5) {
          lastLeft = leftRel;
          rail.style.left = `${leftRel}px`;
        }
        if (lastWidth === null || Math.abs(lastWidth - gr.width) > 0.5) {
          lastWidth = gr.width;
          rail.style.width = `${gr.width}px`;
        }
        const daftarTop = daftar ? daftar.getBoundingClientRect().top - rowRect.top : 0;
        let target: number | null = null;
        const kunci = terpilihRef.current;
        // Saat tak ada pilihan, ikuti posisi live kartu terakhir (masih di
        // DOM, hanya menciut) supaya rel tetap diam di tempatnya.
        const cari = kunci ?? lastKunci;
        relKunciRef.current = cari;
        if (cari && daftar) {
          const card = daftar.querySelector(`[data-section-key="${CSS.escape(cari)}"]`);
          if (card) {
            target = card.getBoundingClientRect().top - rowRect.top;
            lastCardTarget = target;
          }
        }
        if (kunci) lastKunci = kunci;
        if (target === null) target = lastCardTarget ?? daftarTop;
        if (pos === null) {
          pos = target;
          animFrom = target;
          animTo = target;
          animStart = now;
          rail.style.transform = `translateY(${target}px)`;
        } else {
          if (lastKey !== kunci || Math.abs(target - animTo) > 40) {
            animFrom = pos;
            animTo = target;
            animStart = now;
          } else {
            animTo = target;
          }
          const p = Math.min(1, (now - animStart) / DUR);
          pos = animFrom + (animTo - animFrom) * easeInOutCubic(p);
          rail.style.transform = `translateY(${pos}px)`;
        }
        lastKey = kunci;
        if (!sudah) {
          sudah = true;
          setTerukur(true);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  // Tambah instan ala Google Forms: kartu langsung tampil tepat di bawah
  // kartu yang ditempeli rel (terpilih, atau terakhir bila pilihan dilepas),
  // judulnya langsung terfokus — tanpa menunggu database. Tulis DB jalan di
  // belakang; navbar yang menunjukkan Menyimpan/Tersimpan. Id dibuat di
  // client supaya kartu tidak perlu remount saat data server tiba.
  async function tambahCepat(format: "tabel" | "esai" | "judul" | "indikator") {
    if (menambah) return;
    setMenambah(true);
    setPageError(null);
    setSimpanStatus("saving");
    const prev = items;
    // Posisi sisip selalu mengikuti rel: kartu terpilih, atau kartu terakhir
    // yang ditempeli rel bila pilihan sedang dilepas.
    const kunciAktif = terpilih ?? relKunciRef.current;
    const idxPilih = kunciAktif
      ? kunciAktif === "info"
        ? -2
        : ordered.findIndex((row) => editorKey(row) === kunciAktif)
      : -1;
    const idxSisip = idxPilih === -2 ? 0 : idxPilih >= 0 ? idxPilih + 1 : ordered.length;
    const idBaru = crypto.randomUUID();
    const kolomIdBaru = crypto.randomUUID();
    const itemBaru: BuilderItem = {
      id: idBaru,
      kind: "tambahan",
      judul: "Section tanpa judul",
      deskripsi: null,
      format,
      urutan: 0,
      bidang: [],
      jumlahKolom: format === "judul" ? 0 : 1,
      jumlahBaris: 0,
      targetUser: 0,
      terisiUser: 0,
      kolom:
        format === "judul"
          ? []
          : [
              {
                id: kolomIdBaru,
                label: format === "esai" ? "Isian" : "Kolom 1",
                tipe: format === "esai" ? "textarea" : format === "indikator" ? "number" : "text",
              },
            ],
    };
    const next = [...ordered];
    next.splice(idxSisip, 0, itemBaru);
    setItems(next.map((row, index) => ({ ...row, urutan: index * 10 })));
    const kunciBaru = editorKey(itemBaru);
    setTerpilih(kunciBaru);
    setFocusId(kunciBaru);
    tambahPending(idBaru);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("laporan_tambahan").insert({
        id: idBaru,
        judul: itemBaru.judul,
        deskripsi: null,
        format,
        urutan: idxSisip * 10,
        created_by: auth.user?.id ?? null,
      });
      if (error) {
        if (!handleSession(error)) gagalSimpan("Gagal menambah section. Coba lagi.");
        setItems((cur) => cur.filter((row) => row.id !== idBaru));
        hapusPending(idBaru);
        return;
      }
      if (format !== "judul") {
        const { error: kolomError } = await supabase
          .from("laporan_tambahan_kolom")
          .insert({
            id: kolomIdBaru,
            laporan_id: idBaru,
            label: itemBaru.kolom[0]?.label ?? "Kolom 1",
            tipe: itemBaru.kolom[0]?.tipe ?? "text",
            wajib: true,
            urutan: 0,
          });
        if (kolomError) {
          await supabase.from("laporan_tambahan").delete().eq("id", idBaru);
          if (!handleSession(kolomError)) gagalSimpan("Gagal menambah section. Coba lagi.");
          setItems((cur) => cur.filter((row) => row.id !== idBaru));
          hapusPending(idBaru);
          return;
        }
      }
      // Rapikan urutan (kelipatan 10) sesuai posisi sisip; hanya baris
      // yang berubah yang ditulis ulang. Kegagalan di sini non-fatal
      // (refresh berikut merapikannya dari server).
      const urutanLama = new Map(prev.map((row) => [row.id, row.urutan]));
      await Promise.all(
        next
          .map((row, index) => ({ id: row.id, urutan: index * 10 }))
          .filter(({ id, urutan }) => id !== idBaru && urutanLama.get(id) !== urutan)
          .map(({ id, urutan }) =>
            supabase.from("laporan_tambahan").update({ urutan }).eq("id", id)
          )
      );
      hapusPending(idBaru);
      setSimpanStatus("saved");
      router.refresh();
    } finally {
      setMenambah(false);
    }
  }

  // Gandakan section: judul + bentuk + kolom + bidang, jadi di paling
  // bawah dan langsung terfokus.
  async function duplicateSection(item: BuilderItem) {
    if (duplicating || isPending(item.id)) return;
    setDuplicating(true);
    setPageError(null);
    setSimpanStatus("saving");
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
        gagalSimpan("Gagal menyalin section. Coba lagi.");
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
        gagalSimpan("Gagal menyalin section. Coba lagi.");
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
          gagalSimpan("Gagal menyalin section. Coba lagi.");
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
          gagalSimpan("Gagal menyalin section. Coba lagi.");
          return;
        }
      }
      setFocusId(`tambahan-${data.id}`);
      setSimpanStatus("saved");
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

  // Galat simpan: pesan inline di daftar + status di navbar.
  function gagalSimpan(pesan: string) {
    setPageError(pesan);
    setSimpanStatus("error");
  }

  // Terapkan susunan baru: urutan = posisi x 10, simpan yang berubah.
  async function applyOrder(next: BuilderItem[]) {
    if (orderBusy) return;
    const prev = items;
    const denganUrutan = next.map((row, index) => ({ ...row, urutan: index * 10 }));
    setOrderBusy(true);
    setPageError(null);
    setSimpanStatus("saving");
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
        gagalSimpan("Gagal menyimpan urutan. Coba lagi.");
        return;
      }
      setSimpanStatus("saved");
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
    if (isPending(deleteTarget.id)) {
      // Kartu baru belum selesai tersimpan: tutup dialog, hapus beneran
      // segera setelah tulis rampung (navbar tetap menunjukkan Menyimpan).
      const target = deleteTarget;
      setDeleteTarget(null);
      const tunggu = window.setInterval(() => {
        if (isPending(target.id)) return;
        window.clearInterval(tunggu);
        setDeleteTarget(target);
        void eksekusiHapus(target);
      }, 250);
      return;
    }
    void eksekusiHapus(deleteTarget);
  }

  async function eksekusiHapus(target: BuilderItem) {
    if (deleting) return;
    setDeleting(true);
    setPageError(null);
    setSimpanStatus("saving");
    try {
      const supabase = createClient();
      const { error } = await supabase.from("laporan_tambahan").delete().eq("id", target.id);
      if (error) {
        if (handleSession(error)) return;
        gagalSimpan("Gagal menghapus section. Coba lagi.");
        return;
      }
      const targetId = target.id;
      // Pilih section sebelumnya (atau penggantinya) supaya rel bergeser ke sana.
      const idxHapus = ordered.findIndex((row) => row.id === targetId);
      const ganti =
        idxHapus > 0
          ? ordered[idxHapus - 1]
          : idxHapus >= 0 && idxHapus < ordered.length - 1
            ? ordered[idxHapus + 1]
            : null;
      setItems((prev) => prev.filter((item) => item.id !== targetId));
      setTerpilih(ganti ? editorKey(ganti) : null);
      setDeleteTarget(null);
      setSimpanStatus("saved");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  // Centang bidang langsung tersimpan: tambah/hapus tautan lalu hitung
  // ulang daftar bidang dan target user dari matriks.
  async function toggleBidang(item: BuilderItem, bidangId: string) {
    const kunci = `${editorKey(item)}-${bidangId}`;
    if (bidangBusy || isPending(item.id)) return;
    const punya = item.bidang.some((bidang) => bidang.id === bidangId);
    const idsBaru = punya
      ? item.bidang.map((bidang) => bidang.id).filter((id) => id !== bidangId)
      : [...item.bidang.map((bidang) => bidang.id), bidangId];
    const bidangBaru = bidangList.filter((bidang) => idsBaru.includes(bidang.id));
    const targetBaru = idsBaru.reduce((sum, id) => sum + (userCountByBidang[id] ?? 0), 0);
    setBidangBusy(kunci);
    setPageError(null);
    setSimpanStatus("saving");
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
        gagalSimpan("Gagal menyimpan bidang. Coba lagi.");
        return;
      }
      setSimpanStatus("saved");
      router.refresh();
    } finally {
      setBidangBusy(null);
    }
  }

  return (
    <div className="w-full">
      <div ref={barisRef} className="relative flex items-start gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <div id="daftar" className="scroll-mt-20" ref={daftarRef}>
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
              onPilih={() => setTerpilih("info")}
            />
            </div>
            <SectionEditor
              ordered={ordered}
              query={query}
              focusId={focusId}
              bidangList={bidangList}
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
              terpilih={terpilih}
              setTerpilih={setTerpilih}
            />
            {/* Kartu tanda tangan statis paling bawah (bukan section,
                tidak ikut urutan/drag/hapus). */}
            <div className="mt-4">
              <RefListCard ariaLabel="Tanda tangan" title="Tanda tangan">
                <TandaTanganEditor daftarAwal={ttdAwal} peranUserAwal={ttdPeranUserAwal} />
              </RefListCard>
            </div>
          </div>
        </div>

        {/* Penanda tempat rel aksi: mempertahankan lebar kolom kanan.
            Hanya desktop — di mobile disembunyikan agar kartu full selebar
            layar (rel diganti toolbar apung di bawah). */}
        <div className="hidden shrink-0 md:block" aria-hidden="true">
          <div
            ref={ghostRef}
            className="ref-card flex flex-col gap-1 rounded-full p-1.5 opacity-0"
          >
            <div className="size-11" />
            <div className="size-11" />
            <div className="size-11" />
          </div>
        </div>

        {/* Rel aksi ala Google Forms: tambah tabel/esai/judul. Absolute
            terhadap baris, menempel di tepi atas kartu terpilih.
            Hanya desktop — di mobile diganti toolbar apung di bawah. */}
        <div
          ref={railRef}
          data-rel-tambah
          className={`absolute top-0 z-10 hidden shrink-0 md:block ${
            terukur ? "opacity-100" : "opacity-0"
          }`}
          style={{ transform: "translateY(0px)" }}
        >
          <div
            role="toolbar"
            aria-label="Tambah section"
            className="ref-card flex flex-col gap-1 rounded-full p-1.5"
          >
            {TAMBAH_OPSI.map(({ nilai, label, Icon }) => (
              <Button
                key={nilai}
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => tambahCepat(nilai)}
                aria-label={label}
                title={label}
                className="rounded-full"
              >
                <Icon aria-hidden="true" />
              </Button>
            ))}
          </div>
        </div>

        {/* Toolbar tambah mobile: pill mengambang kanan-bawah di atas
            bottom-nav (rel samping disembunyikan di layar kecil). */}
        <div className="fixed right-4 bottom-24 z-30 md:hidden" data-rel-tambah>
          <div
            role="toolbar"
            aria-label="Tambah section"
            className="ref-card flex flex-row gap-1 rounded-full p-1.5"
          >
            {TAMBAH_OPSI.map(({ nilai, label, Icon }) => (
              <Button
                key={nilai}
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => tambahCepat(nilai)}
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
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
