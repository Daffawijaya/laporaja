"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { MessageCircle, Moon, Search, Sun } from "lucide-react";
import {
  HiBell,
  HiOutlineBell,
  HiChartBar,
  HiClipboardDocumentList,
  HiHome,
  HiOutlineChartBar,
  HiOutlineClipboardDocumentList,
  HiOutlineHome,
  HiOutlineSquares2X2,
  HiOutlineUserCircle,
  HiOutlineUsers,
  HiSquares2X2,
  HiUserCircle,
  HiUsers,
} from "react-icons/hi2";
import { MdNotifications, MdOutlineNotifications } from "react-icons/md";

import { cn } from "@/lib/utils";
import type { Role } from "@/lib/supabase/database.types";

type Icon = React.ComponentType<{ className?: string }>;

interface SideItem {
  key: string;
  label: string;
  href: string;
  badge?: boolean;
  ActiveIcon: Icon;
  IdleIcon: Icon;
}

// Judul topbar per halaman (gaya referensi: satu judul besar di kiri).
function refTitle(pathname: string): string {
  if (pathname === "/") return "Beranda";
  if (pathname === "/laporan/notifikasi") return "Notifikasi";
  if (pathname.startsWith("/laporan/")) return "Detail Kegiatan";
  if (pathname === "/laporan") return "Laporan";
  if (pathname === "/anda") return "Anda";
  if (pathname === "/admin") return "Dashboard";
  if (pathname === "/admin/users") return "Pengguna";
  if (pathname === "/admin/bidang") return "Bidang";
  if (pathname === "/admin/indikator") return "Indikator";
  if (pathname === "/admin/laporan") return "Laporan";
  if (pathname.startsWith("/admin/laporan/")) return "Detail Laporan";
  return "Dashboard";
}

// Chrome desktop ala referensi: bg abu flat, sidebar kiri (logo, menu pill,
// ikon bawah), topbar (judul besar, search pill, tombol Create hitam, bel,
// pesan, avatar). Hanya tampil di desktop, mobile memakai topbar + bottom nav.
export function DesktopWindow({
  role,
  username,
  badgeCount,
  children,
}: {
  role: Role;
  username: string;
  badgeCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Search global: tulis ke ?q= (debounce), dibaca daftar-daftar client.
  const urlQ = searchParams.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  // Selaraskan ketikan dengan URL saat navigasi (back/forward, clear).
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    setQ(urlQ);
  }
  useEffect(() => {
    if (q === urlQ) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q, urlQ, pathname, router, searchParams]);

  const isAdmin = role === "superadmin";
  const bellHref = isAdmin ? "/admin/laporan" : "/laporan/notifikasi";
  const createHref = isAdmin ? "/admin/users" : "/laporan";
  const initial = (username.charAt(0) || "?").toUpperCase();
  const badge = badgeCount > 9 ? "9+" : String(badgeCount);
  const dark = mounted && resolvedTheme === "dark";
  const title = refTitle(pathname);

  const menu: SideItem[] = isAdmin
    ? [
        { key: "beranda", label: "Dashboard", href: "/admin", ActiveIcon: HiHome, IdleIcon: HiOutlineHome },
        {
          key: "laporan",
          label: "Laporan",
          href: "/admin/laporan",
          badge: true,
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
      ]
    : [
        { key: "beranda", label: "Beranda", href: "/", ActiveIcon: HiHome, IdleIcon: HiOutlineHome },
        {
          key: "notifikasi",
          label: "Notifikasi",
          href: "/laporan/notifikasi",
          badge: true,
          ActiveIcon: MdNotifications,
          IdleIcon: MdOutlineNotifications,
        },
        { key: "anda", label: "Anda", href: "/anda", ActiveIcon: HiUserCircle, IdleIcon: HiOutlineUserCircle },
      ];

  function menuActive(item: SideItem): boolean {
    if (item.href === "/" || item.href === "/admin") return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <div className="ref-shell hidden md:flex">
      {/* Sidebar kiri ala referensi */}
      <aside className="flex w-[212px] shrink-0 flex-col gap-1 overflow-y-auto py-2">
        <Link href={isAdmin ? "/admin" : "/"} aria-label="LaporAja beranda" className="flex items-center gap-2 px-3 py-2">
          <span aria-hidden="true" className="ref-logo">
            <span className="ref-logo-q ref-logo-tl" />
            <span className="ref-logo-q ref-logo-tr" />
            <span className="ref-logo-q ref-logo-bl" />
            <span className="ref-logo-q ref-logo-br" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">LaporAja</span>
        </Link>

        <nav aria-label={isAdmin ? "Navigasi admin" : "Navigasi utama"} className="mt-2 flex flex-col gap-1">
          {menu.map((item) => {
            const active = menuActive(item);
            const ItemIcon = active ? item.ActiveIcon : item.IdleIcon;
            const showBadge = item.badge && badgeCount > 0;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("ref-menu-item", active && "ref-menu-active")}
              >
                <ItemIcon aria-hidden="true" className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {showBadge && (
                  <span
                    aria-hidden="true"
                    className="flex min-h-5 min-w-5 items-center justify-center rounded-full bg-black px-1 text-[10px] font-semibold text-white dark:bg-white dark:text-black"
                  >
                    {badge}
                  </span>
                )}
                <span className="sr-only">{showBadge ? `, ${badgeCount} baru` : ""}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-start gap-2 px-3 pt-6">
          <Link href={bellHref} aria-label="Pesan" className="ref-icon-btn">
            <MessageCircle aria-hidden="true" className="size-5" />
          </Link>
          <button
            type="button"
            onClick={() => setTheme(dark ? "light" : "dark")}
            aria-label={dark ? "Matikan mode gelap" : "Nyalakan mode gelap"}
            className="ref-icon-btn"
          >
            {dark ? (
              <Sun aria-hidden="true" className="size-5" />
            ) : (
              <Moon aria-hidden="true" className="size-5" />
            )}
          </button>
        </div>
      </aside>

      {/* Kolom kanan: topbar + konten */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 px-6 pt-4 pb-4 lg:px-8">
          <h1 className="min-w-0 flex-1 truncate text-[26px] font-semibold tracking-tight">{title}</h1>

          <div className="relative w-56 shrink-0 lg:w-72">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="search"
              role="searchbox"
              aria-label="Cari"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search anything..."
              className="ref-search"
            />
          </div>

          <Link href={createHref} className="ref-create">
            Create
          </Link>

          <Link
            href={bellHref}
            aria-label={badgeCount > 0 ? `Notifikasi, ${badgeCount} baru` : "Notifikasi"}
            className="ref-icon-btn relative"
          >
            {badgeCount > 0 ? (
              <HiBell aria-hidden="true" className="size-5" />
            ) : (
              <HiOutlineBell aria-hidden="true" className="size-5" />
            )}
            {badgeCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-black px-0.5 text-[9px] font-semibold text-white dark:bg-white dark:text-black"
              >
                {badge}
              </span>
            )}
          </Link>
          <Link href={bellHref} aria-label="Pesan" className="ref-icon-btn">
            <MessageCircle aria-hidden="true" className="size-5" />
          </Link>
          <Link
            href="/anda"
            aria-label="Akun Anda"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm dark:bg-white/10"
          >
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600 dark:bg-white/15 dark:text-white"
            >
              {initial}
            </span>
          </Link>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto px-6 pb-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
