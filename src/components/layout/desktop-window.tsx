"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { Moon, Search, Sun, X } from "lucide-react";
import {
  HiBell,
  HiOutlineBell,
  HiCalendarDays,
  HiChartBar,
  HiClipboardDocumentList,
  HiHome,
  HiOutlineCalendarDays,
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
import { NAMA_BULAN } from "@/components/laporan/types";
import type { Role } from "@/lib/supabase/database.types";

type Icon = React.ComponentType<{ className?: string }>;

interface DeskTab {
  key: string;
  label: string;
  href: string;
  hash?: string;
  dot?: boolean;
}

interface SideItem {
  key: string;
  label: string;
  href: string;
  badge?: boolean;
  ActiveIcon: Icon;
  IdleIcon: Icon;
}

const USER_TABS: DeskTab[] = [
  { key: "beranda", label: "Beranda", href: "/" },
  { key: "notifikasi", label: "Notifikasi", href: "/laporan/notifikasi", dot: true },
  { key: "anda", label: "Anda", href: "/anda" },
];

const ADMIN_TABS: DeskTab[] = [
  { key: "beranda", label: "Dashboard", href: "/admin" },
  { key: "laporan", label: "Laporan", href: "/admin/laporan", dot: true },
  { key: "users", label: "Pengguna", href: "/admin/users" },
  { key: "bidang", label: "Bidang", href: "/admin/bidang" },
  { key: "indikator", label: "Indikator", href: "/admin/indikator" },
];

function recentMonths(): { bulan: number; tahun: number; label: string; href: string }[] {
  const out: { bulan: number; tahun: number; label: string; href: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const bulan = d.getMonth() + 1;
    const tahun = d.getFullYear();
    out.push({
      bulan,
      tahun,
      label: `${NAMA_BULAN[bulan - 1].slice(0, 3)} ${tahun}`,
      href: `/laporan?bulan=${bulan}&tahun=${tahun}`,
    });
  }
  return out;
}

// Jendela desktop ala macOS: wallpaper, panel kaca bulat, titlebar
// (traffic light, tab underline, search, tema, bel, avatar), sidebar
// seksi tanpa card, konten card-dalam-card. Hanya tampil di desktop,
// mobile memakai topbar dan bottom nav.
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
  const [hash, setHash] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHash(window.location.hash);
      setMounted(true);
    }, 0);
    function onHash() {
      setHash(window.location.hash);
    }
    window.addEventListener("hashchange", onHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", onHash);
    };
  }, [pathname]);

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

  const tabs = role === "superadmin" ? ADMIN_TABS : USER_TABS;
  const bellHref = role === "superadmin" ? "/admin/laporan" : "/laporan/notifikasi";
  const initial = (username.charAt(0) || "?").toUpperCase();
  const badge = badgeCount > 9 ? "9+" : String(badgeCount);
  const dark = mounted && resolvedTheme === "dark";

  function isActive(href: string, tabHash?: string): boolean {
    if (tabHash) return pathname === href && hash === tabHash;
    if (href === "/" || href === "/admin") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const now = new Date();
  const spBulan = Number(searchParams.get("bulan")) || now.getMonth() + 1;
  const spTahun = Number(searchParams.get("tahun")) || now.getFullYear();

  const userSections: { title: string; items: SideItem[] }[] = [
    {
      title: "Menu",
      items: [
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
      ],
    },
    {
      title: "Bulan",
      items: recentMonths().map((m) => ({
        key: `bulan-${m.tahun}-${m.bulan}`,
        label: m.label,
        href: m.href,
        ActiveIcon: HiCalendarDays,
        IdleIcon: HiOutlineCalendarDays,
      })),
    },
    {
      title: "Lainnya",
      items: [
        {
          key: "indikator",
          label: "Indikator",
          href: "/laporan#indikator",
          ActiveIcon: HiChartBar,
          IdleIcon: HiOutlineChartBar,
        },
      ],
    },
  ];

  const adminSections: { title: string; items: SideItem[] }[] = [
    {
      title: "Menu",
      items: [
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
      ],
    },
    {
      title: "Lainnya",
      items: [
        {
          key: "review",
          label: "Perlu review",
          href: "/admin#perlu-review",
          ActiveIcon: HiClipboardDocumentList,
          IdleIcon: HiOutlineClipboardDocumentList,
        },
      ],
    },
  ];

  const sections = role === "superadmin" ? adminSections : userSections;

  function sideActive(item: SideItem): boolean {
    const [href, itemHash] = item.href.split("#");
    if (item.key.startsWith("bulan-")) {
      const m = recentMonths().find((row) => `bulan-${row.tahun}-${row.bulan}` === item.key);
      return (
        pathname === "/laporan" && !!m && m.bulan === spBulan && m.tahun === spTahun
      );
    }
    if (itemHash) return pathname === href && hash === `#${itemHash}`;
    if (href === "/" || href === "/admin") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="desk-viewport hidden md:flex">
      <div className="desk-window">
        <header className="desk-divide flex shrink-0 items-center gap-2 border-b px-5 py-2.5">
          <div aria-hidden="true" className="flex shrink-0 items-center gap-2">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>

          <nav
            aria-label={role === "superadmin" ? "Navigasi admin" : "Navigasi utama"}
            className="flex min-w-0 flex-1 items-center justify-center gap-1"
          >
            {tabs.map((tab) => {
              const active = isActive(tab.href, tab.hash);
              const showDot = tab.dot && badgeCount > 0;
              return (
                <Link
                  key={tab.key}
                  href={tab.hash ? `${tab.href}${tab.hash}` : tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "transition-soft relative flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 text-sm whitespace-nowrap",
                    active ? "font-medium text-[#2f7bff]" : "text-[#3c4257] hover:text-foreground dark:text-[#c3c9d8]"
                  )}
                >
                  {tab.label}
                  {showDot && (
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-[#2f7bff]" />
                  )}
                  <span className="sr-only">{showDot ? `, ${badgeCount} baru` : ""}</span>
                  {active && (
                    <motion.span
                      layoutId="desk-tab-ink"
                      aria-hidden="true"
                      className="absolute inset-x-3 -bottom-[9px] h-[2.5px] rounded-full bg-[#2f7bff]"
                      transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.9 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="relative w-56 shrink-0 lg:w-72">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              role="searchbox"
              aria-label="Cari"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search"
              className="h-10 w-full rounded-xl border border-transparent bg-white/60 pr-9 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:border-[#2f7bff]/40 dark:bg-white/10"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Bersihkan pencarian"
                className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setTheme(dark ? "light" : "dark")}
            aria-label={dark ? "Matikan mode gelap" : "Nyalakan mode gelap"}
            className="transition-soft flex size-10 shrink-0 items-center justify-center rounded-full text-[#3c4257] hover:bg-white/60 hover:text-foreground dark:text-[#c3c9d8] dark:hover:bg-white/10"
          >
            {dark ? (
              <Sun aria-hidden="true" className="size-5" />
            ) : (
              <Moon aria-hidden="true" className="size-5" />
            )}
          </button>
          <Link
            href={bellHref}
            aria-label={badgeCount > 0 ? `Notifikasi, ${badgeCount} baru` : "Notifikasi"}
            className="transition-soft relative flex size-10 shrink-0 items-center justify-center rounded-full text-[#3c4257] hover:bg-white/60 hover:text-foreground dark:text-[#c3c9d8] dark:hover:bg-white/10"
          >
            {badgeCount > 0 ? (
              <HiBell aria-hidden="true" className="size-5" />
            ) : (
              <HiOutlineBell aria-hidden="true" className="size-5" />
            )}
            {badgeCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-0.5 right-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#2f7bff] px-1 text-[10px] font-semibold text-white"
              >
                {badge}
              </span>
            )}
          </Link>
          <Link
            href="/anda"
            aria-label="Akun Anda"
            className="transition-soft flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/60 dark:hover:bg-white/10"
          >
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white"
            >
              {initial}
            </span>
          </Link>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="desk-divide desk-side hidden w-52 shrink-0 overflow-y-auto border-r px-3 py-4 md:block lg:w-60">
            {sections.map((section) => (
              <div key={section.title} className="mt-5 first:mt-0">
                <p className="px-3 text-xs text-[#8a90a6]">{section.title}</p>
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const active = sideActive(item);
                    const Icon = active ? item.ActiveIcon : item.IdleIcon;
                    const showBadge = item.badge && badgeCount > 0;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "transition-soft relative flex min-h-[40px] items-center gap-3 rounded-xl px-3 text-[13.5px] whitespace-nowrap",
                          active
                            ? "font-medium text-foreground"
                            : "text-[#3c4257] hover:text-foreground dark:text-[#c3c9d8]"
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="desk-side-pill"
                            aria-hidden="true"
                            className="absolute inset-0 rounded-xl bg-white/85 shadow-sm dark:bg-white/10"
                            transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.9 }}
                          />
                        )}
                        <Icon aria-hidden="true" className="relative size-[18px] shrink-0" />
                        <span className="relative min-w-0 flex-1 truncate">{item.label}</span>
                        {showBadge && (
                          <span
                            aria-hidden="true"
                            className="relative flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#2f7bff] px-1 text-[10px] font-semibold text-white"
                          >
                            {badge}
                          </span>
                        )}
                        <span className="sr-only">
                          {showBadge ? `, ${badgeCount} baru` : ""}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
