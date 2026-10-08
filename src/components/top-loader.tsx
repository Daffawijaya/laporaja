"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import NProgress from "nprogress";
import NextTopLoader from "nextjs-toploader";

import { useStandalone } from "@/lib/standalone";

// Bilah progres di atas saat loading/perpindahan halaman (pola etamhub:
// NProgress manual + NextTopLoader), biru aksen aplikasi (#0071e3).
// Nonaktif di PWA standalone supaya pindah halaman terasa langsung.
export function TopLoader() {
  const pathname = usePathname();
  const standalone = useStandalone();

  // selesai saat route berubah
  useEffect(() => {
    if (standalone) return;
    NProgress.done();
  }, [pathname, standalone]);

  // saat refresh / pertama buka halaman
  useEffect(() => {
    if (standalone) return;
    NProgress.start();

    const timer = setTimeout(() => {
      NProgress.done();
    }, 500);

    return () => clearTimeout(timer);
  }, [standalone]);

  // klik link
  useEffect(() => {
    if (standalone) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");

      if (!link) return;

      const href = link.getAttribute("href");

      if (
        href &&
        href.startsWith("/") &&
        href !== window.location.pathname &&
        !link.hasAttribute("target")
      ) {
        NProgress.start();
      }
    };

    const handleBackForward = () => {
      NProgress.start();
    };

    document.addEventListener("click", handleClick);
    window.addEventListener("popstate", handleBackForward);

    return () => {
      document.removeEventListener("click", handleClick);
      window.removeEventListener("popstate", handleBackForward);
    };
  }, [standalone]);

  if (standalone) return null;

  return (
    <NextTopLoader
      color="#0071e3"
      initialPosition={0.08}
      crawlSpeed={300}
      height={3}
      crawl={true}
      showSpinner={false}
      easing="cubic-bezier(0.22, 1, 0.36, 1)"
      speed={600}
      shadow="0 0 10px #0071e3, 0 0 5px #0071e3"
    />
  );
}
