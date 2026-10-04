"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { GlassMenu } from "@/components/ui/glass-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth/username";
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
    <div className="flex flex-col items-center">
      {/* Trigger dropdown = avatar utuh ala kawaku: hover → overlay gelap +
          ikon kamera outline di tengah. Dropdown tetap komponen GlassMenu. */}
      <GlassMenu
        label="Opsi foto profil"
        items={[
          {
            key: "ganti",
            label: foto ? "Ganti foto" : "Tambah foto",
            icon: <ImagePlus aria-hidden="true" />,
            onSelect: () => fileRef.current?.click(),
          },
          ...(foto
            ? [
                {
                  key: "hapus",
                  label: "Hapus foto",
                  icon: <Trash2 aria-hidden="true" />,
                  danger: true,
                  onSelect: () => setKonfirmasiHapus(true),
                },
              ]
            : []),
        ]}
        trigger={({ ref, onClick, onKeyDown, open }) => (
          <button
            ref={ref}
            type="button"
            disabled={sibuk}
            onClick={onClick}
            onKeyDown={onKeyDown}
            aria-label={foto ? "Foto profil: buka opsi" : "Belum ada foto profil: buka opsi"}
            aria-expanded={open}
            title="Foto profil"
            className="group relative block size-20 shrink-0 cursor-pointer overflow-hidden rounded-full transition-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15 disabled:cursor-wait disabled:opacity-70"
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={`Foto profil ${nama}`}
                className="size-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-full items-center justify-center bg-accent text-3xl font-semibold text-white"
              >
                {sibuk ? <Loader2 aria-hidden="true" className="size-7 animate-spin" /> : inisial}
              </span>
            )}
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/50 group-hover:opacity-100 group-focus-visible:bg-black/50 group-focus-visible:opacity-100"
            >
              <Camera aria-hidden="true" className="size-6" />
            </span>
          </button>
        )}
      />
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
        <p role="alert" className="mt-2 text-center text-sm text-danger">
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

// Ganti kata sandi milik sendiri dua langkah: isi sandi lama dulu, bila
// benar dibuka modal berisi sandi baru + konfirmasi.
export function PasswordEditor({ username }: { username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  const [memeriksa, setMemeriksa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [galatModal, setGalatModal] = useState<string | null>(null);
  const [buka, setBuka] = useState(false);

  // Langkah 1: pastikan sandi lama benar lewat masuk ulang.
  async function periksaLama() {
    if (memeriksa || saving) return;
    if (lama.length === 0) {
      setGalat("Isi kata sandi lama dulu.");
      return;
    }
    setMemeriksa(true);
    setGalat(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password: lama,
      });
      if (error) {
        if (error instanceof SessionExpiredError || isSessionError(error)) {
          toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
          router.replace("/login?expired=1");
          return;
        }
        setGalat("Kata sandi lama salah.");
        return;
      }
      setBaru("");
      setKonfirmasi("");
      setGalatModal(null);
      setBuka(true);
    } finally {
      setMemeriksa(false);
    }
  }

  // Langkah 2 (di modal): simpan sandi baru + konfirmasi.
  async function simpan() {
    if (saving) return;
    const sandi = baru.trim();
    if (sandi.length < 6) {
      setGalatModal("Kata sandi minimal 6 karakter.");
      return;
    }
    if (sandi !== konfirmasi.trim()) {
      setGalatModal("Konfirmasi tidak sama dengan kata sandi baru.");
      return;
    }
    setSaving(true);
    setGalatModal(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: sandi });
      if (error) {
        if (error instanceof SessionExpiredError || isSessionError(error)) {
          toast.error("Sesi Anda berakhir. Silakan masuk lagi.");
          router.replace("/login?expired=1");
          return;
        }
        setGalatModal("Gagal memperbarui kata sandi. Coba lagi.");
        return;
      }
      setLama("");
      setBaru("");
      setKonfirmasi("");
      setBuka(false);
      toast.success("Kata sandi diperbarui.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sandi-lama">Kata sandi lama</Label>
        <Input
          id="sandi-lama"
          type="password"
          autoComplete="current-password"
          value={lama}
          onChange={(event) => {
            setLama(event.target.value);
            setGalat(null);
          }}
          placeholder="Isi kata sandi saat ini"
          disabled={memeriksa}
          onKeyDown={(event) => {
            if (event.key === "Enter") void periksaLama();
          }}
          className="border-transparent bg-black/[0.075] hover:border-transparent hover:bg-black/[0.12] dark:border-transparent dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
        />
      </div>
      {galat && (
        <p role="alert" className="text-sm text-danger">
          {galat}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => void periksaLama()} disabled={memeriksa} className="rounded-full">
          {memeriksa ? "Memeriksa…" : "Lanjut"}
        </Button>
      </div>

      <Dialog open={buka} onClose={() => setBuka(false)} title="Ganti kata sandi">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sandi-baru">Kata sandi baru</Label>
            <Input
              id="sandi-baru"
              type="password"
              autoComplete="new-password"
              value={baru}
              onChange={(event) => {
                setBaru(event.target.value);
                setGalatModal(null);
              }}
              placeholder="Minimal 6 karakter"
              disabled={saving}
              className="border-transparent bg-black/[0.075] hover:border-transparent hover:bg-black/[0.12] dark:border-transparent dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
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
                setGalatModal(null);
              }}
              placeholder="Ulangi kata sandi baru"
              disabled={saving}
              onKeyDown={(event) => {
                if (event.key === "Enter") void simpan();
              }}
              className="border-transparent bg-black/[0.075] hover:border-transparent hover:bg-black/[0.12] dark:border-transparent dark:bg-white/[0.075] dark:hover:bg-white/[0.12]"
            />
          </div>
          {galatModal && (
            <p role="alert" className="text-sm text-danger">
              {galatModal}
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={() => void simpan()} disabled={saving} className="rounded-full">
              {saving ? "Menyimpan…" : "Simpan kata sandi"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
