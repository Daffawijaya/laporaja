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

// Preprocessing tanda tangan: kertas/latar terang dijadikan transparan,
// tinta digelapkan supaya kontras dan kelihatan natural seperti pulpen.
// Siap tempel ke PDF (WebP ber-alpha). Piksel di antara ambang diramp
// halus (smoothstep) agar tepi goresan tidak bergerigi.
async function bersihkanTandaTangan(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .rotate() // mengikuti orientasi kamera HP
    .resize({ width: 800, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const keluar = Buffer.alloc(data.length);
  // Di bawah T0 = tinta penuh, di atas T1 = transparan penuh.
  const T0 = 170;
  const T1 = 215;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3] / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let tinta = (T1 - lum) / (T1 - T0);
    if (tinta < 0) tinta = 0;
    else if (tinta > 1) tinta = 1;
    const halus = tinta * tinta * (3 - 2 * tinta);
    const pekat = 1 - 0.45 * halus;
    keluar[i] = Math.round(r * pekat);
    keluar[i + 1] = Math.round(g * pekat);
    keluar[i + 2] = Math.round(b * pekat);
    keluar[i + 3] = Math.round(a * halus * 255);
  }
  return sharp(keluar, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .webp({ quality: 90, effort: 6 })
    .toBuffer();
}

// Upload gambar kegiatan: dikonversi ke WebP dulu di server supaya ringan
// (salinan pola etamhub: rotate + resize 1920 + webp quality 80), lalu
// disimpan ke Google Drive (root/2026-09/Nama User/<acak>.webp untuk
// laporan, root/Avatar/Nama User/<acak>.webp untuk foto profil,
// root/TTD/<acak>.webp untuk tanda tangan yang sudah dibersihkan).
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
  if (jenis !== "laporan" && jenis !== "avatar" && jenis !== "ttd") {
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
    if (jenis === "ttd") {
      // Tanda tangan: kertas jadi transparan, tinta jadi pekat kontras.
      webpBuffer = await bersihkanTandaTangan(inputBuffer);
    } else {
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
    }
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
    // TTD: root/TTD langsung (tanda tangan milik banyak orang).
    const indukId =
      jenis === "laporan"
        ? await ensureFolder(`${tahun}-${String(bulan).padStart(2, "0")}`, rootId)
        : jenis === "ttd"
          ? await ensureFolder("TTD", rootId)
          : await ensureFolder("Avatar", rootId);
    const folderId = jenis === "ttd" ? indukId : await ensureFolder(namaFolder, indukId);
    const filename = `${crypto.randomUUID()}.webp`;
    const fileId = await uploadWebp(folderId, filename, webpBuffer);
    return NextResponse.json({ path: `drive:${fileId}` });
  } catch {
    return NextResponse.json({ message: "Gagal mengunggah gambar. Coba lagi." }, { status: 500 });
  }
}
