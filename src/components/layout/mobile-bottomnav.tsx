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

// Durasi efek morph bottom nav (dibuat baru, bukan salinan sidebar):
// tekan/pindah -> pill membesar + kaca transparan, geser, lalu mengecil
// + cross-fade kembali ke pill abu. Total 480ms.
// Alasan pengecualian MOTION 1: efek perpindahan khas bottom nav ini.
const MORPH_MS = 480;
const SETTLE_AT = 260;
const GLASS_FADE_MS = 320;

// Navigasi bawah mobile: cangkang frost Beta 3 + pill indikator yang
// membesar jadi kaca transparan setiap kali slot aktif berpindah.
// Hanya tampil di mobile, desktop memakai sidebar kiri.
export function MobileBottomnav({ role }: { role: Role }) {
  const pathname = usePathname();
  const innerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const apiRef = useRef<{ go: (index: number, animate: boolean) => void } | null>(null);
  const downRef = useRef<(index: number, e: React.PointerEvent) => void>(() => {});

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
    const inner = innerRef.current;
    const indicator = indicatorRef.current;
    const items = itemRefs.current.filter(
      (el): el is HTMLAnchorElement => el !== null
    );
    if (!inner || !indicator || items.length === 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastIndex = Math.max(
      0,
      items.findIndex((el) => el.dataset.active === "true")
    );
    let pointerId: number | null = null;
    let settleTimer: number | undefined;
    let endTimer: number | undefined;
    let teardownTimer: number | undefined;
    let glass: LiquidGlassHandle | null = null;

    function ensureGlass() {
      if (glass) {
        glass.rebuild();
        return;
      }
      glass = applyLiquidGlass(
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

    function metrics(i: number) {
      const nr = inner!.getBoundingClientRect();
      const ir = items[i].getBoundingClientRect();
      const sx = nr.width > 0 ? inner!.clientWidth / nr.width : 1;
      return {
        left: (ir.left - nr.left) * sx,
        width: ir.width * sx,
      };
    }

    function place(i: number, animate: boolean) {
      if (i < 0 || i >= items.length) return;
      const m = metrics(i);
      if (!animate) {
        const prev = indicator!.style.transition;
        indicator!.style.transition = "none";
        indicator!.style.left = `${m.left}px`;
        indicator!.style.width = `${m.width}px`;
        void indicator!.offsetWidth;
        indicator!.style.transition = prev;
        return;
      }
      indicator!.style.left = `${m.left}px`;
      indicator!.style.width = `${m.width}px`;
    }

    function finish() {
      indicator!.classList.remove("mgn-morph");
      indicator!.classList.remove("mgn-settling");
      window.clearTimeout(teardownTimer);
      teardownTimer = window.setTimeout(() => {
        glass?.destroy();
        glass = null;
      }, GLASS_FADE_MS);
    }

    function go(i: number, animate: boolean) {
      if (i < 0 || i >= items.length) return;
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      if (!animate || reduced) {
        indicator!.classList.remove("mgn-morph");
        indicator!.classList.remove("mgn-settling");
        place(i, false);
        lastIndex = i;
        return;
      }
      // Mulai morph: pill membesar + transparan + kaca, lalu geser.
      ensureGlass();
      indicator!.classList.remove("mgn-settling");
      indicator!.classList.add("mgn-morph");
      glass?.rebuild();
      place(i, true);
      lastIndex = i;
      // Paruh jalan: mulai mengecil + cross-fade kembali ke pill abu.
      settleTimer = window.setTimeout(() => {
        indicator!.classList.add("mgn-settling");
      }, SETTLE_AT);
      endTimer = window.setTimeout(finish, MORPH_MS);
    }

    function onUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    }

    function onCancel(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    }

    downRef.current = (index: number, e: React.PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || pointerId !== null) return;
      // TANPA preventDefault: link harus tetap bisa dinavigasi saat tap.
      pointerId = e.pointerId;
      go(index, true);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    };

    apiRef.current = { go };

    place(lastIndex, false);
    const onResize = () => place(lastIndex, false);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.clearTimeout(settleTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(teardownTimer);
      glass?.destroy();
      glass = null;
      apiRef.current = null;
    };
  }, [slots.length]);

  // Ikuti perubahan slot aktif (navigasi keyboard/alamat) dengan morph.
  useEffect(() => {
    apiRef.current?.go(activeIndex, true);
  }, [activeIndex]);

  return (
    <nav
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
              onPointerDown={(e) => downRef.current(idx, e)}
            >
              <span className="lgt-label mgn-label">
                <Icon aria-hidden="true" className="size-6" />
                <span>{slot.label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
