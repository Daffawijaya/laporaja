"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { setSimpanStatus, useSimpanStatus, type SimpanStatus } from "@/lib/simpan-status";

const TEKS: Record<Exclude<SimpanStatus, "idle">, string> = {
  saving: "Menyimpan…",
  saved: "Tersimpan",
  error: "Gagal menyimpan",
};

// Teks kecil sebelah kanan judul navbar (halaman Section + Laporan).
// Tanpa animasi/ikon: cukup "Menyimpan…" lalu "Tersimpan".
export function SimpanTeks() {
  const status = useSimpanStatus();
  const pathname = usePathname();
  const tampilkan = pathname === "/admin/section" || pathname.startsWith("/laporan");

  // Buang status basi saat pindah halaman.
  useEffect(() => {
    if (!tampilkan) setSimpanStatus("idle");
  }, [tampilkan]);

  if (!tampilkan || status === "idle") return null;

  return (
    <span
      aria-live="polite"
      className={`shrink-0 text-xs font-normal ${
        status === "error" ? "text-danger" : "text-neutral-500"
      }`}
    >
      {TEKS[status]}
    </span>
  );
}
