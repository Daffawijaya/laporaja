import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { SessionExpiredError, failWith } from "@/lib/errors";

export type StorageClient = SupabaseClient<Database>;

const BUCKET = "kegiatan-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Gambar diunggah lewat endpoint server agar dikonversi ke WebP dulu
// (sharp, pola etamhub) sebelum disimpan ke Storage. Mengembalikan path
// "<user_id>/<folder_id>/<acak>.webp".
export async function uploadKegiatanImage(folderId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folderId);
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
