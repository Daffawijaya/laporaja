"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import {
  MAX_IMAGE_BYTES,
  removeGambarRefs,
  resolveGambarUrl,
  uploadKegiatanImage,
} from "@/lib/supabase/storage";

// Foto profil: lihat + tambah/ganti + hapus. Berkas WebP via
// /api/upload-gambar ke Drive (root/Avatar/Nama User), rujukannya di
// profiles.foto.
export function FotoEditor({
  userId,
  fotoAwal,
  nama,
}: {
  userId: string;
  fotoAwal: string | null;
  nama: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [foto, setFoto] = useState(fotoAwal);
  const [prevFoto, setPrevFoto] = useState(fotoAwal);
  if (prevFoto !== fotoAwal) {
    setPrevFoto(fotoAwal);
    setFoto(fotoAwal);
  }
  const [url, setUrl] = useState<string | null>(null);
  const [prevUrlFoto, setPrevUrlFoto] = useState(foto);
  if (prevUrlFoto !== foto) {
    setPrevUrlFoto(foto);
    setUrl(null);
  }
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let hidup = true;
    if (!foto) return;
    const supabase = createClient();
    void resolveGambarUrl(supabase, foto).then((resolved) => {
      if (hidup) setUrl(resolved);
    });
    return () => {
      hidup = false;
    };
  }, [foto]);

  function sesiBerakhir(error: unknown): boolean {
    if (error instanceof SessionExpiredError || isSessionError(error)) {
      toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
      router.replace("/login?expired=1");
      return true;
    }
    return false;
  }

  async function gantiFoto(file: File | undefined) {
    if (!file || sibuk) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      setGalat("Format file harus JPG, JPEG, PNG, atau WEBP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setGalat(`Ukuran gambar maksimal ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      const pathBaru = await uploadKegiatanImage({ jenis: "avatar" }, file);
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ foto: pathBaru })
        .eq("id", userId);
      if (error) {
        if (sesiBerakhir(error)) return;
        await removeGambarRefs([pathBaru]);
        setGalat("Gagal menyimpan foto. Coba lagi.");
        return;
      }
      // Best effort: berkas lama dibuang sesudah ganti.
      if (foto && foto !== pathBaru) {
        await removeGambarRefs([foto]);
      }
      setFoto(pathBaru);
      toast.success("Foto profil diperbarui.");
      router.refresh();
    } catch (err) {
      if (sesiBerakhir(err)) return;
      setGalat(err instanceof Error ? err.message : "Gagal mengunggah foto. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  async function hapusFoto() {
    if (!foto || sibuk) return;
    setSibuk(true);
    setGalat(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ foto: null })
        .eq("id", userId);
      if (error) {
        if (sesiBerakhir(error)) return;
        setGalat("Gagal menghapus foto. Coba lagi.");
        return;
      }
      await removeGambarRefs([foto]);
      setFoto(null);
      setKonfirmasiHapus(false);
      toast.success("Foto profil dihapus.");
      router.refresh();
    } finally {
      setSibuk(false);
    }
  }

  const inisial = (nama.charAt(0) || "?").toUpperCase();

  return (
    <div>
      <div className="flex items-center gap-4 px-1 pb-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Foto profil ${nama}`}
            className="size-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-semibold text-white"
          >
            {sibuk ? <Loader2 aria-hidden="true" className="size-6 animate-spin" /> : inisial}
          </span>
        )}
        <span className="flex min-w-0 flex-col gap-2">
          <span className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={sibuk}
              onClick={() => fileRef.current?.click()}
              className="min-h-10 px-4 text-xs"
            >
              {sibuk ? "Mengunggah…" : foto ? "Ganti foto" : "Tambah foto"}
            </Button>
            {foto ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={sibuk}
                onClick={() => setKonfirmasiHapus(true)}
                aria-label="Hapus foto profil"
                className="min-h-10 w-10"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </span>
          <span className="text-[11px] text-neutral-500">
            <ImagePlus aria-hidden="true" className="mr-1 inline size-3.5" />
            PNG/JPG/WEBP · maks {MAX_IMAGE_BYTES / 1024 / 1024} MB
          </span>
        </span>
      </div>
      <Input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={sibuk}
        onChange={(event) => {
          void gantiFoto(event.target.files?.[0]);
          event.target.value = "";
        }}
        className="hidden"
        aria-label="Berkas foto profil"
      />
      {galat && (
        <p role="alert" className="px-1 text-sm text-danger">
          {galat}
        </p>
      )}
      <ConfirmDialog
        open={konfirmasiHapus}
        title="Hapus foto profil?"
        message="Foto kembali ke inisial nama."
        busy={sibuk}
        onCancel={() => setKonfirmasiHapus(false)}
        onConfirm={() => void hapusFoto()}
      />
    </div>
  );
}

// Reset kata sandi milik sendiri: sandi baru + konfirmasi, langsung
// tersimpan ke akun yang sedang masuk.
export function PasswordEditor() {
  const router = useRouter();
  const toast = useToast();
  const [baru, setBaru] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  const [saving, setSaving] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [berhasil, setBerhasil] = useState(false);

  async function simpan() {
    if (saving) return;
    const sandi = baru.trim();
    if (sandi.length < 6) {
      setGalat("Kata sandi minimal 6 karakter.");
      return;
    }
    if (sandi !== konfirmasi.trim()) {
      setGalat("Konfirmasi tidak sama dengan kata sandi baru.");
      return;
    }
    setSaving(true);
    setGalat(null);
    setBerhasil(false);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: sandi });
      if (error) {
        if (error instanceof SessionExpiredError || isSessionError(error)) {
          toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
          router.replace("/login?expired=1");
          return;
        }
        setGalat("Gagal memperbarui kata sandi. Coba lagi.");
        return;
      }
      setBaru("");
      setKonfirmasi("");
      setBerhasil(true);
      toast.success("Kata sandi diperbarui.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sandi-baru">Kata sandi baru</Label>
        <Input
          id="sandi-baru"
          type="password"
          autoComplete="new-password"
          value={baru}
          onChange={(event) => {
            setBaru(event.target.value);
            setGalat(null);
            setBerhasil(false);
          }}
          placeholder="Minimal 6 karakter"
          disabled={saving}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sandi-konfirmasi">Konfirmasi kata sandi</Label>
        <Input
          id="sandi-konfirmasi"
          type="password"
          autoComplete="new-password"
          value={konfirmasi}
          onChange={(event) => {
            setKonfirmasi(event.target.value);
            setGalat(null);
            setBerhasil(false);
          }}
          placeholder="Ulangi kata sandi baru"
          disabled={saving}
          onKeyDown={(event) => {
            if (event.key === "Enter") void simpan();
          }}
        />
      </div>
      {galat && (
        <p role="alert" className="text-sm text-danger">
          {galat}
        </p>
      )}
      {berhasil && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          Kata sandi diperbarui.
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => void simpan()} disabled={saving} className="rounded-full">
          {saving ? "Menyimpan…" : "Perbarui kata sandi"}
        </Button>
      </div>
    </div>
  );
}
