import { renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { downloadDriveFile } from "@/lib/drive/client";
import { getSignedImageUrl } from "@/lib/supabase/storage";
import { getTugasUser, parseGambarNilai } from "@/lib/laporan-tambahan/queries";
import {
  LaporanDocument,
  type PdfTambahan,
  type PdfTtd,
} from "@/components/admin/laporan-document";
import { formatTanggalPanjang } from "@/components/laporan/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface TtdMentah {
  peran: string;
  nama: string;
  jabatan: string;
  pangkat: string;
  nip: string;
  gambar: string;
}

function normalisasiTtd(item: unknown): TtdMentah {
  const row = (typeof item === "object" && item !== null ? item : {}) as Record<
    string,
    unknown
  >;
  const teks = (nilai: unknown) => (typeof nilai === "string" ? nilai : "");
  return {
    peran: teks(row.peran),
    nama: teks(row.nama),
    jabatan: teks(row.jabatan),
    pangkat: teks(row.pangkat),
    nip: teks(row.nip),
    gambar: teks(row.gambar),
  };
}

// Export PDF hanya untuk superadmin: susunannya menyamai /admin/section —
// kartu Info di atas, section mengikuti urutan builder, blok tanda tangan
// di bawah. Dipanggil dari tombol Pratinjau/Export di /admin/laporan.
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
    .select("username, nama, bidang_id, ttd")
    .eq("id", userId)
    .maybeSingle();
  if (!owner) {
    return Response.json({ message: "User tidak ditemukan." }, { status: 404 });
  }

  const KUNCI_PENGATURAN = [
    "unit_kerja",
    "info_judul",
    "jabatan_awalan",
    "ttd_daftar",
    "ttd_user_peran",
    "ttd_user_posisi",
    "ttd_tempat",
  ];
  const [pengaturanResult, tugas, bidangResult, subsResult] = await Promise.all([
    supabase.from("pengaturan").select("kunci, nilai").in("kunci", KUNCI_PENGATURAN),
    getTugasUser(supabase, userId, owner.bidang_id, periode).catch(() => null),
    owner.bidang_id
      ? supabase.from("bidang").select("nama").eq("id", owner.bidang_id).maybeSingle()
      : Promise.resolve({ data: null as { nama: string } | null }),
    supabase.from("user_sub_bidang").select("nama").eq("user_id", userId).order("nama"),
  ]);
  if (!tugas) {
    return Response.json(
      { message: "Gagal menyiapkan laporan. Coba lagi." },
      { status: 500 }
    );
  }
  const pengaturan = new Map(
    (pengaturanResult.data ?? []).map((row) => [row.kunci, row.nilai] as const)
  );
  const unitKerja = pengaturan.get("unit_kerja") ?? null;
  const infoJudul = pengaturan.get("info_judul") ?? null;
  const jabatanAwalan = pengaturan.get("jabatan_awalan") ?? null;
  const ttdPeranUser = pengaturan.get("ttd_user_peran") ?? "";
  const ttdTempat = (pengaturan.get("ttd_tempat") ?? "").trim() || null;

  // Daftar tanda tangan (JSON di pengaturan "ttd_daftar"): rusak = [].
  let ttdManual: TtdMentah[] = [];
  try {
    const mentah: unknown = pengaturan.get("ttd_daftar")
      ? JSON.parse(pengaturan.get("ttd_daftar") as string)
      : [];
    if (Array.isArray(mentah)) {
      ttdManual = mentah.map(normalisasiTtd).filter(
        (item) =>
          item.peran.trim() ||
          item.nama.trim() ||
          item.jabatan.trim() ||
          item.pangkat.trim() ||
          item.nip.trim() ||
          item.gambar.trim()
      );
    }
  } catch {
    ttdManual = [];
  }
  // Posisi kartu otomatis pelapor (angka cacah, rusak = paling akhir).
  const posisiMentah = (pengaturan.get("ttd_user_posisi") ?? "").trim();
  const posisiAuto = /^\d+$/.test(posisiMentah)
    ? Math.min(Math.max(0, Number(posisiMentah)), ttdManual.length)
    : ttdManual.length;

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

  // Rangkaian TTD tampil: manual + kartu otomatis pelapor disisipkan di
  // posisi tersimpan. Gambar Drive dijadikan PNG base64 (TTD WebP
  // transparan — JPEG merusak latar); path lawas via signed URL.
  async function resolveTtdGambar(ref: string): Promise<string | null> {
    const bersih = (ref ?? "").trim();
    if (!bersih) return null;
    if (bersih.startsWith("drive:")) {
      const fileId = bersih.slice("drive:".length).trim();
      if (!fileId) return null;
      try {
        const bytes = await downloadDriveFile(fileId);
        const png = await sharp(bytes)
          .resize({ width: 400, withoutEnlargement: true })
          .png()
          .toBuffer();
        return `data:image/png;base64,${png.toString("base64")}`;
      } catch {
        return null;
      }
    }
    try {
      return await getSignedImageUrl(supabase, bersih);
    } catch {
      return null;
    }
  }

  // Baris unit kartu otomatis: hanya nilai (tanpa kata "Bidang"/"Sub Bidang").
  const bidangNama = (bidangResult.data?.nama ?? "").trim();
  const subNama = (subsResult.data ?? []).map((sub) => sub.nama.trim()).filter(Boolean);
  const unitOtomatis: string[] = [];
  if (bidangNama) unitOtomatis.push(bidangNama);
  if (subNama.length > 0) unitOtomatis.push(subNama.join(", "));

  const urutanTtd: TtdMentah[] = [...ttdManual];
  urutanTtd.splice(posisiAuto, 0, {
    peran: ttdPeranUser,
    nama: owner.nama,
    jabatan: jabatanAwalan ?? "",
    pangkat: "",
    nip: "",
    gambar: owner.ttd ?? "",
  });
  const ttd: PdfTtd[] = await Promise.all(
    urutanTtd.map(async (item, index) => ({
      peran: item.peran,
      nama: item.nama,
      jabatan: item.jabatan,
      pangkat: item.pangkat,
      nip: item.nip,
      gambarUrl: await resolveTtdGambar(item.gambar),
      unit: index === posisiAuto ? unitOtomatis : [],
    }))
  );

  const buffer = await renderToBuffer(
    <LaporanDocument
      data={{
        infoJudul,
        periode,
        ownerNama: owner.nama,
        jabatan: jabatanAwalan,
        unitKerja,
        tambahan,
        ttd,
        tempat: ttdTempat,
      }}
    />
  );

  const filename = `laporan-${owner.username}.pdf`;
  const body = new Uint8Array(buffer);
  // ?preview=1 = tampilkan di tab baru untuk dicek (inline), default unduh.
  const pratinjau = params.get("preview") === "1";
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${pratinjau ? "inline" : "attachment"}; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
    },
  });
}
