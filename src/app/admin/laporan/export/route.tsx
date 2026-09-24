import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSignedImageUrl } from "@/lib/supabase/storage";
import { clampBulan, clampTahun, getMonthlyLaporan } from "@/lib/laporan/queries";
import { LaporanDocument, type PdfDay } from "@/components/admin/laporan-document";
import { NAMA_BULAN, pad2 } from "@/components/laporan/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Export PDF hanya untuk superadmin. Dipanggil dari tombol Export PDF
// di /admin/laporan dengan parameter user, bulan, tahun.
export async function GET(request: Request) {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile || profile.role !== "superadmin") {
    return Response.json({ message: "Hanya superadmin yang dapat mengekspor laporan." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const now = new Date();
  const bulan = clampBulan(params.get("bulan"), now.getMonth() + 1);
  const tahun = clampTahun(params.get("tahun"), now.getFullYear());
  const userId = params.get("user") ?? "";
  if (!userId) {
    return Response.json({ message: "Pilih user terlebih dahulu." }, { status: 400 });
  }

  const supabase = await createClient();
  const [{ data: owner }, { data: subs }] = await Promise.all([
    supabase.from("profiles").select("username, nama, bidang_id").eq("id", userId).maybeSingle(),
    supabase.from("user_sub_bidang").select("nama").eq("user_id", userId).order("nama"),
  ]);
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

  const items = await getMonthlyLaporan(supabase, userId, tahun, bulan);

  // Ubah path Storage menjadi URL sementara agar renderer dapat mengunduhnya.
  // Gambar yang tidak dapat dijangkau dilewati agar export tidak gagal total.
  const imagePaths = new Set<string>();
  for (const item of items) {
    for (const row of item.keterangan) {
      if (row.tipe === "image" && row.image_url) imagePaths.add(row.image_url);
    }
  }
  const signedByPath = new Map<string, string>();
  await Promise.all(
    [...imagePaths].map(async (path) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const url = await getSignedImageUrl(supabase, path);
        clearTimeout(timeout);
        if (!url) return;
        const reachable = await fetch(url, { method: "HEAD", signal: controller.signal })
          .then((res) => res.ok)
          .catch(() => false);
        if (reachable) signedByPath.set(path, url);
      } catch {
        // Lewati gambar yang gagal, lanjutkan export.
      }
    })
  );

  const [y0, m0] = [tahun, bulan];
  const days: PdfDay[] = [];
  const dayCount = new Date(y0, m0, 0).getDate();
  for (let hari = 1; hari <= dayCount; hari++) {
    const iso = `${y0}-${pad2(m0)}-${pad2(hari)}`;
    const daftar = items.filter((item) => item.tanggal === iso);
    if (daftar.length === 0) continue;
    days.push({
      label: `${pad2(hari)} ${NAMA_BULAN[m0 - 1]} ${y0}`,
      kegiatan: daftar.map((item) => ({
        nama: item.nama,
        status: item.review?.status ?? null,
        catatan: item.review?.catatan ?? null,
        blocks: item.keterangan.map((row) =>
          row.tipe === "text"
            ? { tipe: "text" as const, text: row.isi_text, imageUrl: null }
            : {
                tipe: "image" as const,
                text: row.isi_text,
                imageUrl: row.image_url ? (signedByPath.get(row.image_url) ?? null) : null,
              }
        ),
      })),
    });
  }

  const buffer = await renderToBuffer(
    <LaporanDocument
      data={{
        ownerNama: owner.nama,
        bidangNama,
        subBidang: (subs ?? []).map((sub) => sub.nama),
        periode: `${NAMA_BULAN[bulan - 1]} ${tahun}`,
        days,
      }}
    />
  );

  const filename = `laporan-${owner.username}-${tahun}-${pad2(bulan)}.pdf`;
  const body = new Uint8Array(buffer);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
    },
  });
}
