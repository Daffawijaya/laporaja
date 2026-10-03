"use client";

import { useEffect } from "react";

// Daftarkan service worker sekali sesudah halaman dimuat. Gagal daftar
// (mis. browser lama) diabaikan: aplikasi tetap jalan normal.
export function PendaftarSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const daftar = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") daftar();
    else window.addEventListener("load", daftar, { once: true });
    return () => window.removeEventListener("load", daftar);
  }, []);
  return null;
}
