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
// Acuan tunggal sinkronisasi (samakan --lgt-slide/--lgt-settle di CSS):
// lepas (t=0): slide + susut 0→SLIDE_MS. Settle di SETTLE_MS mulai
// cross-fade transparan→abu + kaca + teks → SEMUA (geser, susut, abu,
// kaca, teks, nav) kelar pas SLIDE_MS. Durasi fade abu tidak tetap:
// setFadeMs() = endDelay − settleDelay (lihat endInteraction).
const SLIDE_MS = 720;
const SETTLE_MS = 360;
const END_MS = SLIDE_MS;
// Durasi minimum pengecilan (transform) saat lepas, kalau sisa waktu geser
// sudah hampir habis — supaya tidak terasa "patah" instan.
const LAND_MIN_MS = 240;
// Jeda cabut node kaca setelah fade-out selesai (jangan pop).
const GLASS_FADE_MS = 400;
const TEXT_SCALE_MAX = 7;
// Kekuatan refraksi teks (feDisplacementMap scale) — dianimasikan 0↔MAX
// karena filter url()↔none tidak bisa di-transition (selalu instant).
// Lebar zona TEPI pill yang membiaskan teks: hanya pita di sekitar border
// pill yang warp, tengah pill bersih (persis refraksi kaca asli).
const EDGE_W = 14;
const EDGE_FEATHER = 6;

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
  showCounts = true,
}: {
  tabs: LiquidGlassTab[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel: string;
  showCounts?: boolean;
}) {
  const navRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const glassRefs = useRef<(HTMLSpanElement | null)[]>([]);
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
    // Waktu pointerdown — acuan agar semua efek (geser, membesar, mengecil,
    // fade) selesai bareng di klik+SLIDE_MS.
    let pressTime = 0;
    // Klik cepat: tahan fase membesar sampai fase settle baru mengecil.
    let fastShrink = false;
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

    // Sembunyikan semua salinan refraksi (teks normal selalu terlihat).
    function clearTextRefraction() {
      for (const glass of glassRefs.current) {
        if (glass) glass.style.visibility = "hidden";
      }
      lastGlassClip = lastGlassClip.map(() => null);
    }

    let cachedRects: { left: number; right: number; top: number; bottom: number }[] = [];
    let cachedLabelRects: { left: number; right: number; top: number; bottom: number; width: number; height: number }[] = [];
    let lastGlassClip: (string | null)[] = [];

    function cacheItemRects() {
      cachedRects = items.map((btn) => {
        const r = btn.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      cachedLabelRects = labelRefs.current.map((el) => {
        if (!el) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      });
    }

    // Refraksi TEPI teks: salinan refraksi (lgt-label-glass) hanya
    // ditampilkan via mask tepat di pita ±14px sekitar border pill —
    // tengah pill bersih persis refraksi kaca asli. Kekuatan warp memudar
    // via animasi scale global (bukan on/off class yang instant).
    function updateTextRefraction() {
      const glassOn =
        indicator!.classList.contains("lgt-interacting") ||
        indicator!.classList.contains("lgt-landing") ||
        indicator!.classList.contains("lgt-snapping") ||
        indicator!.classList.contains("lgt-settling");
      if (!glassOn) {
        clearTextRefraction();
        return;
      }
      const ind = indicator!.getBoundingClientRect();
      const useCache =
        cachedRects.length === items.length && cachedLabelRects.length === items.length;
      const f = EDGE_FEATHER;
      const hideGlass = (i: number, glass: HTMLSpanElement) => {
        if (lastGlassClip[i] !== null) {
          glass.style.visibility = "hidden";
          lastGlassClip[i] = null;
        }
      };
      items.forEach((btn, i) => {
        const glass = glassRefs.current[i];
        if (!glass) return;
        const lr = useCache
          ? cachedLabelRects[i]
          : (() => {
              const b = (labelRefs.current[i] ?? btn).getBoundingClientRect();
              return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
            })();
        if (lr.width <= 0 || lr.height <= 0) {
          hideGlass(i, glass);
          return;
        }
        // Tepi pill dalam koordinat lokal label.
        const xL = ind.left - lr.left;
        const xR = ind.right - lr.left;
        const parts: string[] = [];
        // Pita kiri: [xL, xL+EDGE] ∩ label.
        const a = Math.max(0, xL);
        const b = Math.min(lr.width, xL + EDGE_W);
        if (b - a > 1) {
          parts.push(
            `transparent ${a.toFixed(1)}px`,
            `black ${Math.min(a + f, b).toFixed(1)}px`,
            `black ${Math.max(b - f, a).toFixed(1)}px`,
            `transparent ${b.toFixed(1)}px`
          );
        }
        // Pita kanan: [xR-EDGE, xR] ∩ label.
        const c = Math.max(0, xR - EDGE_W);
        const d = Math.min(lr.width, xR);
        if (d - c > 1) {
          parts.push(
            `transparent ${c.toFixed(1)}px`,
            `black ${Math.min(c + f, d).toFixed(1)}px`,
            `black ${Math.max(d - f, c).toFixed(1)}px`,
            `transparent ${d.toFixed(1)}px`
          );
        }
        if (parts.length === 0) {
          hideGlass(i, glass);
          return;
        }
        const mask = `linear-gradient(90deg, ${parts.join(", ")})`;
        if (lastGlassClip[i] !== mask) {
          // Bersihkan sisa clip versi lama (HMR) — sekarang murni mask.
          glass.style.clipPath = "none";
          glass.style.setProperty("mask-image", mask);
          glass.style.setProperty("-webkit-mask-image", mask);
          glass.style.visibility = "visible";
          lastGlassClip[i] = mask;
        } else if (glass.style.visibility !== "visible") {
          glass.style.visibility = "visible";
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
        if (
          animate &&
          pointerId === null &&
          !indicator!.classList.contains("lgt-interacting") &&
          // Sesudah lepas pointer, urutan landing sudah dijadwalkan finishSelection
          // (timing relatif klik) — jangan di-reset ke durasi default di sini.
          !indicator!.classList.contains("lgt-landing")
        ) {
          window.clearTimeout(teardownTimer);
          // Selipkan node kaca dulu saat masih opacity 0, kunci, baru
          // pasang kelas agar fade-in terlihat (bukan pop statis).
          ensureIndicatorGlass();
          void indicator!.offsetWidth;
          indicator!.classList.add("lgt-snapping");
          snapToIndex(active, true);
          // Filter dibangun SEKALI (kaca stabil selama slide → fade mulus).
          indicatorGlass?.rebuild();
          trackRefraction();
          endInteraction();
          return;
        }
        snapToIndex(active, animate);
        if (animate) updateTextRefraction();
      },
    };

    // Loop per-frame untuk refraksi teks + geometri kaca.
    // rebuild() di sini aman dipanggil tiap frame: liquid-glass kini memutasi
    // node filter yang SAMA (ID tetap, update in-place) alih-alih bikin filter
    // baru, jadi lebar kaca ikut pil abu secara dinamis tanpa flicker.
    // Loop jalan sampai finalize/cancel.
    function trackRefraction() {
      window.cancelAnimationFrame(raf);
      cacheItemRects();
      const tick = () => {
        indicatorGlass?.rebuild();
        updateTextRefraction();
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    }

    function stopTracking() {
      window.cancelAnimationFrame(raf);
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

    // Set durasi transisi transform (grow/shrink) via CSS var. Dipakai untuk
    // memotong pengecilan agar kelar bareng akhir geser.
    function setLandMs(ms: number) {
      nav!.style.setProperty("--lgt-land-ms", `${ms}ms`);
    }

    // Set durasi fade transparan → abu. Dipakai agar cross-fade ini
    // berlangsung SAMBIL slide/susut jalan (bukan setelahnya) dan berhenti
    // tepat di frame terakhir animasi.
    let fadeMs = SETTLE_MS;
    function setFadeMs(ms: number) {
      fadeMs = Math.max(0, ms);
      nav!.style.setProperty("--lgt-fade", `${fadeMs}ms`);
    }

    function beginInteraction() {
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      // Grow & shrink dikunci SAMA = SETTLE_MS (50% dari SLIDE_MS):
      // grow 0→360ms, shrink 360→720ms. Sebelumnya grow memakai SLIDE_MS
      // penuh sementara shrink cuma SLIDE_MS − SETTLE_MS, jadi susut
      // terasa jauh lebih cepat dari membesar. Nilai ini juga sama dengan
      // setLandMs() di beginSettle (shrink klik cepat) → balance 50/50.
      setLandMs(SETTLE_MS);
      setFadeMs(SETTLE_MS);
      fastShrink = false;
      // Selipkan node kaca dulu saat masih opacity 0, kunci, baru pasang
      // kelas agar fade-in abu → kaca terlihat (bukan pop statis).
      ensureIndicatorGlass();
      void indicator!.offsetWidth;
      indicator!.classList.remove("lgt-landing");
      indicator!.classList.remove("lgt-settling");
      indicator!.classList.add("lgt-interacting");
      nav!.classList.add("lgt-engaged");
      cacheItemRects();
      updateTextRefraction();
      trackRefraction();
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
        if (fastShrink) {
          // Klik cepat: cukup sekarang fase membesar ditahan — kunci durasi
          // susut lalu lepas lgt-interacting (+ cangkang) supaya baru mengecil
          // sekarang, sehingga selesai tepat di klik+SLIDE_MS.
          fastShrink = false;
          setLandMs(SLIDE_MS - SETTLE_MS);
          indicator!.classList.remove("lgt-interacting");
          nav!.classList.remove("lgt-engaged");
        }
        indicator!.classList.add("lgt-settling");
        // Warp teks ikut durasi fade yang sama → semua efek mendarat
        // di frame yang sama, tidak ada sisa animasi setelahnya.
        animateTextScale(0, fadeMs);
        updateTextRefraction();
      }
    }

    function finalize() {
      // Scale warp sudah 0 (no-op visual) — lepas kelas lalu cabut node
      // kaca setelah fade selesai (jangan pop).
      fastShrink = false;
      indicator!.classList.remove("lgt-interacting");
      indicator!.classList.remove("lgt-landing");
      indicator!.classList.remove("lgt-snapping");
      indicator!.classList.remove("lgt-settling");
      inner!.classList.remove("lgt-dragging");
      nav!.classList.remove("lgt-engaged");
      stopTracking();
      window.cancelAnimationFrame(textRaf);
      setTextScale(0);
      clearTextRefraction();
      window.clearTimeout(teardownTimer);
      teardownTimer = window.setTimeout(() => {
        indicatorGlass?.destroy();
        indicatorGlass = null;
      }, GLASS_FADE_MS);
    }

    function endInteraction(
      settleDelay: number = SETTLE_MS,
      endDelay: number = END_MS
    ) {
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      // Fade transparan → abu mulai bareng settle dan harus selesai bareng
      // akhir animasi → durasinya = selisih settle ↔ end (bukan --lgt-settle
      // tetap, yang bisa berakhir melewati frame terakhir).
      setFadeMs(endDelay - settleDelay);
      settleTimer = window.setTimeout(beginSettle, settleDelay);
      endTimer = window.setTimeout(finalize, endDelay);
    }

    // Timing pelepasan (klik): klik cepat → fase membesar DITAHAN sampai
    // tengah slide, baru mengecil di fase settle agar selesai bareng akhir
    // geser (klik+SLIDE_MS). Hold lebih lambat → mengecil mulai saat lepas.
    // Drag: geser baru mulai saat lepas → durasi penuh.
    function releaseTiming() {
      if (dragMode) {
        return {
          fast: false,
          shrinkMs: SLIDE_MS,
          settleDelay: SETTLE_MS,
          endDelay: END_MS,
        };
      }
      const elapsed = Math.max(0, performance.now() - pressTime);
      if (elapsed < SETTLE_MS) {
        return {
          fast: true,
          shrinkMs: SLIDE_MS - SETTLE_MS,
          settleDelay: SETTLE_MS - elapsed,
          endDelay: SLIDE_MS - elapsed,
        };
      }
      const remain = clamp(SLIDE_MS - elapsed, 0, SLIDE_MS);
      const shrinkMs = Math.max(remain, LAND_MIN_MS);
      return {
        fast: false,
        shrinkMs,
        settleDelay: 0,
        endDelay: shrinkMs,
      };
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
      const timing = releaseTiming();
      fastShrink = timing.fast;
      // Tetapkan durasi pengecilan DULU (sebelum kelas transform berubah)
      // agar transisinya langsung memakai durasi yang dipotong.
      if (!timing.fast) setLandMs(timing.shrinkMs);
      const key = items[targetIndex]?.dataset.key;
      if (key) onChangeRef.current(key);
      // Indikator ikut animasi ke tab target walau state React belum update.
      active = targetIndex;
      snapToIndex(targetIndex, true);
      // Landing saat lepas. Untuk klik cepat, lgt-interacting DITAHAN sampai
      // fase settle agar fase membesar selesai dulu (mengikuti geser).
      if (indicator!.classList.contains("lgt-interacting")) {
        indicator!.classList.add("lgt-landing");
        if (!timing.fast) indicator!.classList.remove("lgt-interacting");
      }
      if (!timing.fast) nav!.classList.remove("lgt-engaged");
      // Filter dibangun SEKALI di posisi lepas (stabil selama slide → fade mulus).
      indicatorGlass?.rebuild();
      trackRefraction();
      // Settling + finalize dijadwalkan relatif klik agar semua kelar bareng.
      endInteraction(timing.settleDelay, timing.endDelay);
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
        dragMove(e.clientX);
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
      // Cancel: geser balik ke posisi semula = transisi baru, jadi pakai
      // durasi penuh (bukan sisa waktu).
      fastShrink = false;
      setLandMs(SLIDE_MS);
      snapToIndex(active, true);
      if (indicator!.classList.contains("lgt-interacting")) {
        indicator!.classList.remove("lgt-interacting");
        indicator!.classList.add("lgt-landing");
      }
      nav!.classList.remove("lgt-engaged");
      indicatorGlass?.rebuild();
      trackRefraction();
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
      pressTime = performance.now();
      beginInteraction();
      // Langsung animasi geser sejak tekan pertama (tanpa tunggu lepas):
      // pill meluncur ke tab yang ditekan, tetap bisa di-hold/drag.
      snapToIndex(idx, true);
      trackRefraction();
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
      stopTracking();
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
                {/* Salinan refraksi: hanya terlihat (clip-path) di bagian
                    teks yang tepat ketutup pill transparan. */}
                <span
                  ref={(el) => {
                    glassRefs.current[idx] = el;
                  }}
                  className="lgt-label lgt-label-glass"
                  aria-hidden="true"
                >
                  {tab.label}
                </span>
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
