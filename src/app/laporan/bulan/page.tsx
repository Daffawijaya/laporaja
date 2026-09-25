import { redirect } from "next/navigation";

// Rute lama daftar bulanan dipertahankan sebagai pengalihan ke halaman utama.
export default async function LaporanBulanPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.bulan) query.set("bulan", params.bulan);
  if (params.tahun) query.set("tahun", params.tahun);
  const qs = query.toString();
  redirect(`/laporan${qs ? `?${qs}` : ""}`);
}
