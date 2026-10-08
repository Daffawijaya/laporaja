import { useSyncExternalStore } from "react";

// true bila aplikasi jalan sebagai PWA terinstal (standalone), bukan tab
// browser biasa. Mencakup iOS Safari (navigator.standalone).
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    // Abaikan: matchMedia tak tersedia.
  }
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribeStandalone(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

// Versi reaktif untuk komponen (snapshot server false, tanpa mismatch).
export function useStandalone(): boolean {
  return useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
}
