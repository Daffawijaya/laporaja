"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

// Overlay GLOBAL tunggal (hitam 5%) untuk semua modal (Dialog)
// (GlassSelect/GlassMenu). Tiap lapisan acquire saat tampil, release saat
// hilang. Fade hanya di dua momen: 0→1 pemakai (fade in) dan kembali →0
// (fade out). Pindah dropdown→modal atau modal→modal: counter tidak pernah
// menyentuh 0, jadi TIDAK ada fade — overlay nyambung mulus tanpa kedip.
let holders = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((notify) => notify());
}

export function acquireOverlay(): () => void {
  holders += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    emit();
  };
}

export function useOverlay(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return acquireOverlay();
  }, [active]);
}

// Harus sinkron dengan `duration-200` pada overlay di bawah.
const FADE_MS = 200;

export function OverlayHost() {
  const [rendered, setRendered] = useState(holders > 0);
  const [visible, setVisible] = useState(holders > 0);
  const outerRaf = useRef(0);
  const innerRaf = useRef(0);
  const timer = useRef(0);

  useEffect(() => {
    const cancelPending = () => {
      window.cancelAnimationFrame(outerRaf.current);
      window.cancelAnimationFrame(innerRaf.current);
      window.clearTimeout(timer.current);
    };
    const update = () => {
      cancelPending();
      if (holders > 0) {
        setRendered(true);
        // Dua frame agar opacity-0 sempat ter-paint sebelum ke opacity-100.
        // Kalau dilepas lalu diambil lagi dalam tick yang sama (handoff
        // dropdown→modal / modal→modal), visible tidak sempat false di
        // layar — tidak ada kedip.
        outerRaf.current = window.requestAnimationFrame(() => {
          innerRaf.current = window.requestAnimationFrame(() => setVisible(true));
        });
      } else {
        // Fade out hanya saat overlay benar-benar sudah tidak dipakai.
        setVisible(false);
        timer.current = window.setTimeout(() => {
          if (holders === 0) setRendered(false);
        }, FADE_MS);
      }
    };
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
      cancelPending();
    };
  }, []);

  if (!rendered || typeof document === "undefined") return null;
  // z-40: di atas konten/header (z-30), di bawah panel modal & dropdown
  // (z-50) serta toast (z-60). Klik tertahan di sini sehingga tidak
  // click-through ke halaman; tiap dropdown sudah menutup sendiri via
  // listener pointerdown-nya.
  return createPortal(
    <div
      aria-hidden="true"
      className={cn(
        "fixed inset-0 z-40 bg-black/[0.05] transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0"
      )}
    />,
    document.body
  );
}
