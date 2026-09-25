"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";

// Copas persis demo cssscript liquid-glass-noise-fxfilter (FxFilterJS, MIT).
// Sumber HTML: https://www.cssscript.com/demo/liquid-glass-noise-fxfilter
// Efek jalan via --fx-filter, diproses public/fxfilter/FxFilter.js.
// Hanya untuk /lab-glass. Tidak dipakai di layar produksi.
const CARDS: { label: string; sub: string; fx: string }[] = [
  {
    label: "noise() + blur()",
    sub: "Raw",
    fx: "blur(20px) noise(.5, 1, .1)",
  },
  {
    label: "noise() + blur()",
    sub: "Dark",
    fx: "blur(20px) noise(.5, 1, .1) color-overlay(black,.3)",
  },
  {
    label: "noise() + blur()",
    sub: "Light",
    fx: "blur(20px) noise(.5, 1, .1) color-overlay(white,.3)",
  },
  {
    label: "liquid-glass() + blur()",
    sub: "Raw",
    fx: "blur(4px) liquid-glass(2, 10) saturate(1.25)",
  },
  {
    label: "liquid-glass() + blur()",
    sub: "Dark",
    fx: "blur(4px) liquid-glass(2, 10) saturate(1.25) color-overlay(black,.3) contrast(1.25)",
  },
  {
    label: "liquid-glass() + blur()",
    sub: "Light",
    fx: "blur(4px) liquid-glass(2, 10) saturate(1.25) color-overlay(white,.3) contrast(1.25)",
  },
  {
    label: "liquid-glass() + blur()",
    sub: "Chroma Raw",
    fx: "blur(4px) liquid-glass(2, 10, 1) saturate(1.25)",
  },
  {
    label: "liquid-glass() + blur()",
    sub: "Chroma Dark",
    fx: "blur(4px) liquid-glass(2, 10, 1) saturate(1.25) color-overlay(black,.3) contrast(1.25)",
  },
  {
    label: "liquid-glass() + blur()",
    sub: "Chroma Light",
    fx: "blur(4px) liquid-glass(2, 10, 1) saturate(1.25) color-overlay(white,.3) contrast(1.25)",
  },
];

function fxStyle(fx: string): CSSProperties {
  return { "--fx-filter": fx } as CSSProperties;
}

export default function LabGlassPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const SRC = "/fxfilter/FxFilter.js";
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-fxfilter="${SRC}"]`
    );
    if (existing) {
      const timer = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(timer);
    }
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.dataset.fxfilter = SRC;
    script.onload = () => setReady(true);
    document.body.appendChild(script);
  }, []);

  return (
    <div className="lab-fx">
      <div className="fx-demo-bg" aria-hidden />
      <main className="demo-container">
        <h1>FxFiltersJS Demos</h1>
        <p style={{ fontSize: "12px", opacity: 0.85 }}>
          Lab terisolasi, copas demo FxFilterJS.{" "}
          <Link href="/login" style={{ textDecoration: "underline" }}>
            Kembali ke login
          </Link>{" "}
          <span aria-hidden>·</span>{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ textDecoration: "underline" }}
          >
            Muat ulang efek
          </button>{" "}
          {!ready && <span>(memuat FxFilter...)</span>}
        </p>
        <p className="subtitle">
          Use FxFilterJS to apply advanced visual effects like liquid glass
          and noise with simple CSS custom properties.
        </p>
        <div className="filter-grid">
          {CARDS.map((card) => (
            <div
              key={`${card.label} ${card.sub}`}
              className="glass-card"
              style={fxStyle(card.fx)}
            >
              <span>
                {card.label}
                <br />
                <small>{card.sub}</small>
              </span>
              <code>--fx-filter: {card.fx};</code>
            </div>
          ))}
        </div>
        <div className="info-box">
          9 gaya copas persis demo. Baris 1 noise plus blur (Raw, Dark,
          Light). Baris 2 liquid glass plus blur (Raw, Dark, Light). Baris 3
          liquid glass plus chromatic aberration (Chroma Raw, Dark, Light).
        </div>
      </main>
    </div>
  );
}
