import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type StorageClient = SupabaseClient<Database>;

const BUCKET = "kegiatan-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function extensionOf(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1].slice(0, 5) : "jpg";
}

// Path selalu "<user_id>/<kegiatan_id>/<acak>.<ext>" sesuai kebijakan Storage.
export async function uploadKegiatanImage(
  client: StorageClient,
  userId: string,
  kegiatanId: string,
  file: File
): Promise<string> {
  const path = `${userId}/${kegiatanId}/${crypto.randomUUID()}.${extensionOf(file.name)}`;
  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(`Gagal mengunggah gambar: ${error.message}`);
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
