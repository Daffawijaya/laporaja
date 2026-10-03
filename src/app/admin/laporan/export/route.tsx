import { renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { downloadDriveFile } from "@/lib/drive/client";
import { getSignedImageUrl } from "@/lib/supabase/storage";
import { getTugasUser, parseGambarNilai } from "@/lib/laporan-tambahan/queries";
import { LaporanDocument, type PdfTambahan } from "@/components/admin/laporan-document";
import { formatTanggalPanjang } from "@/components/laporan/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Export PDF hanya untuk superadmin: seluruh isian section satu user
// (tanpa bulan). Dipanggil dari tombol Export PDF di /admin/laporan.
export async function GET(request: Request) {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile || profile.role !== "superadmin") {
    return Response.json({ message: "Hanya superadmin yang dapat mengekspor laporan." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const userId = params.get("user") ?? "";
  if (!userId) {
    return Response.json({ message: "Pilih user terlebih dahulu." }, { status: 400 });
  }
  const tahun = Number(params.get("tahun") ?? "");
  const bulan = Number(params.get("bulan") ?? "");
  const periode =
    Number.isInteger(tahun) &&
    Number.isInteger(bulan) &&
    tahun >= 2000 &&
    tahun <= 2100 &&
    bulan >= 1 &&
    bulan <= 12
      ? { tahun, bulan }
      : null;

  const supabase = await createClient();
  const { data: owner } = await supabase
    .from("profiles")
    .select("username, nama, bidang_id")
    .eq("id", userId)
    .maybeSingle();
  if (!owner) {
    return Response.json({ message: "User tidak ditemukan." }, { status: 404 });
  }

  let bidangNama: string | null = null;
  if (owner.bidang_id) {
    const { data: bidang } = await supabase
      .from("bidang")
      .select("nama")
      .eq("id", owner.bidang_id)
      .maybeSingle();
    bidangNama = bidang?.nama ?? null;
  }

  const [subsResult, pengaturanResult, tugas] = await Promise.all([
    supabase.from("user_sub_bidang").select("nama").eq("user_id", userId).order("nama"),
    supabase.from("pengaturan").select("nilai").eq("kunci", "unit_kerja").maybeSingle(),
    getTugasUser(supabase, userId, owner.bidang_id, periode).catch(() => null),
  ]);
  if (!tugas) {
    return Response.json(
      { message: "Gagal menyiapkan laporan. Coba lagi." },
      { status: 500 }
    );
  }

  const tambahan: PdfTambahan[] = await Promise.all(
    tugas.map(async (item) => {
      const gambarUrl: Record<string, string> = {};
      const baris = item.baris.map((row) =>
        item.kolom.map((col) => {
          const raw = row.nilai[col.id] ?? "";
          if (!raw || col.tipe !== "date" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
          try {
            return formatTanggalPanjang(raw);
          } catch {
            return raw;
          }
        })
      );
      // URL bertanda untuk sel gambar (superadmin boleh baca semua berkas).
      // Rujukan Drive diunduh + dijadikan JPEG (PDF tidak andal merender
      // WebP); path Storage lawas tetap via signed URL.
      const jobs: Promise<void>[] = [];
      item.baris.forEach((row, rowIdx) => {
        item.kolom.forEach((col, colIdx) => {
          if (col.tipe !== "image") return;
          const parsed = parseGambarNilai(row.nilai[col.id] ?? "");
          if (!parsed?.gambar) return;
          const ref = parsed.gambar;
          if (ref.startsWith("drive:")) {
            const fileId = ref.slice("drive:".length).trim();
            if (!fileId) return;
            jobs.push(
              downloadDriveFile(fileId)
                .then((bytes) => sharp(bytes).jpeg({ quality: 85 }).toBuffer())
                .then((jpeg) => {
                  gambarUrl[`${rowIdx}:${colIdx}`] =
                    `data:image/jpeg;base64,${jpeg.toString("base64")}`;
                })
                .catch(() => undefined)
            );
            return;
          }
          jobs.push(
            getSignedImageUrl(supabase, ref).then((signed) => {
              if (signed) gambarUrl[`${rowIdx}:${colIdx}`] = signed;
            })
          );
        });
      });
      await Promise.all(jobs);
      return {
        judul: item.judul,
        deskripsi: item.deskripsi,
        format: item.format,
        kolom: item.kolom.map((col) => col.label),
        kolomTipe: item.kolom.map((col) => col.tipe),
        baris,
        gambarUrl,
      };
    })
  );

  const buffer = await renderToBuffer(
    <LaporanDocument
      data={{
        ownerNama: owner.nama,
        bidangNama,
        subBidang: (subsResult.data ?? []).map((sub) => sub.nama),
        unitKerja: pengaturanResult.data?.nilai ?? null,
        tambahan,
      }}
    />
  );

  const filename = `laporan-${owner.username}.pdf`;
  const body = new Uint8Array(buffer);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
    },
  });
}
