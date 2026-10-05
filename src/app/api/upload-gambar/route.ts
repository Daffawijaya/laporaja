import { NextResponse } from "next/server";
import convert from "heic-convert";
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
// Siap tempel ke PDF (WebP ber-alpha). Ambang adaptif dari median luminans
// tepi (warna kertas foto HP) supaya bayangan abu ikut hilang. Piksel di
// antara ambang diramp halus (smoothstep) agar tepi goresan tidak bergerigi.
async function bersihkanTandaTangan(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .rotate() // mengikuti orientasi kamera HP
    .resize({ width: 800, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  // Sampel tepi (loncati tiap 4px) → median = perkiraan warna kertas.
  const tepi: number[] = [];
  for (let x = 0; x < W; x += 4) {
    tepi.push(lum((2 * W + x) * 4));
    tepi.push(lum(((H - 3) * W + x) * 4));
  }
  for (let y = 0; y < H; y += 4) {
    tepi.push(lum((y * W + 2) * 4));
    tepi.push(lum((y * W + W - 3) * 4));
  }
  tepi.sort((a, b) => a - b);
  const kertas = tepi.length > 0 ? tepi[Math.floor(tepi.length / 2)] : 255;
  // Di bawah T0 = tinta penuh, di atas T1 = transparan penuh.
  const T1 = Math.min(245, Math.max(120, kertas - 8));
  const T0 = Math.max(30, T1 - 55);
  const keluar = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3] / 255;
    let tinta = (T1 - lum(i)) / (T1 - T0);
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
    raw: { width: W, height: H, channels: 4 },
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

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { message: `Ukuran gambar maksimal ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` },
      { status: 400 }
    );
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // Verifikasi dari ISI berkas (magic bytes), bukan sekadar file.type yang
  // dikirim browser. HEIC (foto iPhone) didekode dulu ke JPEG sebelum
  // pipeline sharp yang sama; ujungnya tetap WebP ringan.
  function tebakFormat(buf: Buffer): "jpeg" | "png" | "webp" | "avif" | "heic" | null {
    if (buf.length > 12 && buf.toString("ascii", 4, 8) === "ftyp") {
      const brand = buf.toString("ascii", 8, 12);
      if (
        ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(
          brand
        )
      )
        return "heic";
      if (brand === "avif" || brand === "avis") return "avif";
      return null;
    }
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
      return "jpeg";
    if (
      buf.length > 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    )
      return "png";
    if (
      buf.length > 12 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP"
    )
      return "webp";
    return null;
  }

  const formatAsli = tebakFormat(inputBuffer);
  if (!formatAsli) {
    return NextResponse.json(
      {
        message:
          "File tidak terbaca sebagai gambar (mungkin rusak atau hasil rename dari format lain). Simpan ulang sebagai JPG/PNG/WEBP/HEIC yang valid.",
      },
      { status: 400 }
    );
  }

  // HEIC → JPEG dulu (sharp di sini hanya membaca AVIF untuk keluarga HEIF).
  let gambarSiap = inputBuffer;
  if (formatAsli === "heic") {
    try {
      const jpeg = await convert({ buffer: inputBuffer, format: "JPEG", quality: 0.92 });
      gambarSiap = Buffer.from(jpeg);
    } catch {
      return NextResponse.json(
        { message: "Foto HEIC tidak bisa dibaca. Coba konversi manual ke JPG." },
        { status: 400 }
      );
    }
  }

  let webpBuffer: Buffer;
  try {
    if (jenis === "ttd") {
      // Tanda tangan: kertas jadi transparan, tinta jadi pekat kontras.
      webpBuffer = await bersihkanTandaTangan(gambarSiap);
    } else {
      // Convert ke WebP + resize jika terlalu besar
      webpBuffer = await sharp(gambarSiap)
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
      { message: "Gambar gagal diproses (mungkin rusak). Coba file lain." },
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
