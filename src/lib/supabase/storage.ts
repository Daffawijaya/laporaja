import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Periode } from "@/lib/laporan-tambahan/queries";
import { SessionExpiredError, failWith } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

export type StorageClient = SupabaseClient<Database>;

const BUCKET = "kegiatan-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Rujukan gambar bisa berupa path Storage lawas atau ID file Drive baru
// ("drive:<fileId>"). Perbandingan string buram tetap berlaku untuk keduanya.
export const DRIVE_REF = "drive:";

// Best effort: kegagalan hapus file tidak menggagalkan simpan/hapus kegiatan.
// Rujukan Drive dihapus lewat endpoint server (kredensial Drive hanya di server).
export async function removeGambarRefs(paths: string[]): Promise<void> {
  const driveIds = paths
    .filter((path) => path.startsWith(DRIVE_REF))
    .map((path) => path.slice(DRIVE_REF.length).trim())
    .filter((id) => id.length > 0);
  const legacy = paths.filter((path) => !path.startsWith(DRIVE_REF) && path.length > 0);
  if (driveIds.length > 0) {
    try {
      await fetch("/api/hapus-gambar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: driveIds }),
      });
    } catch {
      // Diabaikan: best effort.
    }
  }
  if (legacy.length > 0) {
    await removeStoragePaths(createClient(), legacy);
  }
}

// Gambar diunggah lewat endpoint server agar dikonversi ke WebP dulu
// (sharp, pola etamhub) sebelum disimpan ke Google Drive di bawah folder
// bulan + user. Mengembalikan rujukan "drive:<fileId>".
// Tujuan upload: laporan (folder bulan + user) atau avatar (folder Avatar +
// user). Foto profil ikut ke Drive agar sumber tunggal.
export type TujuanUpload =
  | { jenis: "laporan"; periode: Periode }
  | { jenis: "avatar" };

export async function uploadKegiatanImage(tujuan: TujuanUpload, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("jenis", tujuan.jenis);
  if (tujuan.jenis === "laporan") {
    form.append("tahun", String(tujuan.periode.tahun));
    form.append("bulan", String(tujuan.periode.bulan));
  }
  const res = await fetch("/api/upload-gambar", { method: "POST", body: form });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) throw new SessionExpiredError();
    const message =
      typeof data === "object" && data !== null && "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : "Gagal mengunggah gambar. Coba lagi.";
    failWith({ status: res.status, message }, message);
  }
  const path =
    typeof data === "object" && data !== null && "path" in data
      ? (data as { path: unknown }).path
      : "";
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("Gagal mengunggah gambar. Coba lagi.");
  }
  return path;
}

// Best effort: kegagalan hapus file tidak menggagalkan simpan/hapus kegiatan.
export async function removeStoragePaths(
  client: StorageClient,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;
  await client.storage.from(BUCKET).remove(paths);
}

export async function removeKegiatanFolder(
  client: StorageClient,
  userId: string,
  kegiatanId: string
): Promise<void> {
  const prefix = `${userId}/${kegiatanId}`;
  const { data } = await client.storage.from(BUCKET).list(prefix);
  if (data && data.length > 0) {
    await removeStoragePaths(
      client,
      data.map((file) => `${prefix}/${file.name}`)
    );
  }
}

// Hapus seluruh gambar milik satu user. Dipakai saat akun dihapus agar tidak
// meninggalkan berkas yatim di Storage. Best effort.
export async function removeUserFolder(
  client: StorageClient,
  userId: string
): Promise<void> {
  const { data: kegiatanFolders } = await client.storage.from(BUCKET).list(userId);
  if (!kegiatanFolders) return;
  const paths: string[] = [];
  for (const folder of kegiatanFolders) {
    const prefix = `${userId}/${folder.name}`;
    const { data: files } = await client.storage.from(BUCKET).list(prefix);
    for (const file of files ?? []) {
      paths.push(`${prefix}/${file.name}`);
    }
  }
  await removeStoragePaths(client, paths);
}

export async function getSignedImageUrl(
  client: StorageClient,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

// URL tampil untuk rujukan gambar: Drive via proxy internal, path Storage
// lawas via signed URL.
export async function resolveGambarUrl(
  client: StorageClient,
  ref: string
): Promise<string | null> {
  if (ref.startsWith(DRIVE_REF)) {
    const id = ref.slice(DRIVE_REF.length).trim();
    return id.length > 0 ? `/api/drive/gambar/${id}` : null;
  }
  return getSignedImageUrl(client, ref);
}
