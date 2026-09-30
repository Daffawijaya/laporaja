"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassSelect } from "@/components/ui/glass-select";
import { RefListCard } from "@/components/ui/ref-list-card";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import type { KolomTipe } from "@/lib/laporan-tambahan/queries";

const TIPE_OPTIONS: { value: KolomTipe; label: string }[] = [
  { value: "text", label: "Teks pendek" },
  { value: "textarea", label: "Teks panjang" },
  { value: "date", label: "Tanggal" },
  { value: "number", label: "Angka" },
];

interface KolomDraft {
  key: number;
  label: string;
  tipe: KolomTipe;
  wajib: boolean;
}

let kolomSeq = 0;
function kolomBaru(): KolomDraft {
  kolomSeq += 1;
  return { key: kolomSeq, label: "", tipe: "text", wajib: true };
}

// Form buat laporan tambahan: judul + kolom isian yang ditentukan admin
// (label + bentuk isian + wajib) + bidang yang wajib mengisi.
export function LaporanTambahanForm({
  bidangList,
  onCancel,
  onSaved,
}: {
  bidangList: { id: string; nama: string }[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [judul, setJudul] = useState("");
  const [kolom, setKolom] = useState<KolomDraft[]>([kolomBaru()]);
  const [bidangIds, setBidangIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setKolomDraft(key: number, patch: Partial<KolomDraft>) {
    setKolom((prev) => prev.map((col) => (col.key === key ? { ...col, ...patch } : col)));
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
        setFormError("Label kolom harus 2-120 karakter.");
        return;
      }
    }
    if (bidangIds.length === 0) {
      setFormError("Pilih minimal satu bidang.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("laporan_tambahan")
        .insert({ judul: cleanedJudul, created_by: auth.user?.id ?? null })
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
            wajib: col.wajib,
            urutan: col.urutan,
          }))
        ),
        supabase.from("laporan_tambahan_bidang").insert(
          bidangIds.map((bidang_id) => ({ laporan_id: data.id, bidang_id }))
        ),
      ]);
      if (kolomResult.error || linkResult.error) {
        await supabase.from("laporan_tambahan").delete().eq("id", data.id);
        setFormError("Gagal menyimpan kolom atau bidang. Coba lagi.");
        return;
      }
      toast.success("Laporan tambahan dibuat.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <RefListCard ariaLabel="Form laporan tambahan">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tambahan-judul">Judul laporan</Label>
          <Input
            id="tambahan-judul"
            value={judul}
            onChange={(event) => {
              setJudul(event.target.value);
              setFormError(null);
            }}
            placeholder="Contoh: Pendampingan UMKM"
            disabled={saving}
            autoFocus
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Kolom isian</legend>
          <ul className="flex flex-col gap-3">
            {kolom.map((col, index) => (
              <li key={col.key} className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-neutral-500">Kolom {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => hapusKolom(col.key)}
                    disabled={saving || kolom.length <= 1}
                    aria-label={`Hapus kolom ${index + 1}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`kolom-label-${col.key}`}>Label</Label>
                  <Input
                    id={`kolom-label-${col.key}`}
                    value={col.label}
                    onChange={(event) => setKolomDraft(col.key, { label: event.target.value })}
                    placeholder="Contoh: Nama Pelaku UMKM / Nama Usaha"
                    disabled={saving}
                  />
                </div>
                <div className="grid grid-cols-2 items-end gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Bentuk isian</span>
                    <GlassSelect
                      ariaLabel={`Bentuk isian kolom ${index + 1}`}
                      value={col.tipe}
                      onChange={(value) => setKolomDraft(col.key, { tipe: value as KolomTipe })}
                      options={TIPE_OPTIONS}
                      disabled={saving}
                    />
                  </div>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={col.wajib}
                      onChange={(event) => setKolomDraft(col.key, { wajib: event.target.checked })}
                      disabled={saving}
                      className="size-4 accent-[#0071e3]"
                    />
                    Wajib diisi
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setKolom((prev) => [...prev, kolomBaru()]);
                setFormError(null);
              }}
              disabled={saving}
              className="rounded-full"
            >
              <Plus aria-hidden="true" />
              Tambah Kolom
            </Button>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Bidang yang wajib mengisi</legend>
          {bidangList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada bidang. Tambahkan dulu di menu Bidang.
            </p>
          ) : (
            <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto">
              {bidangList.map((bidang) => (
                <li key={bidang.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={bidangIds.includes(bidang.id)}
                      onChange={() => toggleBidang(bidang.id)}
                      disabled={saving}
                      className="size-4 accent-[#0071e3]"
                    />
                    <span className="text-sm">{bidang.nama}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Batal
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </RefListCard>
  );
}
