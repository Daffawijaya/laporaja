import type { MetadataRoute } from "next";

// Manifest PWA: nama, ikon, dan mode standalone agar bisa dipasang sebagai
// aplikasi di Android (prompt) maupun iOS (tambah manual).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LaporAja",
    short_name: "LaporAja",
    description: "Aplikasi pelaporan yang bersih dan mudah dipakai.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f2f1f7",
    icons: [
      { src: "/ikon/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/ikon/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/ikon/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/ikon/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
