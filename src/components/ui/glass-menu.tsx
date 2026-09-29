"use client";

import * as React from "react";
import { Ellipsis } from "lucide-react";

import {
  DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  applyLiquidGlass,
} from "@/lib/liquid-glass";
import { cn } from "@/lib/utils";
import "./glass-select.css";

// Config kaca SAMA PERSIS panel dropdown (glass-select.tsx) supaya menu aksi
// terlihat seperti komponen dropdown itu: tanpa tint biru, tanpa kilau,
// refraksi tepi + blur tipis.
const GLASS_CONFIG = {
  ...DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  glassThickness: 24,
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
const MIN_PANEL_W = 160;
const MAX_PANEL_H = 360;
// Panel tetap ter-mount selama animasi keluar (sama glass-select, WAJIB >=
// --gsp-close-ms 380ms).
const EXIT_MS = 400;

// Panel fixed rata-kanan terhadap trigger (menu aksi), logika flip/ukur
// sama seperti placePanel() di glass-select.tsx.
function placePanel(trigger: HTMLElement | null, panel: HTMLElement | null) {
  if (!trigger || !panel) return;
  const rect = trigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const width = Math.max(trigger.offsetWidth, MIN_PANEL_W);
  const maxHeight = Math.min(MAX_PANEL_H, Math.max(below, above));
  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${maxHeight}px`;
  const height = panel.offsetHeight;
  const flip = height > below && above > below;
  const top = flip ? Math.max(EDGE, rect.top - GAP - height) : rect.bottom + GAP;
  const left = Math.min(
    Math.max(EDGE, rect.right - width),
    Math.max(EDGE, window.innerWidth - width - EDGE)
  );
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.transformOrigin = flip ? "bottom right" : "top right";

  // Blob awal yang sama dengan dropdown (lihat glass-select.tsx).
  const s = Math.min(0.42, Math.max(0.32, rect.height / (height || 1)));
  const triggerMidY = rect.top + rect.height / 2;
  const originToMid = flip ? -height / 2 : height / 2;
  const anchorY = flip ? top + height : top;
  panel.style.setProperty("--gsp-blob-s", String(s));
  panel.style.setProperty(
    "--gsp-blob-y",
    `${triggerMidY - anchorY - originToMid * s}px`
  );
  panel.dataset.ready = "true";
}

export interface GlassMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** Merah (mis. Hapus). */
  danger?: boolean;
  onSelect: () => void;
}

export interface GlassMenuTriggerApi {
  ref: React.Ref<HTMLButtonElement>;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  open: boolean;
  label: string;
}

// Menu aksi reusable: trigger lingkaran titik-tiga, panel dropdown kaca
// yang sama dengan GlassSelect. Dipakai untuk aksi per-baris (Ubah/Hapus)
// supaya baris tetap ramping seperti daftar laporan.
export function GlassMenu({
  label,
  items,
  className,
  trigger,
}: {
  /** aria-label trigger + menu, mis. "Aksi Andi". */
  label: string;
  items: GlassMenuItem[];
  className?: string;
  /** Trigger kustom (mis. tombol Tambah). Default: ikon titik-tiga abu. */
  trigger?: (api: GlassMenuTriggerApi) => React.ReactNode;
}) {
  const uid = React.useId();
  const itemId = (i: number) => `${uid}-item-${i}`;

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef(0);

  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);

  React.useEffect(() => {
    if (!mounted) return;
    const panel = panelRef.current;
    if (!panel) return;
    placePanel(triggerRef.current, panel);
    const handle = applyLiquidGlass(panel, () => GLASS_CONFIG);
    return () => handle.destroy();
  }, [mounted]);

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
  }, [open ]);

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
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [mounted]);

  React.useEffect(() => {
    if (!open) return;
    document.getElementById(itemId(cursor))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cursor]);

  function close() {
    setOpen(false);
    setShown(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMounted(false), EXIT_MS);
  }

  function openPanel() {
    window.clearTimeout(closeTimer.current);
    setCursor(0);
    setMounted(true);
    setOpen(true);
  }

  function choose(index: number) {
    const item = items[index];
    if (!item) return;
    item.onSelect();
    close();
    triggerRef.current?.focus();
  }

  // Klik di luar trigger + panel → tutup (otomatis menutup menu baris lain).
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
  }, [open ]);

  React.useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
    },
    []
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const last = items.length - 1;
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        openPanel();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        openPanel();
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
        triggerRef.current?.focus();
        break;
      case "Tab":
        close();
        break;
    }
  }

  return (
    <>
      {trigger ? (
        // Render-prop trigger kustom: ref objek hanya DITERUSKAN (ditulis
        // saat mount oleh React), tidak pernah dibaca .current saat render.
        // eslint-disable-next-line react-hooks/refs
        trigger({
          ref: triggerRef,
          onClick: () => (open ? close() : openPanel()),
          onKeyDown,
          open,
          label,
        })
      ) : (
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? close() : openPanel())}
          onKeyDown={onKeyDown}
          // Polos abu persis chevron daftar laporan: tanpa lingkaran,
          // tanpa hover.
          className={cn(
            "flex shrink-0 items-center justify-center p-1 text-neutral-400",
            className
          )}
        >
          <Ellipsis aria-hidden="true" className="size-5" />
        </button>
      )}

      {mounted ? (
        <div ref={panelRef} data-radius="24" className={cn("gsp-panel", shown && "gsp-open")}>
          <ul role="menu" aria-label={label} className="gsp-list">
            {items.map((item, index) => (
              <li
                key={item.key}
                id={itemId(index)}
                role="menuitem"
                data-active={index === cursor ? "true" : "false"}
                // Jangan biarkan trigger kehilangan fokus saat item ditekan.
                onPointerDown={(event) => event.preventDefault()}
                onPointerEnter={() => setCursor(index)}
                onClick={() => choose(index)}
                className="gsp-item"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {item.icon ? (
                    <span
                      className={cn(
                        "flex shrink-0 items-center opacity-70 [&_svg]:size-4",
                        item.danger && "text-danger"
                      )}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className={cn("truncate", item.danger && "text-danger")}>
                    {item.label}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
