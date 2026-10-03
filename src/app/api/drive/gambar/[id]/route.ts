import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { downloadDriveFile, driveRootFolderId, isDriveConfigured, isUnderRoot } from "@/lib/drive/client";

// Proxy bytes gambar Drive untuk <img> (butuh login + berkas harus di bawah
// folder root LaporAja). Berkas Drive tidak berubah, jadi boleh di-cache lama.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  if (!id) return NextResponse.json({ message: "Tidak ditemukan." }, { status: 404 });
  if (!(await isUnderRoot(id, driveRootFolderId()))) {
    return NextResponse.json({ message: "Tidak ditemukan." }, { status: 404 });
  }

  try {
    const bytes = await downloadDriveFile(id);
    const body = new Uint8Array(bytes);
    return new Response(body, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ message: "Tidak ditemukan." }, { status: 404 });
  }
}
