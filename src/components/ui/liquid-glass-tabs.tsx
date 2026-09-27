"use client";

import { useEffect, useRef } from "react";

import {
  DEFAULT_LIQUID_GLASS_CONFIG,
  DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  applyLiquidGlass,
  type LiquidGlassHandle,
} from "@/lib/liquid-glass";
import "./liquid-glass-tabs.css";

export interface LiquidGlassTab {
  key: string;
  label: string;
}

const DRAG_THRESHOLD = 6;
const OVERSHOOT = 22;
// Acuan tunggal sinkronisasi (samakan dengan --lgt-slide-ms / 0.32s di CSS):
// slide pill 320ms, susut mulai 150ms, semua efek bg selesai bareng ~360-430ms.
const SLIDE_MS = 320;
const LAND_DELAY = 150;
const END_MS = SLIDE_MS + 40;
const TRACK_MS = SLIDE_MS + 80;

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
    let finishTimer: number | undefined;
    let snapTimer: number | undefined;
    let landTimer: number | undefined;
    let raf = 0;
    let glassRebuildQueued = false;
    let indicatorGlass: LiquidGlassHandle | null = null;

    const containerGlass = applyLiquidGlass(
      nav,
      () => DEFAULT_LIQUID_GLASS_CONFIG
    );

    function ensureIndicatorGlass() {
      if (indicatorGlass) {
        indicatorGlass.rebuild();
        return;
      }
      indicatorGlass = applyLiquidGlass(
        indicator!,
        () => ({
          ...DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
          // Kaca netral saat geser: tanpa tint biru, specular lembut.
          glassThickness: 24,
          blur: 1,
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

    // Refraksi beneran pada teks: label yang sedang tertutup ujung pill
    // (overlap > 4px) diberi filter displacement SVG, bukan blur palsu.
    function updateTextRefraction() {
      const interacting =
        indicator!.classList.contains("lgt-interacting") ||
        indicator!.classList.contains("lgt-landing") ||
        indicator!.classList.contains("lgt-snapping");
      if (!interacting) {
        clearTextRefraction();
        return;
      }
      const ind = indicator!.getBoundingClientRect();
      items.forEach((btn, i) => {
        const label = labelRefs.current[i];
        if (!label) return;
        const r = btn.getBoundingClientRect();
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
          window.clearTimeout(snapTimer);
          indicator!.classList.add("lgt-snapping");
          ensureIndicatorGlass();
          snapToIndex(active, true);
          pumpGlass();
          trackDuring(TRACK_MS);
          snapTimer = window.setTimeout(() => {
            indicator!.classList.remove("lgt-snapping");
            indicator!.classList.remove("lgt-landing");
            if (!indicator!.classList.contains("lgt-interacting")) {
              window.cancelAnimationFrame(raf);
              indicatorGlass?.destroy();
              indicatorGlass = null;
              clearTextRefraction();
            }
          }, END_MS);
          return;
        }
        snapToIndex(active, animate);
        if (animate) pumpGlass();
      },
    };

    function setGlow(clientX: number, clientY: number, alpha: number) {
      const nr = innerRect();
      const lx = toLocalX(clientX);
      inner!.style.setProperty("--gx", `${lx}px`);
      inner!.style.setProperty("--gy", `${clientY - nr.top}px`);
      inner!.style.setProperty("--ga", String(alpha));
    }

    function queueGlassRebuild() {
      if (glassRebuildQueued) return;
      glassRebuildQueued = true;
      requestAnimationFrame(() => {
        glassRebuildQueued = false;
        indicatorGlass?.rebuild();
      });
    }

    function pumpGlass() {
      queueGlassRebuild();
      updateTextRefraction();
    }

    // Hidupkan rebuild + refraksi teks tiap frame selama animasi geser,
    // karena backdrop-filter:url() tidak live-update saat left/width berubah.
    function trackDuring(ms = 400) {
      window.cancelAnimationFrame(raf);
      const t0 = performance.now();
      const tick = (t: number) => {
        pumpGlass();
        if (t - t0 < ms) {
          raf = window.requestAnimationFrame(tick);
        } else {
          updateTextRefraction();
        }
      };
      raf = window.requestAnimationFrame(tick);
    }

    function beginInteraction(clientX: number, clientY: number) {
      window.clearTimeout(finishTimer);
      window.clearTimeout(snapTimer);
      window.clearTimeout(landTimer);
      indicator!.classList.remove("lgt-landing");
      indicator!.classList.add("lgt-interacting");
      nav!.classList.add("lgt-engaged");
      setGlow(clientX, clientY, 0.24);
      ensureIndicatorGlass();
      pumpGlass();
      trackDuring(600);
    }

    // Susutkan pill saat mendekati target (overlap dengan sisa slide),
    // bukan setelah slide selesai — hilangkan jeda diam. Glow + nav-scale
    // ikut dipudarkan di titik yang sama agar selesai bareng dengan pill.
    function startLanding(delay = LAND_DELAY) {
      window.clearTimeout(landTimer);
      landTimer = window.setTimeout(() => {
        if (indicator!.classList.contains("lgt-interacting")) {
          indicator!.classList.remove("lgt-interacting");
          indicator!.classList.add("lgt-landing");
          nav!.classList.remove("lgt-engaged");
          inner!.style.setProperty("--ga", "0");
          pumpGlass();
        }
      }, delay);
    }

    function endInteraction() {
      window.clearTimeout(finishTimer);
      finishTimer = window.setTimeout(() => {
        indicator!.classList.remove("lgt-interacting");
        indicator!.classList.remove("lgt-landing");
        indicator!.classList.remove("lgt-snapping");
        inner!.classList.remove("lgt-dragging");
        nav!.classList.remove("lgt-engaged");
        inner!.style.setProperty("--ga", "0");
        window.cancelAnimationFrame(raf);
        window.clearTimeout(landTimer);
        indicatorGlass?.destroy();
        indicatorGlass = null;
        clearTextRefraction();
      }, END_MS);
    }

    function dragMove(clientX: number) {
      const localX = toLocalX(clientX);
      const w = pressWidth || itemMetrics(active).width;
      let left = localX - w / 2;
      left = clamp(left, -OVERSHOOT, inner!.clientWidth - w + OVERSHOOT);
      indicator!.style.left = `${left}px`;
      indicator!.style.width = `${w}px`;
      targetIndex = nearestIndex(localX);
      pumpGlass();
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
      pumpGlass();
      trackDuring(TRACK_MS);
      // Mulai susut ±47% perjalanan slide (150/320ms) agar menyatu tanpa jeda.
      startLanding(LAND_DELAY);
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
      pumpGlass();
      trackDuring(TRACK_MS);
      startLanding(LAND_DELAY);
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
      clearTextRefraction();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      clearPointerHandlers();
      window.clearTimeout(finishTimer);
      window.clearTimeout(snapTimer);
      window.clearTimeout(landTimer);
      window.cancelAnimationFrame(raf);
      clearTextRefraction();
      indicatorGlass?.destroy();
      containerGlass.destroy();
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
            ? { gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }
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
                in="SourceGraphic"
                in2="n"
                scale="7"
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
              <span
                ref={(el) => {
                  labelRefs.current[idx] = el;
                }}
                className="lgt-label"
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
