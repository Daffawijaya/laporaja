"use client";

import { useEffect } from "react";

// Daftarkan service worker sekali sesudah halaman dimuat. Gagal daftar
// (mis. browser lama) diabaikan: aplikasi tetap jalan normal.
// Di development (localhost) SW TIDAK didaftarkan dan yang sudah terlanjur
// terpasang langsung dilepas: cache-first SW pada /_next/static membuat dev
// chunk basi sehingga HTML server (baru) vs JS klien (lama) mismatch saat
// hidrasi — persis error hydration di /anda kemarin.
export function PendaftarSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
        .catch(() => undefined);
      return;
    }
    const daftar = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") daftar();
    else window.addEventListener("load", daftar, { once: true });
    return () => window.removeEventListener("load", daftar);
  }, []);
  return null;
}
