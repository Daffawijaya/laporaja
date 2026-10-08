"use client";

import { useEffect, useRef } from "react";

import {
  DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  applyLiquidGlass,
  type LiquidGlassHandle,
} from "@/lib/liquid-glass";
import "./liquid-glass-tabs.css";

export interface LiquidGlassTab {
  key: string;
  label: string;
  count?: number;
}

const DRAG_THRESHOLD = 6;
const OVERSHOOT = 22;
// Durasi morph disamakan bottom nav mobile (bukan sistem 720ms lama):
// tekan/pindah -> pill membesar + kaca transparan, geser, lalu mengecil
// + cross-fade kembali ke pill abu. Total 480ms.
// Alasan pengecualian MOTION 1: efek perpindahan khas pill ini.
const MORPH_MS = 480;
const SETTLE_AT = 260;
// Jeda cabut node kaca setelah fade-out selesai (jangan pop).
const GLASS_FADE_MS = 320;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// Tab bar pill: cangkang flat + indikator morph kaca seperti bottom nav
// mobile, plus drag antar tab. Pill selalu di bawah teks sehingga teks
// tetap tajam dan tidak perlu salinan refraksi.
export function LiquidGlassTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  showCounts = true,
}: {
  tabs: LiquidGlassTab[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel: string;
  showCounts?: boolean;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onChangeRef = useRef(onChange);
  const apiRef = useRef<{ snap: (animate: boolean) => void } | null>(null);
  const downRef = useRef<(index: number, e: React.PointerEvent) => void>(() => {});

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === value)
  );

  useEffect(() => {
    const inner = innerRef.current;
    const indicator = indicatorRef.current;
    const items = itemRefs.current.filter(
      (el): el is HTMLButtonElement => el !== null
    );
    if (!inner || !indicator || items.length === 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let active = Math.max(
      0,
      items.findIndex((el) => el.dataset.active === "true")
    );
    let targetIndex = active;
    let pointerId: number | null = null;
    let pressX = 0;
    let pressY = 0;
    let dragMode = false;
    let pressWidth = 0;
    let morphing = false;
    let settleTimer: number | undefined;
    let endTimer: number | undefined;
    let teardownTimer: number | undefined;
    let raf = 0;
    let glass: LiquidGlassHandle | null = null;
    // NOTE: pembungkus (nav) SENGAJA tanpa efek kaca — flat saja agar
    // tidak ada gelap di dalam border; kaca hanya di pill indikator.

    function ensureGlass() {
      if (glass) {
        glass.rebuild();
        return;
      }
      glass = applyLiquidGlass(
        indicator!,
        () => ({
          ...DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
          // Kaca netral saat geser: tanpa tint biru, tanpa kilau putih
          // (specular 0 agar tidak ada glow di tepi/dalam pill),
          // tanpa blur (refraksi tetap jalan).
          glassThickness: 24,
          blur: 0,
          specularOpacity: 0,
          specularSat: 0,
          tintColor: "255,255,255",
          tintOpacity: 0,
          balancedSpecular: true,
        })
      );
    }

    function innerRect() {
      return inner!.getBoundingClientRect();
    }

    function toLocalX(clientX: number) {
      const nr = innerRect();
      const sx = nr.width > 0 ? inner!.clientWidth / nr.width : 1;
      return (clientX - nr.left) * sx;
    }

    function itemMetrics(i: number) {
      const nr = innerRect();
      const ir = items[i].getBoundingClientRect();
      const sx = nr.width > 0 ? inner!.clientWidth / nr.width : 1;
      const left = (ir.left - nr.left) * sx;
      const width = ir.width * sx;
      return { left, width, center: left + width / 2 };
    }

    function nearestIndex(localX: number) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < items.length; i++) {
        const d = Math.abs(localX - itemMetrics(i).center);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }

    function place(i: number, animate: boolean) {
      if (i < 0 || i >= items.length) return;
      const m = itemMetrics(i);
      if (!animate) {
        const old = indicator!.style.transition;
        indicator!.style.transition = "none";
        indicator!.style.left = `${m.left}px`;
        indicator!.style.width = `${m.width}px`;
        void indicator!.offsetWidth;
        indicator!.style.transition = old;
        return;
      }
      indicator!.style.left = `${m.left}px`;
      indicator!.style.width = `${m.width}px`;
    }

    // Loop per-frame selama morph: geometri kaca mengikuti lebar pill
    // yang sedang dianimasikan. rebuild() no-op saat ukuran sama.
    function startLoop() {
      window.cancelAnimationFrame(raf);
      const tick = () => {
        glass?.rebuild();
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    }

    function stopLoop() {
      window.cancelAnimationFrame(raf);
    }

    function finish() {
      morphing = false;
      indicator!.classList.remove("lgt-morph");
      indicator!.classList.remove("lgt-settling");
      stopLoop();
      window.clearTimeout(teardownTimer);
      teardownTimer = window.setTimeout(() => {
        glass?.destroy();
        glass = null;
      }, GLASS_FADE_MS);
    }

    // Morph ke tab tujuan: membesar + transparan + kaca, geser, lalu
    // mengecil + cross-fade kembali ke pill abu.
    function morphTo(i: number) {
      if (i < 0 || i >= items.length) return;
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      ensureGlass();
      morphing = true;
      indicator!.classList.remove("lgt-settling");
      indicator!.classList.add("lgt-morph");
      glass?.rebuild();
      place(i, true);
      startLoop();
      settleTimer = window.setTimeout(() => {
        indicator!.classList.add("lgt-settling");
      }, SETTLE_AT);
      endTimer = window.setTimeout(finish, MORPH_MS);
    }

    apiRef.current = {
      snap: (animate: boolean) => {
        active = Math.max(
          0,
          items.findIndex((el) => el.dataset.active === "true")
        );
        targetIndex = active;
        // Jalur keyboard/state: tidak ada pointer, morph seperti biasa.
        if (animate && !reduced && pointerId === null && !morphing) {
          morphTo(active);
          return;
        }
        indicator!.classList.remove("lgt-morph");
        indicator!.classList.remove("lgt-settling");
        place(active, animate && !reduced);
      },
    };

    function dragMove(clientX: number) {
      const localX = toLocalX(clientX);
      const w = pressWidth || itemMetrics(active).width;
      const left = clamp(localX - w / 2, -OVERSHOOT, inner!.clientWidth - w + OVERSHOOT);
      indicator!.style.left = `${left}px`;
      indicator!.style.width = `${w}px`;
      targetIndex = nearestIndex(localX);
    }

    function clearPointerHandlers() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    }

    function finishSelection() {
      inner!.classList.remove("lgt-dragging");
      if (dragMode) {
        // Lepas drag: morph dari posisi seret ke tab target + pilih.
        active = targetIndex;
        const key = items[targetIndex]?.dataset.key;
        if (key) onChangeRef.current(key);
        if (reduced) {
          indicator!.classList.remove("lgt-morph");
          indicator!.classList.remove("lgt-settling");
          place(targetIndex, false);
        } else {
          morphTo(targetIndex);
        }
        return;
      }
      // Tap biasa: pilih saat lepas. Visual morph sudah jalan sejak tekan;
      // kalau morph keburu selesai (tahan lama), pulsa sekali lagi.
      active = targetIndex;
      const key = items[targetIndex]?.dataset.key;
      if (key) onChangeRef.current(key);
      if (!reduced && !morphing) morphTo(targetIndex);
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const dx = Math.abs(e.clientX - pressX);
      const dy = Math.abs(e.clientY - pressY);
      if (!dragMode && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        dragMode = true;
        inner!.classList.add("lgt-dragging");
      }
      if (dragMode) dragMove(e.clientX);
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      clearPointerHandlers();
      finishSelection();
      pointerId = null;
      dragMode = false;
    }

    function onPointerCancel(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      clearPointerHandlers();
      inner!.classList.remove("lgt-dragging");
      // Cancel: morph balik ke posisi semula.
      active = Math.max(
        0,
        items.findIndex((el) => el.dataset.active === "true")
      );
      targetIndex = active;
      if (reduced) {
        indicator!.classList.remove("lgt-morph");
        indicator!.classList.remove("lgt-settling");
        place(active, false);
      } else {
        morphTo(active);
      }
      pointerId = null;
      dragMode = false;
    }

    downRef.current = (idx: number, e: React.PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || pointerId !== null) return;
      e.preventDefault();
      pointerId = e.pointerId;
      dragMode = false;
      targetIndex = idx;
      pressX = e.clientX;
      pressY = e.clientY;
      pressWidth = itemMetrics(idx).width;
      // Langsung morph + meluncur ke tab yang ditekan sejak tekan pertama.
      if (reduced) {
        place(idx, false);
      } else {
        morphTo(idx);
      }
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    };

    place(active, false);
    const onResize = () => {
      active = Math.max(
        0,
        items.findIndex((el) => el.dataset.active === "true")
      );
      targetIndex = active;
      indicator!.classList.remove("lgt-morph");
      indicator!.classList.remove("lgt-settling");
      place(active, false);
      glass?.rebuild();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      clearPointerHandlers();
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      stopLoop();
      glass?.destroy();
      glass = null;
      apiRef.current = null;
    };
  }, [tabs.length]);

  // Ikuti perubahan value dari luar (klik keyboard / state) dengan animasi.
  useEffect(() => {
    apiRef.current?.snap(true);
  }, [activeIndex]);

  return (
    <nav className="lgt-nav" data-radius="999" aria-label={ariaLabel}>
      <div
        ref={innerRef}
        className="lgt-nav-inner"
        role="group"
        aria-label={ariaLabel}
        style={
          tabs.length !== 4
            ? { gridTemplateColumns: `repeat(${tabs.length}, auto)` }
            : undefined
        }
      >
        <div ref={indicatorRef} className="lgt-indicator" aria-hidden="true" />
        {tabs.map((tab, idx) => {
          const isActive = idx === activeIndex;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              data-key={tab.key}
              data-active={isActive ? "true" : "false"}
              aria-pressed={isActive}
              className={isActive ? "lgt-item lgt-active" : "lgt-item"}
              onPointerDown={(e) => downRef.current(idx, e)}
              onClick={(e) => {
                // Keyboard (Enter/Space) tidak memicu pointerdown.
                if (e.detail === 0) onChange(tab.key);
              }}
            >
              <span className="lgt-textwrap">
                <span className="lgt-label">{tab.label}</span>
                {showCounts && typeof tab.count === "number" ? (
                  <span className="lgt-badge" aria-label={`${tab.count}`}>
                    {tab.count}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
