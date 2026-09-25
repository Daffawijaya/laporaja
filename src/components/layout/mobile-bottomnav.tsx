"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HiChartBar,
  HiClipboardDocumentList,
  HiHome,
  HiOutlineChartBar,
  HiOutlineClipboardDocumentList,
  HiOutlineHome,
  HiOutlinePlus,
  HiOutlineSquares2X2,
  HiOutlineUsers,
  HiPlus,
  HiSquares2X2,
  HiUsers,
} from "react-icons/hi2";
import { MdNotifications, MdOutlineNotifications } from "react-icons/md";

import { cn } from "@/lib/utils";
import type { Role } from "@/lib/supabase/database.types";

interface Slot {
  key: string;
  label: string;
  href: string;
  hash?: string;
  ActiveIcon: React.ComponentType<{ className?: string }>;
  IdleIcon: React.ComponentType<{ className?: string }>;
}

const USER_SLOTS: Slot[] = [
  { key: "beranda", label: "Beranda", href: "/", ActiveIcon: HiHome, IdleIcon: HiOutlineHome },
  {
    key: "indikator",
    label: "Indikator",
    href: "/laporan",
    hash: "#indikator",
    ActiveIcon: HiChartBar,
    IdleIcon: HiOutlineChartBar,
  },
  { key: "tambah", label: "Tambah", href: "/laporan", ActiveIcon: HiPlus, IdleIcon: HiOutlinePlus },
  {
    key: "notifikasi",
    label: "Notifikasi",
    href: "/laporan/notifikasi",
    ActiveIcon: MdNotifications,
    IdleIcon: MdOutlineNotifications,
  },
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
    key: "indikator",
    label: "Indikator",
    href: "/admin/indikator",
    ActiveIcon: HiChartBar,
    IdleIcon: HiOutlineChartBar,
  },
];

// Navigasi bawah mobile ala YouTube: slot datar dan konsisten.
// Beranda di ujung kiri (dashboard admin untuk superadmin).
// Profil tidak ada di sini karena sudah di avatar navbar.
// Hanya tampil di mobile, desktop memakai sidebar kiri.
export function MobileBottomnav({ role }: { role: Role }) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setHash(window.location.hash), 0);
    function onHash() {
      setHash(window.location.hash);
    }
    window.addEventListener("hashchange", onHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", onHash);
    };
  }, [pathname]);

  const slots = role === "superadmin" ? ADMIN_SLOTS : USER_SLOTS;

  function isActive(slot: Slot): boolean {
    if (slot.hash) return pathname === slot.href && hash === slot.hash;
    if (slot.key === "tambah") return pathname === slot.href && hash !== "#indikator";
    if (slot.href === "/" || slot.href === "/admin") return pathname === slot.href;
    return pathname === slot.href || pathname.startsWith(`${slot.href}/`);
  }

  return (
    <nav
      aria-label={role === "superadmin" ? "Navigasi admin" : "Navigasi utama"}
      className="mchrome-bar fixed inset-x-0 bottom-0 z-30 border-t md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex">
        {slots.map((slot) => {
          const active = isActive(slot);
          const Icon = active ? slot.ActiveIcon : slot.IdleIcon;
          return (
            <Link
              key={slot.key}
              href={slot.hash ? `${slot.href}${slot.hash}` : slot.href}
              aria-current={active ? "page" : undefined}
              className="flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 px-1"
            >
              <Icon aria-hidden="true" className="size-6" />
              <span
                className={cn(
                  "text-[11px] leading-tight",
                  active ? "font-medium mchrome-link-active" : "mchrome-link"
                )}
              >
                {slot.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
