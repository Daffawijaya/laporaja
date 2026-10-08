"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import {
  DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  applyLiquidGlass,
  type LiquidGlassHandle,
} from "@/lib/liquid-glass";
import "./liquid-glass-sidebar.css";

export interface LiquidGlassSidebarItem {
  key: string;
  label: string;
  href: string;
  /** Ikon idle (belum aktif). */
  IdleIcon: React.ComponentType<{ className?: string }>;
  /** Ikon aktif. */
  ActiveIcon: React.ComponentType<{ className?: string }>;
  /** Badge angka di kanan (mis. notifikasi). */
  badge?: string;
  /** aria-current saat aktif (default "page"). */
  ariaCurrent?: "page" | "true";
}

// Mirror VERTIKAL 1:1 dari LiquidGlassTabs (liquid-glass-tabs.tsx):
// SELURUH logika & konstanta waktu disamakan 100%, hanya sumbu yang
// diputar (X→Y, kiri/lebar→atas/tinggi, pita refraksi kiri-kanan→atas-bawah).
// Bedanya dengan tab: item adalah Link navigasi (bukan state), jadi tidak
// ada onChange — perubahan value (pathname) dianimasikan lewat jalur snap
// seperti jalur keyboard/state pada tab.
const DRAG_THRESHOLD = 6;
const OVERSHOOT = 22;
// Acuan tunggal sinkronisasi (samakan --lgs-slide/--lgs-settle di CSS,
// nilainya SAMA dengan tab): lepas (t=0): slide + susut 0→SLIDE_MS. Settle
// di SETTLE_MS mulai cross-fade transparan→solid + kaca + teks → SEMUA
// kelar pas SLIDE_MS.
const SLIDE_MS = 720;
const SETTLE_MS = 360;
const END_MS = SLIDE_MS;
// Durasi minimum pengecilan (transform) saat lepas, kalau sisa waktu geser
// sudah hampir habis — supaya tidak terasa "patah" instan.
const LAND_MIN_MS = 240;
// Jeda cabut node kaca setelah fade-out selesai (jangan pop).
const GLASS_FADE_MS = 400;
// Warp teks dibuat kalem seperti tab filter: scale kecil, pita rim
// sempit, feather lebar.
const TEXT_SCALE_MAX = 1.5;
// Kekuatan refraksi teks (feDisplacementMap scale) — dianimasikan 0↔MAX
// karena filter url()↔none tidak bisa di-transition (selalu instant).
// Lebar zona TEPI pill yang membiaskan teks: hanya pita di sekitar border
// ATAS-BAWAH pill yang warp (mirror pita kiri-kanan pada tab), tengah pill
// bersih (persis refraksi kaca asli).
const EDGE_W = 9;
const EDGE_FEATHER = 9;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// Sidebar pill dengan liquid glass persis tab filter: kaca refraksi di
// pill indikator, indikator geser, glow + drag antar item (vertikal).
export function LiquidGlassSidebar({
  items,
  value,
  ariaLabel,
}: {
  items: LiquidGlassSidebarItem[];
  /** key item yang aktif (mis. dari pathname). */
  value: string;
  ariaLabel: string;
}) {
  const navRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const glassRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const textDispRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const apiRef = useRef<{ snap: (animate: boolean) => void } | null>(null);
  // Drag antar item lalu lepas di item lain = jangan navigasi (klik akibat
  // drag diserap di sini).
  const wasDragRef = useRef(false);

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === value)
  );

  useEffect(() => {
    const nav = navRef.current;
    const inner = innerRef.current;
    const indicator = indicatorRef.current;
    const anchors = itemRefs.current.filter(
      (el): el is HTMLAnchorElement => el !== null
    );
    if (!nav || !inner || !indicator || anchors.length === 0) return;

    let active = Math.max(
      0,
      anchors.findIndex((el) => el.dataset.active === "true")
    );
    let targetIndex = active;
    let pointerId: number | null = null;
    let pressX = 0;
    let pressY = 0;
    let dragMode = false;
    let pressHeight = 0;
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
    // Rect item di-cache saat lepas — item tidak bergerak selama slide,
    // jadi loop per-frame cukup baca rect indikator (tanpa layout thrash).

    function ensureIndicatorGlass() {
      if (indicatorGlass) {
        indicatorGlass.rebuild();
        return;
      }
      indicatorGlass = applyLiquidGlass(
        indicator!,
        () => ({
          ...DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
          // Config dinamis DIPERKECIL seperti tab filter: refraksi
          // tipis + kilau samar saja agar tidak merobek tampilan.
          glassThickness: 4 + 24 * strength,
          blur: 0,
          specularOpacity: 0.3 * strength,
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

    let cachedRects: { top: number; bottom: number; left: number; right: number }[] = [];
    let cachedLabelRects: { top: number; bottom: number; left: number; right: number; width: number; height: number }[] = [];
    let lastGlassClip: (string | null)[] = [];

    function cacheItemRects() {
      cachedRects = anchors.map((a) => {
        const r = a.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      });
      cachedLabelRects = labelRefs.current.map((el) => {
        if (!el) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      });
    }

    // Refraksi TEPI teks: salinan refraksi (lgs-label-glass) hanya
    // ditampilkan via mask tepat di pita ±14px sekitar border ATAS-BAWAH
    // pill — tengah pill bersih persis refraksi kaca asli. Kekuatan warp
    // memudar via animasi scale global (bukan on/off class yang instant).
    function updateTextRefraction() {
      const glassOn =
        indicator!.classList.contains("lgs-interacting") ||
        indicator!.classList.contains("lgs-landing") ||
        indicator!.classList.contains("lgs-snapping") ||
        indicator!.classList.contains("lgs-settling");
      if (!glassOn) {
        clearTextRefraction();
        return;
      }
      const ind = indicator!.getBoundingClientRect();
      const useCache =
        cachedRects.length === anchors.length && cachedLabelRects.length === anchors.length;
      const f = EDGE_FEATHER;
      const hideGlass = (i: number, glass: HTMLSpanElement) => {
        if (lastGlassClip[i] !== null) {
          glass.style.visibility = "hidden";
          lastGlassClip[i] = null;
        }
      };
      anchors.forEach((a, i) => {
        const glass = glassRefs.current[i];
        if (!glass) return;
        const lr = useCache
          ? cachedLabelRects[i]
          : (() => {
              const b = (labelRefs.current[i] ?? a).getBoundingClientRect();
              return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height };
            })();
        if (lr.width <= 0 || lr.height <= 0) {
          hideGlass(i, glass);
          return;
        }
        // Tepi pill dalam koordinat lokal label (sumbu Y).
        const yT = ind.top - lr.top;
        const yB = ind.bottom - lr.top;
        const parts: string[] = [];
        // Pita atas: [yT, yT+EDGE] ∩ label.
        const p1 = Math.max(0, yT);
        const q1 = Math.min(lr.height, yT + EDGE_W);
        if (q1 - p1 > 1) {
          parts.push(
            `transparent ${p1.toFixed(1)}px`,
            `black ${Math.min(p1 + f, q1).toFixed(1)}px`,
            `black ${Math.max(q1 - f, p1).toFixed(1)}px`,
            `transparent ${q1.toFixed(1)}px`
          );
        }
        // Pita bawah: [yB-EDGE, yB] ∩ label.
        const p2 = Math.max(0, yB - EDGE_W);
        const q2 = Math.min(lr.height, yB);
        if (q2 - p2 > 1) {
          parts.push(
            `transparent ${p2.toFixed(1)}px`,
            `black ${Math.min(p2 + f, q2).toFixed(1)}px`,
            `black ${Math.max(q2 - f, p2).toFixed(1)}px`,
            `transparent ${q2.toFixed(1)}px`
          );
        }
        if (parts.length === 0) {
          hideGlass(i, glass);
          return;
        }
        const mask = `linear-gradient(180deg, ${parts.join(", ")})`;
        if (lastGlassClip[i] !== mask) {
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

    function toLocalY(clientY: number) {
      const nr = innerRect();
      const sy = nr.height > 0 ? inner!.clientHeight / nr.height : 1;
      return (clientY - nr.top) * sy;
    }

    function itemMetrics(i: number) {
      const nr = innerRect();
      const ir = anchors[i].getBoundingClientRect();
      const sy = nr.height > 0 ? inner!.clientHeight / nr.height : 1;
      const top = (ir.top - nr.top) * sy;
      const height = ir.height * sy;
      return { top, height, center: top + height / 2 };
    }

    function nearestIndex(localY: number) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < anchors.length; i++) {
        const d = Math.abs(localY - itemMetrics(i).center);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }

    function setIndicator(top: number, height: number, animate: boolean) {
      if (!animate) {
        const old = indicator!.style.transition;
        indicator!.style.transition = "none";
        indicator!.style.top = `${top}px`;
        indicator!.style.height = `${height}px`;
        void indicator!.offsetHeight;
        indicator!.style.transition = old;
        return;
      }
      indicator!.style.top = `${top}px`;
      indicator!.style.height = `${height}px`;
    }

    function snapToIndex(i: number, animate: boolean) {
      if (i < 0 || i >= anchors.length) return;
      const m = itemMetrics(i);
      setIndicator(m.top, m.height, animate);
    }

    apiRef.current = {
      snap: (animate: boolean) => {
        active = Math.max(
          0,
          anchors.findIndex((el) => el.dataset.active === "true")
        );
        targetIndex = active;
        // Jalur navigasi/state: tidak ada pointerdown, jadi hidupkan kaca
        // sementara agar teks yang dilewati ujung pill ikut terrefraksi.
        if (
          animate &&
          pointerId === null &&
          !indicator!.classList.contains("lgs-interacting") &&
          // Sesudah lepas pointer, urutan landing sudah dijadwalkan finishSelection
          // (timing relatif klik) — jangan di-reset ke durasi default di sini.
          !indicator!.classList.contains("lgs-landing")
        ) {
          window.clearTimeout(teardownTimer);
          // Selipkan node kaca dulu saat masih opacity 0, kunci, baru
          // pasang kelas agar fade-in terlihat (bukan pop statis).
          ensureIndicatorGlass();
          void indicator!.offsetWidth;
          indicator!.classList.add("lgs-snapping");
          snapToIndex(active, true);
          // Filter dibangun SEKALI (kaca stabil selama slide → fade mulus).
          indicatorGlass?.rebuild();
          animateStrength(1, SLIDE_MS);
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
    // baru, jadi lebar kaca ikut pil solid secara dinamis tanpa flicker.
    // Loop jalan sampai finalize/cancel.
    function trackRefraction() {
      window.cancelAnimationFrame(raf);
      cacheItemRects();
      const tick = () => {
        // Strength berubah → paksa hitung ulang filter walau ukuran sama.
        if (strength !== builtStrength) {
          builtStrength = strength;
          indicatorGlass?.refresh();
        } else {
          indicatorGlass?.rebuild();
        }
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

    // Kekuatan refraksi kaca (0 = tak terlihat, 1 = penuh), dianimasikan
    // dengan smoothstep seperti warp teks agar bloom/dissolve-nya mulus.
    // getConfig di atas membaca nilai ini tiap rebuild.
    let strength = 0;
    let strengthRaf = 0;
    let builtStrength = -1;

    function animateStrength(target: number, ms: number) {
      window.cancelAnimationFrame(strengthRaf);
      const from = strength;
      if (Math.abs(target - from) < 0.01 || ms <= 0) {
        strength = target;
        return;
      }
      const t0 = performance.now();
      const tickS = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        const e = p * p * (3 - 2 * p);
        strength = from + (target - from) * e;
        if (p < 1) strengthRaf = window.requestAnimationFrame(tickS);
        else strength = target;
      };
      strengthRaf = window.requestAnimationFrame(tickS);
    }

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
      nav!.style.setProperty("--lgs-land-ms", `${ms}ms`);
    }

    // Set durasi fade transparan → solid. Dipakai agar cross-fade ini
    // berlangsung SAMBIL slide/susut jalan (bukan setelahnya) dan berhenti
    // tepat di frame terakhir animasi.
    let fadeMs = SETTLE_MS;
    function setFadeMs(ms: number) {
      fadeMs = Math.max(0, ms);
      nav!.style.setProperty("--lgs-fade", `${fadeMs}ms`);
    }

    function beginInteraction() {
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      // Grow & shrink dikunci SAMA = SETTLE_MS (50% dari SLIDE_MS):
      // grow 0→360ms, shrink 360→720ms — balance 50/50 seperti tab.
      setLandMs(SETTLE_MS);
      setFadeMs(SETTLE_MS);
      fastShrink = false;
      // Selipkan node kaca dulu saat masih opacity 0, kunci, baru pasang
      // kelas agar fade-in solid → kaca terlihat (bukan pop statis).
      ensureIndicatorGlass();
      void indicator!.offsetWidth;
      indicator!.classList.remove("lgs-landing");
      indicator!.classList.remove("lgs-settling");
      indicator!.classList.add("lgs-interacting");
      nav!.classList.add("lgs-engaged");
      animateStrength(1, SETTLE_MS);
      cacheItemRects();
      updateTextRefraction();
      trackRefraction();
      // Warp teks fade-in bareng kaca (bukan pop).
      animateTextScale(TEXT_SCALE_MAX, SLIDE_MS);
    }

    // Mulai fase settling: warp teks fade-out (scale→0) + fade kaca/solid,
    // TANPA menyentuh transform/top/height — susut + geser jalan terus.
    // Kelas teks dipertahankan sampai scale 0 agar tidak pop.
    function beginSettle() {
      if (
        indicator!.classList.contains("lgs-landing") ||
        indicator!.classList.contains("lgs-snapping")
      ) {
        if (fastShrink) {
          // Klik cepat: cukup sekarang fase membesar ditahan — kunci durasi
          // susut lalu lepas lgs-interacting (+ cangkang) supaya baru mengecil
          // sekarang, sehingga selesai tepat di klik+SLIDE_MS.
          fastShrink = false;
          setLandMs(SLIDE_MS - SETTLE_MS);
          indicator!.classList.remove("lgs-interacting");
          nav!.classList.remove("lgs-engaged");
        }
        indicator!.classList.add("lgs-settling");
        animateStrength(0, fadeMs);
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
      // Strength sudah 0 di sini (ramp selesai bareng akhir settling)
      // sehingga node kaca tak terlihat saat dicabut — tanpa pop.
      strength = 0;
      window.cancelAnimationFrame(strengthRaf);
      indicator!.classList.remove("lgs-interacting");
      indicator!.classList.remove("lgs-landing");
      indicator!.classList.remove("lgs-snapping");
      indicator!.classList.remove("lgs-settling");
      inner!.classList.remove("lgs-dragging");
      nav!.classList.remove("lgs-engaged");
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
      // Fade transparan → solid mulai bareng settle dan harus selesai bareng
      // akhir animasi → durasinya = selisih settle ↔ end (bukan --lgs-settle
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

    function dragMove(clientY: number) {
      const localY = toLocalY(clientY);
      const h = pressHeight || itemMetrics(active).height;
      let top = localY - h / 2;
      top = clamp(top, -OVERSHOOT, inner!.clientHeight - h + OVERSHOOT);
      indicator!.style.top = `${top}px`;
      indicator!.style.height = `${h}px`;
      targetIndex = nearestIndex(localY);
      updateTextRefraction();
    }

    function clearPointerHandlers() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    }

    function finishSelection() {
      inner!.classList.remove("lgs-dragging");
      const timing = releaseTiming();
      fastShrink = timing.fast;
      // Tetapkan durasi pengecilan DULU (sebelum kelas transform berubah)
      // agar transisinya langsung memakai durasi yang dipotong.
      if (!timing.fast) setLandMs(timing.shrinkMs);
      // Navigasi milik Link — di sini hanya animasi. Kalau ini hasil drag,
      // serap klik biar tidak ikut navigasi.
      wasDragRef.current = dragMode;
      // Indikator ikut animasi ke item target walau pathname (React) belum update.
      active = targetIndex;
      snapToIndex(targetIndex, true);
      // Landing saat lepas. Untuk klik cepat, lgs-interacting DITAHAN sampai
      // fase settle agar fase membesar selesai dulu (mengikuti geser).
      if (indicator!.classList.contains("lgs-interacting")) {
        indicator!.classList.add("lgs-landing");
        if (!timing.fast) indicator!.classList.remove("lgs-interacting");
      }
      if (!timing.fast) nav!.classList.remove("lgs-engaged");
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
        inner!.classList.add("lgs-dragging");
      }
      if (dragMode) {
        dragMove(e.clientY);
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
      inner!.classList.remove("lgs-dragging");
      // Cancel: geser balik ke posisi semula = transisi baru, jadi pakai
      // durasi penuh (bukan sisa waktu).
      fastShrink = false;
      setLandMs(SLIDE_MS);
      snapToIndex(active, true);
      if (indicator!.classList.contains("lgs-interacting")) {
        indicator!.classList.remove("lgs-interacting");
        indicator!.classList.add("lgs-landing");
      }
      nav!.classList.remove("lgs-engaged");
      indicatorGlass?.rebuild();
      trackRefraction();
      endInteraction();
      pointerId = null;
      dragMode = false;
    }

    function onPointerDown(idx: number, e: React.PointerEvent) {
      if (!e.isPrimary || e.button !== 0 || pointerId !== null) return;
      // JANGAN preventDefault: item adalah Link — klik harus tetap navigasi.
      pointerId = e.pointerId;
      dragMode = false;
      wasDragRef.current = false;
      targetIndex = idx;
      pressX = e.clientX;
      pressY = e.clientY;
      pressHeight = itemMetrics(idx).height;
      pressTime = performance.now();
      beginInteraction();
      // Langsung animasi geser sejak tekan pertama (tanpa tunggu lepas):
      // pill meluncur ke item yang ditekan, tetap bisa di-hold/drag.
      snapToIndex(idx, true);
      trackRefraction();
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    }

    (nav as unknown as { __lgsDown?: typeof onPointerDown }).__lgsDown =
      onPointerDown;

    snapToIndex(active, false);
    const onResize = () => {
      active = Math.max(
        0,
        anchors.findIndex((el) => el.dataset.active === "true")
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
      window.cancelAnimationFrame(strengthRaf);
      clearTextRefraction();
      indicatorGlass?.destroy();
      apiRef.current = null;
    };
  }, []);

  // Ikuti perubahan value dari luar (navigasi pathname) dengan animasi.
  useEffect(() => {
    apiRef.current?.snap(true);
  }, [activeIndex]);

  return (
    <nav ref={navRef} className="lgs-nav" aria-label={ariaLabel}>
      <div ref={innerRef} className="lgs-nav-inner" role="group" aria-label={ariaLabel}>
        <div ref={indicatorRef} className="lgs-indicator" aria-hidden="true" />
        {/* Filter refraksi khusus teks: dipakai saat ujung pill melewati label. */}
        <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <filter
              id="lgs-text-refract"
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
                result="warped"
              />
              {/* Blur mikro: salinan warp melebur seperti bayangan kaca,
                  bukan robekan tajam. */}
              <feGaussianBlur in="warped" stdDeviation="0.5" />
            </filter>
          </defs>
        </svg>
        {items.map((item, idx) => {
          const isActive = idx === activeIndex;
          const ItemIcon = isActive ? item.ActiveIcon : item.IdleIcon;
          return (
            <Link
              key={item.key}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              href={item.href}
              data-key={item.key}
              data-active={isActive ? "true" : "false"}
              aria-current={isActive ? (item.ariaCurrent ?? "page") : undefined}
              className={isActive ? "lgs-item lgs-active" : "lgs-item"}
              onPointerDown={(e) => {
                const fn = (
                  navRef.current as unknown as {
                    __lgsDown?: (i: number, ev: React.PointerEvent) => void;
                  }
                )?.__lgsDown;
                fn?.(idx, e);
              }}
              onClickCapture={(e) => {
                // Serap klik akibat drag antar item — klik biasa (termasuk
                // keyboard Enter/Space) tetap navigasi normal.
                if (wasDragRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  wasDragRef.current = false;
                }
              }}
            >
              <span className="lgs-icon">
                <ItemIcon aria-hidden="true" className="size-5 shrink-0" />
              </span>
              <span className="lgs-labelwrap">
                <span
                  ref={(el) => {
                    labelRefs.current[idx] = el;
                  }}
                  className="lgs-label"
                >
                  {item.label}
                </span>
                {/* Salinan refraksi: hanya terlihat (mask) di bagian
                    teks yang tepat ketutup pill transparan. */}
                <span
                  ref={(el) => {
                    glassRefs.current[idx] = el;
                  }}
                  className="lgs-label lgs-label-glass"
                  aria-hidden="true"
                >
                  {item.label}
                </span>
              </span>
              {item.badge ? (
                <span
                  aria-hidden="true"
                  className="flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-black px-1 text-[10px] font-semibold text-white dark:bg-white dark:text-black"
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
