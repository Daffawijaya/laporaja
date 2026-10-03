import { NextResponse } from "next/server";
import sharp from "sharp";

import { createClient } from "@/lib/supabase/server";
import { MAX_IMAGE_BYTES } from "@/lib/supabase/storage";

const BUCKET = "kegiatan-images";

// Upload gambar kegiatan: dikonversi ke WebP dulu di server supaya ringan
// (salinan pola etamhub: rotate + resize 1920 + webp quality 80).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Sesi Anda berakhir. Silakan masuk lagi." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const folder = formData.get("folder");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "File tidak ditemukan." }, { status: 400 });
  }
  if (typeof folder !== "string" || folder.length === 0 || folder.length > 100) {
    return NextResponse.json({ message: "Folder tidak valid." }, { status: 400 });
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

  const filename = `${crypto.randomUUID()}.webp`;
  const path = `${user.id}/${folder}/${filename}`;
  const uploadData = new Uint8Array(webpBuffer);

  const { error } = await supabase.storage.from(BUCKET).upload(path, uploadData, {
    contentType: "image/webp",
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ message: "Gagal mengunggah gambar. Coba lagi." }, { status: 500 });
  }

  return NextResponse.json({ path });
}
