"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  applyLiquidGlass,
} from "@/lib/liquid-glass";
import { cn } from "@/lib/utils";
import "./glass-select.css";

// Config kaca SALINAN pill LiquidGlassTabs (liquid-glass-tabs.tsx) supaya
// panel dropdown optically sama: tanpa tint biru, tanpa kilau putih
// (specular 0), refraksi tepi + blur backdrop tipis.
const GLASS_CONFIG = {
  ...DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  glassThickness: 24,
  // stdDeviation tipis: 0 = tidak ada frost sama sekali, 1 = sudah noticeable.
  blur: 0.6,
  specularOpacity: 0,
  specularSat: 0,
  tintColor: "255,255,255",
  tintOpacity: 0,
  balancedSpecular: true,
};

const GAP = 8;
// Jarak aman dari tepi viewport.
const EDGE = 8;
const MIN_PANEL_W = 180;
const MAX_PANEL_H = 360;
// Panel tetap ter-mount selama animasi keluar supaya kacanya tidak hilang
// duluan (pop). WAJIB >= --gsp-close-ms (380ms): kalau dipotong, panel
// hilang di tengah morph dan animasi tutuhnya terasa terputus/lambat.
// Kalau durasi tutup diubah di CSS, angka ini ikut naik.
const EXIT_MS = 400;

// Panel diposisikan fixed (bukan absolute) supaya lepas dari overflow
// ancestor, jadi koordinatnya selalu relatif viewport dan harus dihitung
// ulang tiap scroll/resize.
function placePanel(
  trigger: HTMLElement | null,
  panel: HTMLElement | null
) {
  if (!trigger || !panel) return;
  const rect = trigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const width = Math.max(rect.width, MIN_PANEL_W);
  const maxHeight = Math.min(MAX_PANEL_H, Math.max(below, above));
  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${maxHeight}px`;
  // Ukur setelah maxHeight dipasang → tinggi sudah ter-clamp.
  const height = panel.offsetHeight;
  // Balik ke atas kalau tidak cukup ruang di bawah.
  const flip = height > below && above > below;
  const top = flip
    ? Math.max(EDGE, rect.top - GAP - height)
    : rect.bottom + GAP;
  const left = Math.min(
    Math.max(EDGE, rect.left),
    Math.max(EDGE, window.innerWidth - width - EDGE)
  );
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.transformOrigin = flip ? "bottom center" : "top center";

  // Blob awal untuk animasi buka. .gsp-panel cuma menganimasikan
  // translateY + scale, jadi dua nilai ini yang harus dihitung di sini:
  //
  //  1. --gsp-blob-s : skala terkecil. Dipakai rasio tinggi
  //     trigger/panel (44px vs ~360px = 0.12) TAPI dibatasi 0.32–0.42.
  //     Batas bawahnya penting: displacement map dibuat dalam user space
  //     ukuran panel dan ikut mengecil bersama transform, jadi di skala
  //     kecil refraksi ikut mengecil dan panel kelihatan flat. 0.32 masih
  //     terbaca sebagai gumpalan tapi efek kacanya sudah terlihat.
  //  2. --gsp-blob-y : geser sumbu Y supaya titik tengah panel yang sudah
  //     di-scale jatuh persis di tengah trigger. Karena scale menyusutkan
  //     ke arah transformOrigin, titik tengahnya ikut bergeser, jadi
  //     harus dikalikan sk-nya — kalau tidak blob-nya meleset ke bawah.
  const s = Math.min(0.42, Math.max(0.32, rect.height / (height || 1)));
  const triggerMidY = rect.top + rect.height / 2;
  // Jarak asal transform (top/bottom center) ke titik tengah panel.
  const originToMid = flip ? -height / 2 : height / 2;
  const anchorY = flip ? top + height : top;
  panel.style.setProperty(
    "--gsp-blob-s",
    String(s)
  );
  panel.style.setProperty(
    "--gsp-blob-y",
    `${triggerMidY - anchorY - originToMid * s}px`
  );

  // Baru dimunculkan setelah top/left selesai dihitung: panel fixed tanpa
  // top/left akan sempat nempel di pojok kiri viewport selama satu frame
  // (panel lebih dulu ter-render, baru effect menentukan posisinya).
  panel.dataset.ready = "true";
}

export interface GlassSelectOption {
  value: string;
  label: string;
}

export interface GlassSelectProps {
  options: GlassSelectOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

// <select> native tidak bisa dipakai: panelnya digambar OS sehingga sama
// sekali tidak bisa diberi liquid glass. Jadi diganti listbox custom:
// trigger tetap pill putih ala .lgt-nav, panelnya refraksi (transparan)
// persis kaca pill LiquidGlassTabs.
export function GlassSelect({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  disabled,
}: GlassSelectProps) {
  const uid = React.useId();
  const listId = `${uid}-list`;
  const triggerId = `${uid}-trigger`;
  const optId = (i: number) => `${uid}-opt-${i}`;

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef(0);
  const typeRef = React.useRef({ text: "", at: 0 });

  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  // `open` = state logika (a11y, keyboard, klik luar). `shown` = gate kelas
  // .gsp-open. Dipisah karena status blob harus sempat ter-paint dulu satu
  // frame sebelum berubah ke scale(1); kalau classyatu commit yang sama,
  // tidak ada nilai "sebelum" untuk dianimasikan dan blob-nya di-skip.
  const [shown, setShown] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const selected = options[selectedIndex];

  // Pasang/delepas node kaca + hitung posisi begitu panel mount.
  React.useEffect(() => {
    if (!mounted) return;
    const panel = panelRef.current;
    if (!panel) return;
    placePanel(triggerRef.current, panel);
    // ResizeObserver di dalam applyLiquidGlass yang menyesuaikan lagi
    // saat ukuran panel berubah.
    const handle = applyLiquidGlass(panel, () => GLASS_CONFIG);
    return () => handle.destroy();
  }, [mounted]);

  // Blob → panel: nyalakan .gsp-open setelah dua frame, supaya bentuk
  // blob (scale kecil di atas trigger) sempat ter-paint dulu dan ada
  // nilai "sebelum" untuk dianimasikan. Kalau classyatu commit yang sama,
  // transisinya di-skip dan panel langsung muncul utuh.
  //
  // Bergantung ke `open`, bukan `mounted`, supaya buka-lagi saat animasi
  // tutup masih jalan ikut_DELAY — tanpa ini `mounted` tidak berubah,
  // effect mount tidak jalan lagi, dan panel diam di bentuk blob.
  React.useEffect(() => {
    if (!open) return;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setShown(true));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [open]);

  // Ikuti trigger saat halaman/scroll digeser.
  React.useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    const update = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        placePanel(triggerRef.current, panelRef.current);
      });
    };
    window.addEventListener("resize", update);
    // capture:true supaya ikut container scroll di dalam halaman.
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [mounted]);

  // Kursor aktif selalu terlihat saat panel panjang.
  React.useEffect(() => {
    if (!open) return;
    document.getElementById(optId(cursor))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cursor]);

  // Scroll ulang setelah animasi buka selesai. Selama .gsp-list masih
  // di-scale 0.94, posisi tiap opsi bergeser ~20px ke atas, jadi
  // scrollIntoView pertama bisa cuma "hampir" — opsi terpilih (mis. bulan
  // ke-9 dari 12) masih kepotong bawah. Satu kali lagi setelah scale
  // kembali ke 1 sudah cukup.
  React.useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => {
      document.getElementById(optId(cursor))?.scrollIntoView({ block: "nearest" });
    }, 420);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  function close() {
    setOpen(false);
    setShown(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMounted(false), EXIT_MS);
  }

  function openPanel(at?: number) {
    window.clearTimeout(closeTimer.current);
    setCursor(Math.max(0, Math.min(options.length - 1, at ?? selectedIndex)));
    setMounted(true);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close();
    triggerRef.current?.focus();
  }

  // Klik di luar trigger + panel → tutup.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  React.useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
    },
    []
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const last = options.length - 1;
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        openPanel();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        openPanel(last);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setCursor((c) => Math.min(last, c + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
        break;
      case "Home":
        event.preventDefault();
        setCursor(0);
        break;
      case "End":
        event.preventDefault();
        setCursor(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(cursor);
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
      default: {
        // Type-ahead: ketik awalan label → lompat ke opsi pertama yang cocok.
        if (event.key.length !== 1) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const now = Date.now();
        const state = typeRef.current;
        state.text = now - state.at > 800 ? event.key : state.text + event.key;
        state.at = now;
        const query = state.text.toLowerCase();
        const found = options.findIndex((option) =>
          option.label.toLowerCase().startsWith(query)
        );
        if (found >= 0) {
          event.preventDefault();
          setCursor(found);
        }
      }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optId(cursor) : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={onKeyDown}
        className={cn(
          // Cangkang identik .lgt-nav: putih 50% + border putih + shadow.
          // 11px = ukuran & berat label tab (--lgt) supaya satu baris filter rata.
          "transition-soft flex h-11 w-full items-center justify-between gap-2 rounded-full border border-white bg-white/85 pl-3.5 pr-3 text-left text-[11px] text-foreground shadow-[0_1px_4px_rgb(0_0_0/0.05)]",
          "hover:border-white focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
          "dark:border-white/12 dark:bg-[rgb(28_28_30/0.85)] dark:shadow-[0_1px_4px_rgb(0_0_0/0.42)]",
          className
        )}
      >
        <span className="min-w-0 truncate">{selected?.label ?? ""}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-[#6e6e73] transition-transform duration-200 dark:text-[#98989d]",
            "motion-safe:[transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
            open && "rotate-180"
          )}
        />
      </button>

      {mounted ? (
        <div
          ref={panelRef}
          data-radius="24"
          className={cn("gsp-panel", shown && "gsp-open")}
        >
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={triggerId}
            className="gsp-list"
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={optId(index)}
                role="option"
                aria-selected={option.value === value}
                data-active={index === cursor ? "true" : "false"}
                // Jangan biarkan trigger kehilangan fokus saat opsi ditekan.
                onPointerDown={(event) => event.preventDefault()}
                onPointerEnter={() => setCursor(index)}
                onClick={() => choose(index)}
                className="gsp-item"
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {option.value === value ? (
                  <Check aria-hidden="true" className="size-4 shrink-0 opacity-70" />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
