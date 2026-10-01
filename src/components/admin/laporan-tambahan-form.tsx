"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassSelect } from "@/components/ui/glass-select";
import { RefListCard } from "@/components/ui/ref-list-card";
import { ContentGrid } from "@/components/layout/content-grid";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import type { SectionKode } from "@/lib/supabase/database.types";
import type { KolomTipe, LaporanEditData } from "@/lib/laporan-tambahan/queries";

const TIPE_OPTIONS: { value: KolomTipe; label: string }[] = [
  { value: "text", label: "Teks pendek" },
  { value: "textarea", label: "Teks panjang" },
  { value: "date", label: "Tanggal" },
  { value: "number", label: "Angka" },
];

interface KolomDraft {
  key: number;
  /** Id baris DB; null = baris baru yang belum tersimpan. */
  id: string | null;
  label: string;
  tipe: KolomTipe;
}

let kolomSeq = 0;
function kolomBaru(label = "", id: string | null = null): KolomDraft {
  kolomSeq += 1;
  return { key: kolomSeq, id, label, tipe: "text" };
}

export interface LaporanFormAwal {
  id: string;
  judul: string;
  kolom: { id: string; label: string; tipe: KolomTipe }[];
  linkedIds: string[];
}

// Form buat/ubah section dinamis ala Google Forms: kartu judul + kartu
// kolom (satu per kolom) + rel tombol tambah. Mode ubah bila `initial`
// diisi (terisi dari DB, Simpan = update). Styling (rounded, warna,
// aksen) tetap ikut aplikasi.
export function LaporanTambahanForm({
  bidangList,
  initial,
  onCancel,
  onSaved,
}: {
  bidangList: { id: string; nama: string }[];
  initial?: LaporanFormAwal;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [judul, setJudul] = useState(initial?.judul ?? "");
  const [kolom, setKolom] = useState<KolomDraft[]>(() =>
    initial && initial.kolom.length > 0
      ? initial.kolom.map((col) => ({ ...kolomBaru(col.label, col.id), tipe: col.tipe }))
      : [kolomBaru()]
  );
  const [bidangIds, setBidangIds] = useState<string[]>(initial?.linkedIds ?? []);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setKolomDraft(key: number, patch: Partial<KolomDraft>) {
    setKolom((prev) => prev.map((col) => (col.key === key ? { ...col, ...patch } : col)));
    setFormError(null);
  }

  function tambahKolom() {
    setKolom((prev) => [...prev, kolomBaru()]);
    setFormError(null);
  }

  function duplikatKolom(key: number) {
    setKolom((prev) => {
      const index = prev.findIndex((col) => col.key === key);
      if (index < 0) return prev;
      const asal = prev[index];
      return [...prev.slice(0, index + 1), kolomBaru(asal.label), ...prev.slice(index + 1)];
    });
    setFormError(null);
  }

  function hapusKolom(key: number) {
    setKolom((prev) => prev.filter((col) => col.key !== key));
    setFormError(null);
  }

  function toggleBidang(id: string) {
    setBidangIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setFormError(null);
  }

  function gagalSimpan(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  // Simpan mode ubah: update judul + selisih kolom (ubah/tambah/hapus) +
  // selisih tautan bidang. Hapus kolom ikut menghapus nilai isiannya
  // (cascade DB). Kembali true bila tersimpan (atau tak ada perubahan).
  async function simpanUbah(
    cleanedJudul: string,
    cleanedKolom: { id: string | null; label: string; tipe: KolomTipe; urutan: number }[]
  ): Promise<boolean> {
    if (!initial) return false;
    const awalKolom = initial.kolom;
    const samaBidang =
      bidangIds.length === initial.linkedIds.length &&
      bidangIds.every((id) => initial.linkedIds.includes(id));
    const samaKolom =
      cleanedKolom.length === awalKolom.length &&
      cleanedKolom.every((col, index) => {
        const asal = awalKolom[index];
        return col.id === asal.id && col.label === asal.label && col.tipe === asal.tipe;
      });
    if (cleanedJudul === initial.judul && samaBidang && samaKolom) return true;
    const supabase = createClient();
    const laporanId = initial.id;
    if (cleanedJudul !== initial.judul) {
      const { error } = await supabase
        .from("laporan_tambahan")
        .update({ judul: cleanedJudul })
        .eq("id", laporanId);
      if (error) {
        if (!gagalSimpan(error)) setFormError("Gagal menyimpan. Coba lagi.");
        return false;
      }
    }
    const keptIds = new Set(
      cleanedKolom.filter((col) => col.id !== null).map((col) => col.id as string)
    );
    const hapusKolomIds = awalKolom.map((col) => col.id).filter((id) => !keptIds.has(id));
    if (hapusKolomIds.length > 0) {
      const { error } = await supabase
        .from("laporan_tambahan_kolom")
        .delete()
        .in("id", hapusKolomIds);
      if (error) {
        if (!gagalSimpan(error)) setFormError("Gagal menyimpan. Coba lagi.");
        return false;
      }
    }
    const kept = cleanedKolom.filter((col) => col.id !== null);
    if (kept.length > 0) {
      const { error } = await supabase.from("laporan_tambahan_kolom").upsert(
        kept.map((col) => ({
          id: col.id as string,
          laporan_id: laporanId,
          label: col.label,
          tipe: col.tipe,
          wajib: true,
          urutan: col.urutan,
        })),
        { onConflict: "id" }
      );
      if (error) {
        if (!gagalSimpan(error)) setFormError("Gagal menyimpan. Coba lagi.");
        return false;
      }
    }
    const baru = cleanedKolom.filter((col) => col.id === null);
    if (baru.length > 0) {
      const { error } = await supabase.from("laporan_tambahan_kolom").insert(
        baru.map((col) => ({
          laporan_id: laporanId,
          label: col.label,
          tipe: col.tipe,
          wajib: true,
          urutan: col.urutan,
        }))
      );
      if (error) {
        if (!gagalSimpan(error)) setFormError("Gagal menyimpan. Coba lagi.");
        return false;
      }
    }
    const tambahBidang = bidangIds.filter((id) => !initial.linkedIds.includes(id));
    const hapusBidang = initial.linkedIds.filter((id) => !bidangIds.includes(id));
    if (hapusBidang.length > 0) {
      const { error } = await supabase
        .from("laporan_tambahan_bidang")
        .delete()
        .eq("laporan_id", laporanId)
        .in("bidang_id", hapusBidang);
      if (error) {
        if (!gagalSimpan(error)) setFormError("Gagal menyimpan. Coba lagi.");
        return false;
      }
    }
    if (tambahBidang.length > 0) {
      const { error } = await supabase
        .from("laporan_tambahan_bidang")
        .insert(tambahBidang.map((bidang_id) => ({ laporan_id: laporanId, bidang_id })));
      if (error) {
        if (!gagalSimpan(error)) setFormError("Gagal menyimpan. Coba lagi.");
        return false;
      }
    }
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const cleanedJudul = judul.trim();
    if (cleanedJudul.length < 2 || cleanedJudul.length > 120) {
      setFormError("Judul laporan harus 2-120 karakter.");
      return;
    }
    const cleanedKolom = kolom.map((col, index) => ({ ...col, label: col.label.trim(), urutan: index }));
    if (cleanedKolom.length === 0) {
      setFormError("Tambahkan minimal satu kolom isian.");
      return;
    }
    for (const col of cleanedKolom) {
      if (col.label.length < 2 || col.label.length > 120) {
        setFormError("Judul kolom harus 2-120 karakter.");
        return;
      }
    }
    setSaving(true);
    setFormError(null);
    try {
      if (initial) {
        if (await simpanUbah(cleanedJudul, cleanedKolom)) {
          toast.success("Section diperbarui.");
          onSaved();
        }
        return;
      }
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("laporan_tambahan")
        .insert({
          judul: cleanedJudul,
          deskripsi: null,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error || !data) {
        if (error instanceof SessionExpiredError || isSessionError(error)) {
          toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
          router.replace("/login?expired=1");
          return;
        }
        setFormError("Gagal menambah laporan. Coba lagi.");
        return;
      }
      const [kolomResult, linkResult] = await Promise.all([
        supabase.from("laporan_tambahan_kolom").insert(
          cleanedKolom.map((col) => ({
            laporan_id: data.id,
            label: col.label,
            tipe: col.tipe,
            wajib: true,
            urutan: col.urutan,
          }))
        ),
        // Bidang boleh kosong: laporan tersimpan tanpa penugasan.
        bidangIds.length > 0
          ? supabase.from("laporan_tambahan_bidang").insert(
              bidangIds.map((bidang_id) => ({ laporan_id: data.id, bidang_id }))
            )
          : Promise.resolve({ error: null }),
      ]);
      if (kolomResult.error || linkResult.error) {
        await supabase.from("laporan_tambahan").delete().eq("id", data.id);
        setFormError("Gagal menyimpan kolom atau bidang. Coba lagi.");
        return;
      }
      toast.success("Section dibuat.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const bidangCard = (
    <RefListCard ariaLabel="Bidang yang wajib mengisi">
      {bidangList.length === 0 ? (
        <p className="px-1 text-sm text-neutral-500">
          Belum ada bidang. Tambahkan dulu di menu Bidang.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
          {bidangList.map((bidang, index) => (
            <li
              key={bidang.id}
              className={
                bidangList.length === 1
                  ? "px-1"
                  : index === 0
                    ? "px-1 pb-3"
                    : index === bidangList.length - 1
                      ? "px-1 pt-3"
                      : "px-1 py-3"
              }
            >
              <label className="flex min-h-[28px] cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={bidangIds.includes(bidang.id)}
                  onChange={() => toggleBidang(bidang.id)}
                  disabled={saving}
                  className="size-4 shrink-0 accent-[#0071e3]"
                />
                <span className="min-w-0 truncate text-sm">{bidang.nama}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </RefListCard>
  );

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <ContentGrid gapClassName="lg:gap-3" aside={bidangCard}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Kartu judul. Padding + ukuran teks samakan kartu referensi (RefListCard p-4). */}
          <div className="ref-card p-4">
            <Label htmlFor="tambahan-judul" className="sr-only">
              Judul laporan
            </Label>
            <Input
              id="tambahan-judul"
              value={judul}
              onChange={(event) => {
                setJudul(event.target.value);
                setFormError(null);
              }}
              placeholder="Judul laporan"
              disabled={saving}
              autoFocus
              className="h-auto rounded-none border-0 border-b border-neutral-300 bg-transparent px-1 py-1 text-[17px] font-semibold tracking-tight placeholder:text-neutral-400 hover:border-neutral-400 focus-visible:border-accent focus-visible:ring-0 dark:border-white/15"
            />
          </div>

          {/* Satu kartu berisi daftar baris kolom. Ritme padding samakan RefListCard referensi. */}
          <div className="ref-card mt-2 p-4">
            <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
              {kolom.map((col, index) => (
                <li
                  key={col.key}
                  className={
                    kolom.length === 1
                      ? "px-1"
                      : index === 0
                        ? "px-1 pb-3"
                        : index === kolom.length - 1
                          ? "px-1 pt-3"
                          : "px-1 py-3"
                  }
                >
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`kolom-label-${col.key}`} className="sr-only">
                      {`Kolom ${index + 1}`}
                    </Label>
                    <Input
                      id={`kolom-label-${col.key}`}
                      value={col.label}
                      onChange={(event) => setKolomDraft(col.key, { label: event.target.value })}
                      placeholder="Judul kolom"
                      disabled={saving}
                      className="h-11 min-w-0 flex-1 border-transparent bg-black/[0.075] text-sm hover:bg-black/[0.12] dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
                    />
                    <GlassSelect
                      ariaLabel={`Bentuk isian kolom ${index + 1}`}
                      value={col.tipe}
                      onChange={(value) => setKolomDraft(col.key, { tipe: value as KolomTipe })}
                      options={TIPE_OPTIONS}
                      disabled={saving}
                      className="w-32 shrink-0 sm:w-36"
                    />
                    <span className="flex shrink-0 items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => duplikatKolom(col.key)}
                        disabled={saving}
                        aria-label={`Gandakan kolom ${index + 1}`}
                      >
                        <Copy aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => hapusKolom(col.key)}
                        disabled={saving || kolom.length <= 1}
                        aria-label={`Hapus kolom ${index + 1}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-2 md:hidden">
            <Button
              type="button"
              variant="secondary"
              onClick={tambahKolom}
              disabled={saving}
              className="w-full rounded-full"
            >
              <Plus aria-hidden="true" />
              Tambah Kolom
            </Button>
          </div>

          {formError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {formError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={saving}
              className="rounded-full"
            >
              Batal
            </Button>
            <Button type="submit" disabled={saving} className="rounded-full">
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </div>

        {/* Rel tombol tambah (desktop): salin persis ikon lingkaran navbar (lonceng/bulan). */}
        <div className="sticky top-20 hidden shrink-0 md:block">
          <div className="ref-icon-btn-liquid">
            <button
              type="button"
              onClick={tambahKolom}
              disabled={saving}
              aria-label="Tambah kolom"
              className="ref-icon-btn-plain disabled:opacity-50"
            >
              <Plus aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>
      </div>
      </ContentGrid>
    </form>
  );
}

// Pembungkus halaman ubah: selesai/batal kembali ke daftar.
export function LaporanSectionEdit({
  data,
}: {
  data: { kode: string; judul: string; bidangList: { id: string; nama: string }[]; linkedIds: string[] };
}) {
  const router = useRouter();
  function kembali() {
    router.push("/admin/laporan-tambahan");
    router.refresh();
  }
  return (
    <LaporanSectionForm
      kode={data.kode}
      judulAwal={data.judul}
      bidangList={data.bidangList}
      linkedIds={data.linkedIds}
      onCancel={kembali}
      onSaved={kembali}
    />
  );
}

// Pembungkus halaman ubah laporan dinamis: selesai/batal ke daftar.
export function LaporanTambahanEdit({ data }: { data: LaporanEditData }) {
  const router = useRouter();
  function kembali() {
    router.push("/admin/laporan-tambahan");
    router.refresh();
  }
  return (
    <LaporanTambahanForm
      bidangList={data.bidangList}
      initial={{ id: data.id, judul: data.judul, kolom: data.kolom, linkedIds: data.linkedIds }}
      onCancel={kembali}
      onSaved={kembali}
    />
  );
}

// Isian tetap tiap section (cermin formulir yang diisi user).
const ISIAN_SECTION: Record<string, { label: string; tipe: KolomTipe }[]> = {
  kegiatan: [
    { label: "Nama kegiatan", tipe: "text" },
    { label: "Tanggal", tipe: "date" },
    { label: "Keterangan", tipe: "textarea" },
  ],
  rekomendasi: [{ label: "Rekomendasi dan tindak lanjut", tipe: "textarea" }],
};

function IsianSectionCard({ kode }: { kode: string }) {
  const baris = ISIAN_SECTION[kode];
  if (!baris) return null;
  return (
    <div className="ref-card mt-2 p-4">
      <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
        {baris.map((row, index) => (
          <li
            key={row.label}
            className={
              baris.length === 1
                ? "px-1"
                : index === 0
                  ? "px-1 pb-3"
                  : index === baris.length - 1
                    ? "px-1 pt-3"
                    : "px-1 py-3"
            }
          >
            <div className="flex items-center gap-2">
              <Input
                value={row.label}
                disabled
                aria-label={`Isian ${row.label}`}
                className="h-11 min-w-0 flex-1 border-transparent bg-black/[0.075] text-sm"
              />
              <GlassSelect
                ariaLabel={`Tipe isian ${row.label}`}
                value={row.tipe}
                onChange={() => {}}
                options={TIPE_OPTIONS}
                disabled
                className="w-32 shrink-0 sm:w-36"
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 px-1 text-xs text-neutral-500">
        Isian bawaan section ini mengikuti formulir laporan dan tidak bisa diubah.
      </p>
    </div>
  );
}

// Form ubah section tetap ala halaman buat: kartu judul + daftar bidang
// di kanan. Styling disamakan dengan form buat.
export function LaporanSectionForm({
  kode,
  judulAwal,
  bidangList,
  linkedIds,
  onCancel,
  onSaved,
}: {
  kode: string;
  judulAwal: string;
  bidangList: { id: string; nama: string }[];
  linkedIds: string[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [judul, setJudul] = useState(judulAwal);
  const [bidangIds, setBidangIds] = useState<string[]>(linkedIds);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleBidang(id: string) {
    setBidangIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setFormError(null);
  }

  function gagal(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const cleanedJudul = judul.trim();
    if (cleanedJudul.length < 2 || cleanedJudul.length > 120) {
      setFormError("Judul section harus 2-120 karakter.");
      return;
    }
    const tambah = bidangIds.filter((id) => !linkedIds.includes(id));
    const hapus = linkedIds.filter((id) => !bidangIds.includes(id));
    if (cleanedJudul === judulAwal && tambah.length === 0 && hapus.length === 0) {
      onSaved();
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      if (cleanedJudul !== judulAwal) {
        const { error } = await supabase
          .from("laporan_section")
          .update({ judul: cleanedJudul })
          .eq("kode", kode as SectionKode);
        if (error) {
          if (!gagal(error)) setFormError("Gagal menyimpan. Coba lagi.");
          return;
        }
      }
      if (hapus.length > 0) {
        const { error } = await supabase
          .from("laporan_section_bidang")
          .delete()
          .eq("kode", kode as SectionKode)
          .in("bidang_id", hapus);
        if (error) {
          if (!gagal(error)) setFormError("Gagal menyimpan. Coba lagi.");
          return;
        }
      }
      if (tambah.length > 0) {
        const { error } = await supabase
          .from("laporan_section_bidang")
          .insert(tambah.map((bidang_id) => ({ kode: kode as SectionKode, bidang_id })));
        if (error) {
          if (!gagal(error)) setFormError("Gagal menyimpan. Coba lagi.");
          return;
        }
      }
      toast.success("Section diperbarui.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const bidangCard = (
    <RefListCard ariaLabel="Bidang yang wajib mengisi">
      {bidangList.length === 0 ? (
        <p className="px-1 text-sm text-neutral-500">
          Belum ada bidang. Tambahkan dulu di menu Bidang.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
          {bidangList.map((bidang, index) => (
            <li
              key={bidang.id}
              className={
                bidangList.length === 1
                  ? "px-1"
                  : index === 0
                    ? "px-1 pb-3"
                    : index === bidangList.length - 1
                      ? "px-1 pt-3"
                      : "px-1 py-3"
              }
            >
              <label className="flex min-h-[28px] cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={bidangIds.includes(bidang.id)}
                  onChange={() => toggleBidang(bidang.id)}
                  disabled={saving}
                  className="size-4 shrink-0 accent-[#0071e3]"
                />
                <span className="min-w-0 truncate text-sm">{bidang.nama}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </RefListCard>
  );

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <ContentGrid gapClassName="lg:gap-3" aside={bidangCard}>
        <div className="min-w-0">
          {/* Kartu judul. */}
          <div className="ref-card p-4">
            <Label htmlFor="section-judul" className="sr-only">
              Judul section
            </Label>
            <Input
              id="section-judul"
              value={judul}
              onChange={(event) => {
                setJudul(event.target.value);
                setFormError(null);
              }}
              placeholder="Judul section"
              disabled={saving}
              autoFocus
              className="h-auto rounded-none border-0 border-b border-neutral-300 bg-transparent px-1 py-1 text-[17px] font-semibold tracking-tight placeholder:text-neutral-400 hover:border-neutral-400 focus-visible:border-accent focus-visible:ring-0 dark:border-white/15"
            />
          </div>

          <IsianSectionCard kode={kode} />

          {formError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {formError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={saving}
              className="rounded-full"
            >
              Batal
            </Button>
            <Button type="submit" disabled={saving} className="rounded-full">
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </div>
      </ContentGrid>
    </form>
  );
}
