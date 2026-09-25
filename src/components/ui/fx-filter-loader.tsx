"use client";

import { useEffect } from "react";

// Loader global FxFilterJS untuk seluruh aplikasi.
// Sumber lib: public/fxfilter/FxFilter.js (copas demo cssscript, MIT).
// Memakai data attribute yang sama dengan /lab-glass agar tidak dobel load.
const SRC = "/fxfilter/FxFilter.js";

export function FxFilterLoader() {
  useEffect(() => {
    const inject = () => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[data-fxfilter="${SRC}"]`
      );
      if (existing) return;
      const script = document.createElement("script");
      script.src = SRC;
      script.async = true;
      script.dataset.fxfilter = SRC;
      document.body.appendChild(script);
    };
    // Tunda sampai window load + 800ms agar hydration React selesai dulu.
    // FxFilter menyentuh DOM tombol, suntik terlalu awal merusak hydration.
    const schedule = () => {
      timer = window.setTimeout(inject, 800);
    };
    let timer: number | undefined;
    if (document.readyState === "complete") {
      schedule();
    } else {
      window.addEventListener("load", schedule, { once: true });
    }
    return () => {
      window.removeEventListener("load", schedule);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
