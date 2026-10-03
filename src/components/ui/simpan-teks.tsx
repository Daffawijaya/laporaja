"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { setSimpanStatus, useSimpanStatus, type SimpanStatus } from "@/lib/simpan-status";

const TEKS: Record<Exclude<SimpanStatus, "idle">, string> = {
  saving: "Menyimpan…",
  saved: "Tersimpan",
  error: "Gagal menyimpan",
};

// Teks kecil sebelah kanan judul navbar (hanya di halaman Section).
// Tanpa animasi/ikon: cukup "Menyimpan…" lalu "Tersimpan".
export function SimpanTeks() {
  const status = useSimpanStatus();
  const pathname = usePathname();
  const diSection = pathname === "/admin/section";

  // Buang status basi saat pindah halaman.
  useEffect(() => {
    if (!diSection) setSimpanStatus("idle");
  }, [diSection]);

  if (!diSection || status === "idle") return null;

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
