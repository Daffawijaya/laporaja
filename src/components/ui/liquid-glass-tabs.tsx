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
// Acuan tunggal sinkronisasi (samakan dengan --lgt-slide-ms / 0.48s di CSS):
// lepas (t=0): slide + susut 0→480. Settle di 240 mulai fade abu/kaca/teks
// (0.24s) → SEMUA (geser, susut, abu, kaca, teks, nav, glow) kelar pas 480ms.
const SLIDE_MS = 480;
const SETTLE_MS = 240;
const END_MS = SLIDE_MS;
const TRACK_MS = SLIDE_MS + 40;
// Jeda cabut node kaca setelah fade-out selesai (jangan pop).
const GLASS_FADE_MS = 250;
const TEXT_SCALE_MAX = 7;
// Kekuatan refraksi teks (feDisplacementMap scale) — dianimasikan 0↔MAX
// karena filter url()↔none tidak bisa di-transition (selalu instant).

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// Tab bar pill dengan liquid glass persis navbar atas /lab-glass2:
// kaca refraksi di kontainer, indikator geser, glow + drag antar tab.
export function LiquidGlassTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: LiquidGlassTab[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel: string;
}) {
  const navRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const textDispRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const onChangeRef = useRef(onChange);
  const apiRef = useRef<{ snap: (animate: boolean) => void } | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === value)
  );

  useEffect(() => {
    const nav = navRef.current;
    const inner = innerRef.current;
    const indicator = indicatorRef.current;
    const items = itemRefs.current.filter(
      (el): el is HTMLButtonElement => el !== null
    );
    if (!nav || !inner || !indicator || items.length === 0) return;

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
    let settleTimer: number | undefined;
    let endTimer: number | undefined;
    let teardownTimer: number | undefined;
    let raf = 0;
    let indicatorGlass: LiquidGlassHandle | null = null;
    // Rect tombol di-cache saat lepas — tombol tidak bergerak selama slide,
    // jadi loop per-frame cukup baca rect indikator (tanpa layout thrash).
    // NOTE: pembungkus (nav) SENGAJA tanpa efek kaca — flat putih 50% saja
    // agar tidak ada gelap di dalam border; kaca hanya di pill indikator.

    function ensureIndicatorGlass() {
      if (indicatorGlass) {
        indicatorGlass.rebuild();
        return;
      }
      indicatorGlass = applyLiquidGlass(
        indicator!,
        () => ({
          ...DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
          // Kaca netral saat geser: tanpa tint biru, specular lembut,
          // tanpa blur (refraksi + specular tetap jalan).
          glassThickness: 24,
          blur: 0,
          specularOpacity: 0.35,
          specularSat: 0,
          tintColor: "255,255,255",
          tintOpacity: 0,
          balancedSpecular: true,
        })
      );
    }

    function clearTextRefraction() {
      for (const label of labelRefs.current) {
        label?.classList.remove("lgt-under-glass");
      }
    }

    let cachedRects: { left: number; right: number; top: number; bottom: number }[] = [];

    function cacheItemRects() {
      cachedRects = items.map((btn) => {
        const r = btn.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
    }

    // Refraksi beneran pada teks: label yang sedang tertutup ujung pill
    // (overlap > 4px) diberi filter displacement SVG. Selama settling
    // DIBEKUKAN (tidak tambah/hapus) — warp memudar via animasi scale.
    function updateTextRefraction() {
      if (indicator!.classList.contains("lgt-settling")) return;
      const glassOn =
        indicator!.classList.contains("lgt-interacting") ||
        indicator!.classList.contains("lgt-landing") ||
        indicator!.classList.contains("lgt-snapping");
      if (!glassOn) {
        clearTextRefraction();
        return;
      }
      const ind = indicator!.getBoundingClientRect();
      const rects = cachedRects.length === items.length ? cachedRects : null;
      items.forEach((btn, i) => {
        const label = labelRefs.current[i];
        if (!label) return;
        const r = rects
          ? rects[i]
          : (() => {
              const b = btn.getBoundingClientRect();
              return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
            })();
        const overlapX = Math.min(ind.right, r.right) - Math.max(ind.left, r.left);
        const overlapY =
          Math.min(ind.bottom, r.bottom) - Math.max(ind.top, r.top);
        if (overlapX > 4 && overlapY > 4) {
          label.classList.add("lgt-under-glass");
        } else {
          label.classList.remove("lgt-under-glass");
        }
      });
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

    function setIndicator(left: number, width: number, animate: boolean) {
      if (!animate) {
        const old = indicator!.style.transition;
        indicator!.style.transition = "none";
        indicator!.style.left = `${left}px`;
        indicator!.style.width = `${width}px`;
        void indicator!.offsetWidth;
        indicator!.style.transition = old;
        return;
      }
      indicator!.style.left = `${left}px`;
      indicator!.style.width = `${width}px`;
    }

    function snapToIndex(i: number, animate: boolean) {
      if (i < 0 || i >= items.length) return;
      const m = itemMetrics(i);
      setIndicator(m.left, m.width, animate);
    }

    apiRef.current = {
      snap: (animate: boolean) => {
        active = Math.max(
          0,
          items.findIndex((el) => el.dataset.active === "true")
        );
        targetIndex = active;
        // Jalur keyboard/state: tidak ada pointerdown, jadi hidupkan kaca
        // sementara agar teks yang dilewati ujung pill ikut terrefraksi.
        if (animate && pointerId === null && !indicator!.classList.contains("lgt-interacting")) {
          window.clearTimeout(teardownTimer);
          // Selipkan node kaca dulu saat masih opacity 0, kunci, baru
          // pasang kelas agar fade-in terlihat (bukan pop statis).
          ensureIndicatorGlass();
          void indicator!.offsetWidth;
          indicator!.classList.add("lgt-snapping");
          snapToIndex(active, true);
          // Filter dibangun SEKALI (kaca stabil selama slide → fade mulus).
          indicatorGlass?.rebuild();
          animateTextScale(TEXT_SCALE_MAX, SLIDE_MS);
          trackRefraction(TRACK_MS);
          endInteraction();
          return;
        }
        snapToIndex(active, animate);
        if (animate) updateTextRefraction();
      },
    };

    function setGlow(clientX: number, clientY: number, alpha: number) {
      const nr = innerRect();
      const lx = toLocalX(clientX);
      inner!.style.setProperty("--gx", `${lx}px`);
      inner!.style.setProperty("--gy", `${clientY - nr.top}px`);
      inner!.style.setProperty("--ga", String(alpha));
    }

    // Loop per-frame HANYA untuk kelas refraksi teks (murah). Filter kaca
    // SENGAJA tidak di-rebuild di sini: tiap rebuild ganti ID filter +
    // render ulang backdrop → flicker yang mematahkan fade opacity CSS.
    // Backdrop-filter update live secara native saat elemen bergerak.
    function trackRefraction(ms = TRACK_MS) {
      window.cancelAnimationFrame(raf);
      cacheItemRects();
      const t0 = performance.now();
      const tick = (t: number) => {
        updateTextRefraction();
        if (t - t0 < ms) {
          raf = window.requestAnimationFrame(tick);
        } else {
          updateTextRefraction();
        }
      };
      raf = window.requestAnimationFrame(tick);
    }

    let textScale = 0;
    let textRaf = 0;

    function setTextScale(v: number) {
      textScale = v;
      textDispRef.current?.setAttribute("scale", String(v));
    }

    // Animasikan kekuatan warp teks 0↔MAX dengan smoothstep — fade kaca↔
    // non-kaca yang semulus mungkin (fade opacity lapisan saja tidak cukup
    // karena displacement on/off-nya sendiri instant).
    function animateTextScale(target: number, ms: number) {
      window.cancelAnimationFrame(textRaf);
      const from = textScale;
      if (Math.abs(target - from) < 0.01 || ms <= 0) {
        setTextScale(target);
        return;
      }
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        const e = p * p * (3 - 2 * p);
        setTextScale(from + (target - from) * e);
        if (p < 1) textRaf = window.requestAnimationFrame(tick);
      };
      textRaf = window.requestAnimationFrame(tick);
    }

    function beginInteraction(clientX: number, clientY: number) {
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      // Selipkan node kaca dulu saat masih opacity 0, kunci, baru pasang
      // kelas agar fade-in abu → kaca terlihat (bukan pop statis).
      ensureIndicatorGlass();
      void indicator!.offsetWidth;
      indicator!.classList.remove("lgt-landing");
      indicator!.classList.remove("lgt-settling");
      indicator!.classList.add("lgt-interacting");
      nav!.classList.add("lgt-engaged");
      setGlow(clientX, clientY, 0.24);
      cacheItemRects();
      updateTextRefraction();
      // Warp teks fade-in bareng kaca (bukan pop).
      animateTextScale(TEXT_SCALE_MAX, SLIDE_MS);
    }

    // Mulai fase settling: warp teks fade-out (scale→0) + fade abu/kaca,
    // TANPA menyentuh transform/left/width — susut + geser jalan terus.
    // Kelas teks dipertahankan sampai scale 0 agar tidak pop.
    function beginSettle() {
      if (
        indicator!.classList.contains("lgt-landing") ||
        indicator!.classList.contains("lgt-snapping")
      ) {
        indicator!.classList.add("lgt-settling");
        animateTextScale(0, SETTLE_MS);
        updateTextRefraction();
      }
    }

    function finalize() {
      // Scale warp sudah 0 (no-op visual) — lepas kelas lalu cabut node
      // kaca setelah fade selesai (jangan pop).
      indicator!.classList.remove("lgt-interacting");
      indicator!.classList.remove("lgt-landing");
      indicator!.classList.remove("lgt-snapping");
      indicator!.classList.remove("lgt-settling");
      inner!.classList.remove("lgt-dragging");
      nav!.classList.remove("lgt-engaged");
      inner!.style.setProperty("--ga", "0");
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(textRaf);
      setTextScale(0);
      clearTextRefraction();
      window.clearTimeout(teardownTimer);
      teardownTimer = window.setTimeout(() => {
        indicatorGlass?.destroy();
        indicatorGlass = null;
      }, GLASS_FADE_MS);
    }

    function endInteraction() {
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      settleTimer = window.setTimeout(beginSettle, SETTLE_MS);
      endTimer = window.setTimeout(finalize, END_MS);
    }

    function dragMove(clientX: number) {
      const localX = toLocalX(clientX);
      const w = pressWidth || itemMetrics(active).width;
      let left = localX - w / 2;
      left = clamp(left, -OVERSHOOT, inner!.clientWidth - w + OVERSHOOT);
      indicator!.style.left = `${left}px`;
      indicator!.style.width = `${w}px`;
      targetIndex = nearestIndex(localX);
      updateTextRefraction();
    }

    function clearPointerHandlers() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    }

    function finishSelection() {
      inner!.classList.remove("lgt-dragging");
      const key = items[targetIndex]?.dataset.key;
      if (key) onChangeRef.current(key);
      // Indikator ikut animasi ke tab target walau state React belum update.
      active = targetIndex;
      snapToIndex(targetIndex, true);
      // Langsung landing saat lepas (t=0): susut 0→480ms + lepas nav/glow
      // bareng awal slide — tanpa jeda, tanpa nunggu.
      if (indicator!.classList.contains("lgt-interacting")) {
        indicator!.classList.remove("lgt-interacting");
        indicator!.classList.add("lgt-landing");
      }
      nav!.classList.remove("lgt-engaged");
      inner!.style.setProperty("--ga", "0");
      // Filter dibangun SEKALI di posisi lepas (stabil selama slide → fade mulus).
      indicatorGlass?.rebuild();
      trackRefraction(TRACK_MS);
      // Settling di 240ms mulai fade abu/kaca/teks (0.24s) → kelar pas 480ms.
      endInteraction();
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const dx = Math.abs(e.clientX - pressX);
      const dy = Math.abs(e.clientY - pressY);
      if (!dragMode && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        dragMode = true;
        inner!.classList.add("lgt-dragging");
      }
      if (dragMode) {
        setGlow(e.clientX, e.clientY, 0.18);
        dragMove(e.clientX);
      } else {
        setGlow(e.clientX, e.clientY, 0.22);
      }
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
      snapToIndex(active, true);
      if (indicator!.classList.contains("lgt-interacting")) {
        indicator!.classList.remove("lgt-interacting");
        indicator!.classList.add("lgt-landing");
      }
      nav!.classList.remove("lgt-engaged");
      inner!.style.setProperty("--ga", "0");
      indicatorGlass?.rebuild();
      trackRefraction(TRACK_MS);
      endInteraction();
      pointerId = null;
      dragMode = false;
    }

    function onPointerDown(idx: number, e: React.PointerEvent) {
      if (!e.isPrimary || e.button !== 0 || pointerId !== null) return;
      e.preventDefault();
      pointerId = e.pointerId;
      dragMode = false;
      targetIndex = idx;
      pressX = e.clientX;
      pressY = e.clientY;
      pressWidth = itemMetrics(idx).width;
      beginInteraction(e.clientX, e.clientY);
      // Langsung animasi geser sejak tekan pertama (tanpa tunggu lepas):
      // pill meluncur ke tab yang ditekan, tetap bisa di-hold/drag.
      snapToIndex(idx, true);
      trackRefraction(TRACK_MS);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    }

    (nav as unknown as { __lgtDown?: typeof onPointerDown }).__lgtDown =
      onPointerDown;

    snapToIndex(active, false);
    const onResize = () => {
      active = Math.max(
        0,
        items.findIndex((el) => el.dataset.active === "true")
      );
      snapToIndex(active, false);
      // Layout berubah → bangun ulang filter sekali (bukan per-frame).
      indicatorGlass?.rebuild();
      clearTextRefraction();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      clearPointerHandlers();
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(textRaf);
      clearTextRefraction();
      indicatorGlass?.destroy();
      apiRef.current = null;
    };
  }, []);

  // Ikuti perubahan value dari luar (klik keyboard / state) dengan animasi.
  useEffect(() => {
    apiRef.current?.snap(true);
  }, [activeIndex]);

  return (
    <nav ref={navRef} className="lgt-nav" data-radius="999" aria-label={ariaLabel}>
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
        <div className="lgt-glow" aria-hidden="true" />
        <div ref={indicatorRef} className="lgt-indicator" aria-hidden="true" />
        {/* Filter refraksi khusus teks: dipakai saat ujung pill melewati label. */}
        <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <filter
              id="lgt-text-refract"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.02 0.09"
                numOctaves="2"
                seed="7"
                result="n"
              />
              <feDisplacementMap
                ref={textDispRef}
                in="SourceGraphic"
                in2="n"
                scale={0}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
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
              onPointerDown={(e) => {
                const fn = (
                  navRef.current as unknown as {
                    __lgtDown?: (i: number, ev: React.PointerEvent) => void;
                  }
                )?.__lgtDown;
                fn?.(idx, e);
              }}
              onClick={(e) => {
                // Keyboard (Enter/Space) tidak memicu pointerdown.
                if (e.detail === 0) onChange(tab.key);
              }}
            >
              <span className="lgt-textwrap">
                <span
                  ref={(el) => {
                    labelRefs.current[idx] = el;
                  }}
                  className="lgt-label"
                >
                  {tab.label}
                </span>
                {tab.count ? (
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
