"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import {
  DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  applyLiquidGlass,
} from "@/lib/liquid-glass";
import { cn } from "@/lib/utils";
import "./glass-select.css";

// Config kaca SAMA PERSIS panel dropdown (glass-select.tsx) supaya kalender
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
// Lebar panel kalender tetap (grid 7 x 40px + padding).
const PANEL_W = 308;
const MAX_PANEL_H = 430;
// Panel tetap ter-mount selama animasi keluar (sama glass-select, WAJIB >=
// --gsp-close-ms 380ms).
const EXIT_MS = 400;

// Panel diposisikan fixed (bukan absolute) supaya lepas dari overflow
// ancestor — logika flip/ukur sama seperti placePanel() di glass-select.tsx.
function placePanel(trigger: HTMLElement | null, panel: HTMLElement | null) {
  if (!trigger || !panel) return;
  const rect = trigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const width = Math.min(PANEL_W, window.innerWidth - EDGE * 2);
  const maxHeight = Math.min(MAX_PANEL_H, Math.max(below, above));
  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${maxHeight}px`;
  // Ukur setelah maxHeight dipasang → tinggi sudah ter-clamp.
  const height = panel.offsetHeight;
  // Balik ke atas kalau tidak cukup ruang di bawah.
  const flip = height > below && above > below;
  const top = flip ? Math.max(EDGE, rect.top - GAP - height) : rect.bottom + GAP;
  const left = Math.min(
    Math.max(EDGE, rect.left),
    Math.max(EDGE, window.innerWidth - width - EDGE)
  );
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.transformOrigin = flip ? "bottom center" : "top center";

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

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const BULAN_S = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
// Mulai Senin (standar Indonesia).
const HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// Urai YYYY-MM-DD ketat (format yang dipakai validasi cleanNilai).
function parseISO(raw: string): { y: number; m: number; d: number } | null {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec((raw ?? "").trim());
  if (!cocok) return null;
  const y = Number(cocok[1]);
  const m = Number(cocok[2]);
  const d = Number(cocok[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return { y, m, d };
}

function hariIni(): { y: number; m: number; d: number } {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

// Sel grid dirapatkan ke kelipatan 7 (4–6 baris mengikuti bulannya) supaya
// tidak ada baris kosong menggantung di bawah.
function selBulan(y: number, m: number): (number | null)[] {
  const awal = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Senin = 0
  const jumlah = new Date(y, m, 0).getDate();
  const sel: (number | null)[] = [];
  for (let i = 0; i < awal; i += 1) sel.push(null);
  for (let d = 1; d <= jumlah; d += 1) sel.push(d);
  while (sel.length % 7 !== 0) sel.push(null);
  return sel;
}

function labelHari(y: number, m: number, d: number): string {
  const nama = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][
    new Date(y, m - 1, d).getDay()
  ];
  return `${nama}, ${d} ${BULAN[m - 1]} ${y}`;
}

export interface GlassCalendarProps {
  /** Nilai YYYY-MM-DD ("" = kosong). */
  value: string;
  onChange: (value: string) => void;
  /** Label kolom: dipakai aria + placeholder ala input sel. */
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Bulan laporan (1-12): kalender dibuka langsung di bulan ini bila tanggal masih kosong. */
  bulan?: number;
  /** Tahun laporan: pasangan bulan di atas. */
  tahun?: number;
  /** Kunci di bulan laporan: navigasi bulan + judul bulan + "Hari ini"
      disembunyikan, hanya tanggal di bulan itu yang bisa dipilih. */
  kunciBulan?: boolean;
}

// Pemilih tanggal kalender bulan: trigger menyatu dengan input sel tabel,
// panelnya liquid glass SAMA PERSIS dropdown (glass-select.css + config kaca
// yang sama). Pilih tanggal langsung tersimpan + menutup (semudah dropdown).
export function GlassCalendar({
  value,
  onChange,
  ariaLabel,
  className,
  disabled,
  bulan,
  tahun,
  kunciBulan,
}: GlassCalendarProps) {
  const uid = React.useId();
  const dialogId = `${uid}-dialog`;
  const triggerId = `${uid}-trigger`;
  const hariId = (y: number, m: number, d: number) => `${uid}-d-${y}-${m}-${d}`;

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef(0);

  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  // `open` = state logika, `shown` = gate kelas .gsp-open (pola yang sama
  // dengan glass-select: blob harus ter-paint dulu satu frame).
  const [shown, setShown] = React.useState(false);

  const terpilih = parseISO(value);
  const ini = hariIni();
  // Bulan laporan valid → kalender dibuka langsung di bulan itu (tak perlu
  // tulis/ganti bulan manual). Tanggal yang sudah terisi tetap menang.
  const periodeValid =
    typeof bulan === "number" &&
    typeof tahun === "number" &&
    Number.isInteger(bulan) &&
    Number.isInteger(tahun) &&
    bulan >= 1 &&
    bulan <= 12 &&
    tahun >= 2000 &&
    tahun <= 2100;

  function lihatAwal(): { y: number; m: number } {
    // Terkunci: selalu bulan laporan (nilai di luar bulan itu diabaikan —
    // pengguna hanya bisa memilih tanggal di bulan laporan).
    if (kunciBulan && periodeValid) return { y: tahun as number, m: bulan as number };
    const p = parseISO(value);
    if (p) return { y: p.y, m: p.m };
    if (periodeValid) return { y: tahun as number, m: bulan as number };
    const t = hariIni();
    return { y: t.y, m: t.m };
  }

  function fokusAwal(): { y: number; m: number; d: number } {
    const p = parseISO(value);
    const v = lihatAwal();
    if (p && p.y === v.y && p.m === v.m) return { ...p };
    const t = hariIni();
    if (t.y === v.y && t.m === v.m) return { ...t };
    return { y: v.y, m: v.m, d: 1 };
  }

  const [lihat, setLihat] = React.useState(lihatAwal);
  const [fokus, setFokus] = React.useState(fokusAwal);

  // Pasang/delepas node kaca + hitung posisi begitu panel mount.
  React.useEffect(() => {
    if (!mounted) return;
    const panel = panelRef.current;
    if (!panel) return;
    placePanel(triggerRef.current, panel);
    const handle = applyLiquidGlass(panel, () => GLASS_CONFIG);
    return () => handle.destroy();
  }, [mounted]);

  // Blob → panel: nyalakan .gsp-open setelah dua frame.
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
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [mounted]);

  // Fokus hari aktif begitu panel terbuka (roving tabindex).
  React.useEffect(() => {
    if (!shown) return;
    document.getElementById(hariId(fokus.y, fokus.m, fokus.d))?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  function close() {
    setOpen(false);
    setShown(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMounted(false), EXIT_MS);
  }

  function openPanel() {
    window.clearTimeout(closeTimer.current);
    setLihat(lihatAwal());
    setFokus(fokusAwal());
    setMounted(true);
    setOpen(true);
  }

  function choose(iso: string) {
    onChange(iso);
    close();
    triggerRef.current?.focus();
  }

  function geserBulan(delta: number) {
    setLihat((prev) => {
      const idx = prev.y * 12 + (prev.m - 1) + delta;
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    });
  }

  function gerakFokus(deltaHari: number) {
    const dt = new Date(fokus.y, fokus.m - 1, fokus.d + deltaHari);
    const next = { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
    // Terkunci: fokus tidak boleh keluar dari bulan yang tampil.
    if (kunciBulan && (next.y !== lihat.y || next.m !== lihat.m)) return;
    setFokus(next);
    setLihat({ y: next.y, m: next.m });
    window.requestAnimationFrame(() => {
      document.getElementById(hariId(next.y, next.m, next.d))?.focus();
    });
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
  }, [open ]);

  React.useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
    },
    []
  );

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      if (open) close();
      else openPanel();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openPanel();
    }
  }

  function onPanelKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        gerakFokus(-1);
        break;
      case "ArrowRight":
        event.preventDefault();
        gerakFokus(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        gerakFokus(-7);
        break;
      case "ArrowDown":
        event.preventDefault();
        gerakFokus(7);
        break;
      case "Home":
        event.preventDefault();
        if (!kunciBulan) geserBulan(-1);
        break;
      case "End":
        event.preventDefault();
        if (!kunciBulan) geserBulan(1);
        break;
      case "Enter":
      case " ":
        // Dipicu dari tombol hari → biarkan klik bawaan memilih.
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

  const teks = terpilih
    ? `${terpilih.d} ${BULAN_S[terpilih.m - 1]} ${terpilih.y}`
    : (ariaLabel ?? "Pilih tanggal");
  const sel = selBulan(lihat.y, lihat.m);
  const isoHariIni = toISO(ini.y, ini.m, ini.d);

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          // Menyatu dengan input sel tabel (h-11, abu isi, teks 14px).
          "transition-soft flex h-11 w-full min-w-[128px] items-center justify-between gap-2 rounded-md border border-transparent bg-black/[0.075] px-3.5 text-left text-sm text-foreground",
          "hover:border-transparent hover:bg-black/[0.12] focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15",
          "disabled:cursor-not-allowed disabled:opacity-60",
          !terpilih && "text-neutral-400",
          "dark:bg-white/[0.075] dark:hover:bg-white/[0.12]",
          className
        )}
      >
        <span className="min-w-0 flex-1 truncate">{teks}</span>
        <CalendarDays aria-hidden="true" className="size-4 shrink-0 opacity-60" />
      </button>

      {mounted ? (
        <div
          ref={panelRef}
          data-radius="24"
          className={cn("gsp-panel", shown && "gsp-open")}
        >
          <div
            id={dialogId}
            role="dialog"
            aria-modal="false"
            aria-label={ariaLabel ?? "Pilih tanggal"}
            aria-labelledby={triggerId}
            onKeyDown={onPanelKeyDown}
            className="gsp-list gsp-cal"
          >
            {!kunciBulan ? (
              <div className="flex items-center justify-between pb-2">
                <button
                  type="button"
                  onClick={() => geserBulan(-1)}
                  aria-label="Bulan sebelumnya"
                  className="flex size-9 items-center justify-center rounded-full text-neutral-500 transition-soft hover:bg-black/[0.075] hover:text-foreground dark:hover:bg-white/10"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </button>
                <p className="text-sm font-semibold" aria-live="polite">
                  {BULAN[lihat.m - 1]} {lihat.y}
                </p>
                <button
                  type="button"
                  onClick={() => geserBulan(1)}
                  aria-label="Bulan berikutnya"
                  className="flex size-9 items-center justify-center rounded-full text-neutral-500 transition-soft hover:bg-black/[0.075] hover:text-foreground dark:hover:bg-white/10"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </div>
            ) : null}

            <div
              role="grid"
              aria-label={`${BULAN[lihat.m - 1]} ${lihat.y}`}
            >
              <div role="row" className="grid grid-cols-7">
                {HARI.map((nama) => (
                  <span
                    key={nama}
                    role="columnheader"
                    className="flex h-8 items-center justify-center text-[11px] font-medium text-neutral-400"
                  >
                    {nama}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7" role="rowgroup">
                {Array.from({ length: sel.length / 7 }, (_, pekan) => (
                  <div key={pekan} role="row" className="contents">
                    {sel.slice(pekan * 7, pekan * 7 + 7).map((d, i) => {
                      const kunci = pekan * 7 + i;
                      if (d === null) {
                        return (
                          <span
                            key={`kosong-${kunci}`}
                            className="flex size-10 items-center justify-center"
                          />
                        );
                      }
                      const iso = toISO(lihat.y, lihat.m, d);
                      const aktif = value === iso;
                      const hariIniCell = iso === isoHariIni;
                      return (
                        <button
                          key={`${lihat.y}-${lihat.m}-${d}`}
                          id={hariId(lihat.y, lihat.m, d)}
                          type="button"
                          role="gridcell"
                          aria-label={labelHari(lihat.y, lihat.m, d)}
                          aria-current={hariIniCell ? "date" : undefined}
                          aria-selected={aktif}
                          tabIndex={
                            fokus.y === lihat.y && fokus.m === lihat.m && fokus.d === d ? 0 : -1
                          }
                          onClick={() => choose(iso)}
                          onFocus={() => setFokus({ y: lihat.y, m: lihat.m, d })}
                          // Jangan biarkan trigger kehilangan fokus saat ditekan.
                          onPointerDown={(event) => event.preventDefault()}
                          className={cn(
                            "flex size-10 items-center justify-center rounded-full text-sm transition-soft",
                            "hover:bg-black/[0.075] dark:hover:bg-white/10",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                            aktif
                              ? "bg-foreground font-medium text-background hover:bg-foreground"
                              : hariIniCell
                                ? "font-semibold text-accent"
                                : "text-foreground"
                          )}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {terpilih ? (
              <div className="flex items-center justify-end pt-2">
                <button
                  type="button"
                  onClick={() => choose("")}
                  aria-label="Hapus tanggal"
                  className="rounded-full px-3 py-2 text-xs font-medium text-danger transition-soft hover:bg-danger/10"
                >
                  Hapus
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
