"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  HiClipboardDocumentCheck,
  HiClipboardDocumentList,
  HiHome,
  HiOutlineClipboardDocumentCheck,
  HiOutlineClipboardDocumentList,
  HiOutlineHome,
  HiOutlineSquares2X2,
  HiOutlineUserCircle,
  HiOutlineUsers,
  HiSquares2X2,
  HiUserCircle,
  HiUsers,
} from "react-icons/hi2";

import {
  DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  applyLiquidGlass,
  type LiquidGlassHandle,
} from "@/lib/liquid-glass";
import type { Role } from "@/lib/supabase/database.types";
import "../ui/liquid-glass-tabs.css";
import "./mobile-glass-nav.css";

interface Slot {
  key: string;
  label: string;
  href: string;
  ActiveIcon: React.ComponentType<{ className?: string }>;
  IdleIcon: React.ComponentType<{ className?: string }>;
}

const USER_SLOTS: Slot[] = [
  { key: "beranda", label: "Beranda", href: "/", ActiveIcon: HiHome, IdleIcon: HiOutlineHome },
  {
    key: "laporan",
    label: "Laporan",
    href: "/laporan",
    ActiveIcon: HiClipboardDocumentList,
    IdleIcon: HiOutlineClipboardDocumentList,
  },
  { key: "anda", label: "Anda", href: "/anda", ActiveIcon: HiUserCircle, IdleIcon: HiOutlineUserCircle },
];

const ADMIN_SLOTS: Slot[] = [
  { key: "beranda", label: "Beranda", href: "/admin", ActiveIcon: HiHome, IdleIcon: HiOutlineHome },
  {
    key: "laporan",
    label: "Laporan",
    href: "/admin/laporan",
    ActiveIcon: HiClipboardDocumentList,
    IdleIcon: HiOutlineClipboardDocumentList,
  },
  { key: "users", label: "Pengguna", href: "/admin/users", ActiveIcon: HiUsers, IdleIcon: HiOutlineUsers },
  {
    key: "bidang",
    label: "Bidang",
    href: "/admin/bidang",
    ActiveIcon: HiSquares2X2,
    IdleIcon: HiOutlineSquares2X2,
  },
  {
    key: "tambahan",
    label: "Section",
    href: "/admin/section",
    ActiveIcon: HiClipboardDocumentCheck,
    IdleIcon: HiOutlineClipboardDocumentCheck,
  },
];

// Timing animasi SAMA PERSIS dengan filter tab (liquid-glass-tabs):
// tekan → pill membesar + meluncur, lepas → susut + settle, total 720ms.
const SLIDE_MS = 720;
const SETTLE_MS = 360;
const END_MS = SLIDE_MS;
const LAND_MIN_MS = 240;
const GLASS_FADE_MS = 400;
const TEXT_SCALE_MAX = 7;
const EDGE_W = 14;
const EDGE_FEATHER = 6;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// Navigasi bawah mobile: salinan persis sistem filter tab (kelas lgt-*,
// timing, kaca, refraksi teks). Beda hanya: Link navigasi (bukan
// button+onChange), slot ikon-di-atas-teks, tanpa drag (tap saja agar
// tidak melawan scroll vertikal), dan cangkang frost karena mengambang
// di atas konten. Hanya tampil di mobile.
export function MobileBottomnav({ role }: { role: Role }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const glassRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const textDispRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const apiRef = useRef<{ snap: (animate: boolean) => void } | null>(null);

  const slots = role === "superadmin" ? ADMIN_SLOTS : USER_SLOTS;

  function isActive(slot: Slot): boolean {
    if (slot.href === "/" || slot.href === "/admin") return pathname === slot.href;
    return pathname === slot.href || pathname.startsWith(`${slot.href}/`);
  }

  const activeIndex = Math.max(
    0,
    slots.findIndex((slot) => {
      if (slot.href === "/" || slot.href === "/admin") return pathname === slot.href;
      return pathname === slot.href || pathname.startsWith(`${slot.href}/`);
    })
  );

  useEffect(() => {
    const nav = navRef.current;
    const inner = innerRef.current;
    const indicator = indicatorRef.current;
    const items = itemRefs.current.filter(
      (el): el is HTMLAnchorElement => el !== null
    );
    if (!nav || !inner || !indicator || items.length === 0) return;

    let active = Math.max(
      0,
      items.findIndex((el) => el.dataset.active === "true")
    );
    let pointerId: number | null = null;
    let pressTime = 0;
    let fastShrink = false;
    let settleTimer: number | undefined;
    let endTimer: number | undefined;
    let teardownTimer: number | undefined;
    let raf = 0;
    let indicatorGlass: LiquidGlassHandle | null = null;

    function ensureIndicatorGlass() {
      if (indicatorGlass) {
        indicatorGlass.rebuild();
        return;
      }
      indicatorGlass = applyLiquidGlass(
        indicator!,
        () => ({
          ...DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
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
        const xL = ind.left - lr.left;
        const xR = ind.right - lr.left;
        const parts: string[] = [];
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

    function itemMetrics(i: number) {
      const nr = innerRect();
      const ir = items[i].getBoundingClientRect();
      const sx = nr.width > 0 ? inner!.clientWidth / nr.width : 1;
      const left = (ir.left - nr.left) * sx;
      const width = ir.width * sx;
      return { left, width, center: left + width / 2 };
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
        if (
          animate &&
          pointerId === null &&
          !indicator!.classList.contains("lgt-interacting") &&
          !indicator!.classList.contains("lgt-landing")
        ) {
          window.clearTimeout(teardownTimer);
          ensureIndicatorGlass();
          void indicator!.offsetWidth;
          indicator!.classList.add("lgt-snapping");
          snapToIndex(active, true);
          indicatorGlass?.rebuild();
          trackRefraction();
          endInteraction();
          return;
        }
        snapToIndex(active, animate);
        if (animate) updateTextRefraction();
      },
    };

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

    function setLandMs(ms: number) {
      nav!.style.setProperty("--lgt-land-ms", `${ms}ms`);
    }

    let fadeMs = SETTLE_MS;
    function setFadeMs(ms: number) {
      fadeMs = Math.max(0, ms);
      nav!.style.setProperty("--lgt-fade", `${ms}ms`);
    }

    function beginInteraction() {
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      setLandMs(SETTLE_MS);
      setFadeMs(SETTLE_MS);
      fastShrink = false;
      ensureIndicatorGlass();
      void indicator!.offsetWidth;
      indicator!.classList.remove("lgt-landing");
      indicator!.classList.remove("lgt-settling");
      indicator!.classList.add("lgt-interacting");
      nav!.classList.add("lgt-engaged");
      cacheItemRects();
      updateTextRefraction();
      trackRefraction();
      animateTextScale(TEXT_SCALE_MAX, SLIDE_MS);
    }

    function beginSettle() {
      if (
        indicator!.classList.contains("lgt-landing") ||
        indicator!.classList.contains("lgt-snapping")
      ) {
        if (fastShrink) {
          fastShrink = false;
          setLandMs(SLIDE_MS - SETTLE_MS);
          indicator!.classList.remove("lgt-interacting");
          nav!.classList.remove("lgt-engaged");
        }
        indicator!.classList.add("lgt-settling");
        animateTextScale(0, fadeMs);
        updateTextRefraction();
      }
    }

    function finalize() {
      fastShrink = false;
      indicator!.classList.remove("lgt-interacting");
      indicator!.classList.remove("lgt-landing");
      indicator!.classList.remove("lgt-snapping");
      indicator!.classList.remove("lgt-settling");
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
      setFadeMs(endDelay - settleDelay);
      settleTimer = window.setTimeout(beginSettle, settleDelay);
      endTimer = window.setTimeout(finalize, endDelay);
    }

    // Tanpa drag antar slot (tap = pindah): timing dari durasi tekan.
    function releaseTiming() {
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

    function finishSelection(targetIndex: number) {
      const timing = releaseTiming();
      fastShrink = timing.fast;
      if (!timing.fast) setLandMs(timing.shrinkMs);
      active = targetIndex;
      snapToIndex(targetIndex, true);
      if (indicator!.classList.contains("lgt-interacting")) {
        indicator!.classList.add("lgt-landing");
        if (!timing.fast) indicator!.classList.remove("lgt-interacting");
      }
      if (!timing.fast) nav!.classList.remove("lgt-engaged");
      indicatorGlass?.rebuild();
      trackRefraction();
      endInteraction(timing.settleDelay, timing.endDelay);
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const idx = items.findIndex((el) => el.dataset.pressed === "true");
      for (const el of items) delete el.dataset.pressed;
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      finishSelection(idx >= 0 ? idx : active);
      pointerId = null;
    }

    function onPointerCancel(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      for (const el of items) delete el.dataset.pressed;
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
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
    }

    function onPointerDown(idx: number, e: React.PointerEvent) {
      if (!e.isPrimary || e.button !== 0 || pointerId !== null) return;
      // TANPA preventDefault: link harus tetap bisa dinavigasi saat tap.
      pointerId = e.pointerId;
      for (const el of items) delete el.dataset.pressed;
      items[idx].dataset.pressed = "true";
      pressTime = performance.now();
      beginInteraction();
      // Pill langsung meluncur ke slot yang ditekan (seperti filter tab).
      snapToIndex(idx, true);
      trackRefraction();
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    }

    (nav as unknown as { __mgnDown?: typeof onPointerDown }).__mgnDown =
      onPointerDown;

    snapToIndex(active, false);
    const onResize = () => {
      active = Math.max(
        0,
        items.findIndex((el) => el.dataset.active === "true")
      );
      snapToIndex(active, false);
      indicatorGlass?.rebuild();
      clearTextRefraction();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
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

  // Ikuti perubahan slot aktif dengan animasi.
  useEffect(() => {
    apiRef.current?.snap(true);
  }, [activeIndex]);

  return (
    <nav
      ref={navRef}
      className="lgt-nav mgn-nav"
      data-radius="999"
      aria-label={role === "superadmin" ? "Navigasi admin" : "Navigasi utama"}
    >
      <div
        ref={innerRef}
        className="lgt-nav-inner"
        role="group"
        aria-label={role === "superadmin" ? "Navigasi admin" : "Navigasi utama"}
        style={{ gridTemplateColumns: `repeat(${slots.length}, auto)` }}
      >
        <div ref={indicatorRef} className="lgt-indicator" aria-hidden="true" />
        {/* Filter refraksi khusus teks (id unik agar tidak dobel dengan filter tab). */}
        <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <filter
              id="mgn-text-refract"
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
        {slots.map((slot, idx) => {
          const active = isActive(slot);
          const Icon = active ? slot.ActiveIcon : slot.IdleIcon;
          return (
            <Link
              key={slot.key}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              href={slot.href}
              data-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              aria-label={slot.label}
              className={active ? "lgt-item lgt-active" : "lgt-item"}
              onPointerDown={(e) => {
                const fn = (
                  navRef.current as unknown as {
                    __mgnDown?: (i: number, ev: React.PointerEvent) => void;
                  }
                )?.__mgnDown;
                fn?.(idx, e);
              }}
            >
              <span className="lgt-textwrap">
                <span
                  ref={(el) => {
                    labelRefs.current[idx] = el;
                  }}
                  className="lgt-label mgn-label"
                >
                  <Icon aria-hidden="true" className="size-6" />
                  <span>{slot.label}</span>
                </span>
                {/* Salinan refraksi: hanya terlihat di pita tepi pill. */}
                <span
                  ref={(el) => {
                    glassRefs.current[idx] = el;
                  }}
                  className="lgt-label lgt-label-glass mgn-label"
                  aria-hidden="true"
                >
                  <Icon aria-hidden="true" className="size-6" />
                  <span>{slot.label}</span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
