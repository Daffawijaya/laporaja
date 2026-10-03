import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
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
    getTugasUser(supabase, userId, owner.bidang_id).catch(() => null),
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
      const jobs: Promise<void>[] = [];
      item.baris.forEach((row, rowIdx) => {
        item.kolom.forEach((col, colIdx) => {
          if (col.tipe !== "image") return;
          const parsed = parseGambarNilai(row.nilai[col.id] ?? "");
          if (!parsed?.gambar) return;
          jobs.push(
            supabase.storage
              .from("kegiatan-images")
              .createSignedUrl(parsed.gambar, 3600)
              .then(({ data }) => {
                if (data?.signedUrl) gambarUrl[`${rowIdx}:${colIdx}`] = data.signedUrl;
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
