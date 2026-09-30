"use client";

import { useRouter } from "next/navigation";

import { LaporanTambahanForm } from "@/components/admin/laporan-tambahan-form";

// Pembungkus halaman penuh: selesai/batal kembali ke daftar.
export function LaporanTambahanCreate({
  bidangList,
}: {
  bidangList: { id: string; nama: string }[];
}) {
  const router = useRouter();
  function kembali() {
    router.push("/admin/laporan-tambahan");
    router.refresh();
  }
  return <LaporanTambahanForm bidangList={bidangList} onCancel={kembali} onSaved={kembali} />;
}
