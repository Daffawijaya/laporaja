import { NextResponse } from "next/server";
import sharp from "sharp";

import { createClient } from "@/lib/supabase/server";
import { MAX_IMAGE_BYTES } from "@/lib/supabase/storage";
import {
  driveRootFolderId,
  ensureFolder,
  isDriveConfigured,
  sanitizeFileName,
  uploadWebp,
} from "@/lib/drive/client";

// Upload gambar kegiatan: dikonversi ke WebP dulu di server supaya ringan
// (salinan pola etamhub: rotate + resize 1920 + webp quality 80), lalu
// disimpan ke Google Drive (root/2026-09/Nama User/<acak>.webp untuk
// laporan, root/Avatar/Nama User/<acak>.webp untuk foto profil).
// Bukan ke Storage/database.
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

  const formData = await req.formData();
  const file = formData.get("file");
  const jenis = formData.get("jenis");
  const tahun = Number(formData.get("tahun") ?? "");
  const bulan = Number(formData.get("bulan") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "File tidak ditemukan." }, { status: 400 });
  }
  if (jenis !== "laporan" && jenis !== "avatar") {
    return NextResponse.json({ message: "Jenis upload tidak valid." }, { status: 400 });
  }
  if (
    jenis === "laporan" &&
    (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100 || !Number.isInteger(bulan) || bulan < 1 || bulan > 12)
  ) {
    return NextResponse.json({ message: "Periode tidak valid." }, { status: 400 });
  }

  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowedMimeTypes.includes(file.type)) {
    return NextResponse.json(
      { message: "Format file harus JPG, JPEG, PNG, atau WEBP." },
      { status: 400 }
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { message: `Ukuran gambar maksimal ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` },
      { status: 400 }
    );
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let webpBuffer: Buffer;
  try {
    // Convert ke WebP + resize jika terlalu besar
    webpBuffer = await sharp(inputBuffer)
      .rotate() // mengikuti orientasi kamera HP
      .resize({
        width: 1920,
        withoutEnlargement: true,
      })
      .webp({
        quality: 80,
        effort: 6,
      })
      .toBuffer();
  } catch {
    return NextResponse.json(
      { message: "Format file harus JPG, JPEG, PNG, atau WEBP." },
      { status: 400 }
    );
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("nama, username")
    .eq("id", user.id)
    .maybeSingle();
  const namaFolder =
    sanitizeFileName((profil?.nama ?? profil?.username ?? user.id).trim()) || user.id;

  try {
    const rootId = driveRootFolderId();
    // Laporan: root/2026-09/Nama User. Avatar: root/Avatar/Nama User.
    const indukId =
      jenis === "laporan"
        ? await ensureFolder(`${tahun}-${String(bulan).padStart(2, "0")}`, rootId)
        : await ensureFolder("Avatar", rootId);
    const userId = await ensureFolder(namaFolder, indukId);
    const filename = `${crypto.randomUUID()}.webp`;
    const fileId = await uploadWebp(userId, filename, webpBuffer);
    return NextResponse.json({ path: `drive:${fileId}` });
  } catch {
    return NextResponse.json({ message: "Gagal mengunggah gambar. Coba lagi." }, { status: 500 });
  }
}
