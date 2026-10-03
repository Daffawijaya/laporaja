import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { driveRootFolderId, isDriveConfigured, isUnderRoot, trashDriveFile } from "@/lib/drive/client";

// Trash berkas gambar Drive milik laporan user. Berkas harus berada di
// bawah folder root LaporAja (lapisan pengaman selain sesi login).
export async function POST(req: Request) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ message: "Google Drive belum dikonfigurasi." }, { status: 500 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Sesi Anda berakhir. Silakan masuk lagi." }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  const ids =
    typeof body === "object" && body !== null && "ids" in body && Array.isArray((body as { ids: unknown }).ids)
      ? (body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
  if (ids.length === 0 || ids.length > 50) {
    return NextResponse.json({ message: "Tidak ada berkas yang dihapus." }, { status: 400 });
  }

  const rootId = driveRootFolderId();
  for (const id of [...new Set(ids)]) {
    try {
      if (await isUnderRoot(id, rootId)) await trashDriveFile(id);
    } catch {
      // Best effort per berkas.
    }
  }
  return NextResponse.json({ ok: true });
}
