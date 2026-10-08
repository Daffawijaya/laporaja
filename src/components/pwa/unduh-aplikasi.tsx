"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

// Perintah pasang bawaan browser (Android/Chrome desktop). iOS tidak punya
// event ini sehingga bertipe lokal saja.
interface PerintahPasang extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Tombol unduh aplikasi: sekali klik memasang Laporaja ke HP. Android
// memakai prompt bawaan; iPhone/iPad memakai panduan manual karena Apple
// tidak menyediakan prompt (Bagikan > Tambah ke Layar Utama). Sembunyi
// sendiri bila sudah berjalan sebagai aplikasi.
export function UnduhAplikasi() {
  const [perintah, setPerintah] = useState<PerintahPasang | null>(null);
  // Berjalan dari layar utama = sudah terpasang (cek sekali saat mount).
  const [terpasang, setTerpasang] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
  const [panduan, setPanduan] = useState<null | "ios" | "manual">(null);

  useEffect(() => {
    function simpanPerintah(event: Event) {
      event.preventDefault();
      setPerintah(event as PerintahPasang);
    }
    function tandaiPasang() {
      setTerpasang(true);
      setPerintah(null);
    }
    window.addEventListener("beforeinstallprompt", simpanPerintah);
    window.addEventListener("appinstalled", tandaiPasang);
    return () => {
      window.removeEventListener("beforeinstallprompt", simpanPerintah);
      window.removeEventListener("appinstalled", tandaiPasang);
    };
  }, []);

  if (terpasang) return null;

  const ios =
    typeof window !== "undefined" &&
    (/iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1));

  async function unduh() {
    if (perintah) {
      await perintah.prompt();
      const { outcome } = await perintah.userChoice;
      if (outcome === "accepted") setTerpasang(true);
      else setPerintah(null);
      return;
    }
    setPanduan(ios ? "ios" : "manual");
  }

  return (
    <div>
      <div className="flex flex-col gap-2 px-1 pb-1">
        <p className="text-sm text-neutral-500">
          Pasang Laporaja ke HP agar dibuka seperti aplikasi.
        </p>
        <span className="flex justify-end">
          <Button onClick={() => void unduh()} className="rounded-full" aria-label="Unduh aplikasi Laporaja">
            <Download aria-hidden="true" />
            Unduh Aplikasi
          </Button>
        </span>
      </div>

      <Dialog
        open={panduan !== null}
        onClose={() => setPanduan(null)}
        title={panduan === "ios" ? "Pasang di iPhone/iPad" : "Pasang aplikasi"}
      >
        {panduan === "ios" ? (
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>Ketuk tombol <strong>Bagikan</strong> di Safari (kotak + panah).</li>
            <li>Pilih <strong>Tambah ke Layar Utama</strong>.</li>
            <li>Ketuk <strong>Tambah</strong> — ikon Laporaja muncul di HP.</li>
          </ol>
        ) : (
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>Buka menu browser (titik tiga / Bagikan).</li>
            <li>Pilih <strong>Install / Tambah ke Layar Utama</strong>.</li>
            <li>Ikuti konfirmasi yang muncul.</li>
          </ol>
        )}
      </Dialog>
    </div>
  );
}
