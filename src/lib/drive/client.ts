// Klien Google Drive mentah via fetch (pola kawaku-content-hub, tanpa
// library googleapis). SERVER ONLY: memakai refresh token dari env, jangan
// diimpor dari komponen client.
import { DRIVE_REF } from "@/lib/supabase/storage";

export function driveFileId(ref: string): string | null {
  if (!ref.startsWith(DRIVE_REF)) return null;
  const id = ref.slice(DRIVE_REF.length).trim();
  return id.length > 0 ? id : null;
}

function driveEnv() {
  return {
    CLIENT_ID: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
    CLIENT_SECRET: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
    REFRESH_TOKEN: process.env.GOOGLE_DRIVE_REFRESH_TOKEN ?? "",
    ROOT_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID ?? "",
  };
}

export function driveRootFolderId(): string {
  return driveEnv().ROOT_FOLDER_ID;
}

export function isDriveConfigured(): boolean {
  const env = driveEnv();
  return Boolean(env.CLIENT_ID && env.CLIENT_SECRET && env.REFRESH_TOKEN && env.ROOT_FOLDER_ID);
}

let cachedToken: { token: string; exp: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (!isDriveConfigured()) throw new Error("Google Drive belum dikonfigurasi.");
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const { CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN } = driveEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Gagal refresh token Google (cek kredensial / masa berlaku).");
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function driveFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    cachedToken = null; // paksa refresh sekali
    const retry = await getAccessToken();
    return fetch(`https://www.googleapis.com${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${retry}`, ...(init?.headers ?? {}) },
    });
  }
  return res;
}

function assertOk(res: Response, action: string) {
  if (!res.ok) throw new Error(`Drive API ${action} gagal (HTTP ${res.status}).`);
}

export function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|#]/g, "_").slice(0, 150);
}

// Cari folder anak berdasarkan nama + induk; buat bila belum ada.
export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const token = await getAccessToken();
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const found = (await (
    await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()) as { files?: { id: string }[] };
  if (found.files?.[0]) return found.files[0].id;

  const res = await driveFetch("/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  assertOk(res, "buat folder");
  return ((await res.json()) as { id: string }).id;
}

// Upload kecil (hasil WebP < 5 MB) via multipart sederhana.
export async function uploadWebp(
  parentId: string,
  name: string,
  bytes: Buffer
): Promise<string> {
  const boundary = `laporaja${crypto.randomUUID().replace(/-/g, "")}`;
  const meta = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name, mimeType: "image/webp", parents: [parentId] }) +
      `\r\n--${boundary}\r\nContent-Type: image/webp\r\n\r\n`,
    "utf-8"
  );
  const footer = Buffer.from(`\r\n--${boundary}--`, "utf-8");
  const res = await driveFetch("/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(Buffer.concat([meta, bytes, footer])),
  });
  assertOk(res, "upload");
  return ((await res.json()) as { id: string }).id;
}

// Unduh bytes sebuah file.
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const res = await driveFetch(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  assertOk(res, "unduh");
  return Buffer.from(await res.arrayBuffer());
}

// Trash (bukan hapus permanen) — aman, bisa restore dari Drive.
export async function trashDriveFile(fileId: string) {
  const res = await driveFetch(`/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  assertOk(res, "trash");
}

// Pastikan file berada di bawah folder root LaporAja (tahan terhadap ID
// acak milik folder lain). Menelusuri parents maksimal 4 tingkat.
export async function isUnderRoot(fileId: string, rootId: string): Promise<boolean> {
  let current = fileId;
  for (let i = 0; i < 4; i++) {
    const res = await driveFetch(
      `/drive/v3/files/${encodeURIComponent(current)}?fields=id,parents,trashed`
    );
    if (!res.ok) return false;
    const json = (await res.json()) as { parents?: string[]; trashed?: boolean };
    if (json.trashed) return false;
    const parents = json.parents ?? [];
    if (parents.includes(rootId)) return true;
    if (parents.length === 0) return false;
    current = parents[0];
  }
  return false;
}
