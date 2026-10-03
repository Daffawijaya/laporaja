"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import {
  HiClipboardDocumentCheck,
  HiClipboardDocumentList,
  HiCog,
  HiHome,
  HiOutlineClipboardDocumentCheck,
  HiOutlineClipboardDocumentList,
  HiOutlineCog,
  HiOutlineHome,
  HiOutlineSquares2X2,
  HiOutlineUserCircle,
  HiOutlineUsers,
  HiSquares2X2,
  HiUserCircle,
  HiUsers,
} from "react-icons/hi2";

import {
  LiquidGlassSidebar,
  type LiquidGlassSidebarItem,
} from "@/components/ui/liquid-glass-sidebar";
import { SimpanTeks } from "@/components/ui/simpan-teks";
import { NavbarSearch } from "@/components/layout/navbar-search";
import { ProfileMenu } from "@/components/auth/profile-menu";
import type { Role } from "@/lib/supabase/database.types";

type Icon = React.ComponentType<{ className?: string }>;

interface SideItem {
  key: string;
  label: string;
  href: string;
  ActiveIcon: Icon;
  IdleIcon: Icon;
}

// Judul topbar per halaman (gaya referensi: satu judul besar di kiri).
function refTitle(pathname: string, role: Role): string {
  if (pathname === "/") return "Beranda";
  if (pathname === "/laporan") return "Laporan";
  if (pathname === "/anda") return role === "superadmin" ? "Pengaturan" : "Anda";
  if (pathname === "/admin") return "Dashboard";
  if (pathname === "/admin/users") return "Pengguna";
  if (pathname === "/admin/bidang") return "Bidang";
  if (pathname === "/admin/section") return "Section";
  if (pathname === "/admin/section/baru") return "Buat Section";
  if (pathname === "/admin/laporan") return "Laporan";
  return "Dashboard";
}

// Search navbar kontekstual: hanya di halaman berdaftar (pengguna/bulan) —
// di tempat lain input disembunyikan karena ?q= tidak dibaca siapa pun.
function refSearch(
  pathname: string,
  params: ReadonlyURLSearchParams
): { placeholder: string } | null {
  const punyaPeriode = params.has("tahun") && params.has("bulan");
  switch (pathname) {
    case "/admin/users":
      return { placeholder: "Cari pengguna…" };
    case "/admin/bidang":
      return { placeholder: "Cari bidang…" };
    case "/admin/section":
      return { placeholder: "Cari section…" };
    case "/admin/laporan":
      // Detail isian (?tahun&bulan&user): tanpa daftar.
      if (punyaPeriode && params.has("user")) return null;
      return { placeholder: punyaPeriode ? "Cari pengguna…" : "Cari bulan…" };
    case "/laporan":
      return punyaPeriode ? null : { placeholder: "Cari bulan…" };
    default:
      return null;
  }
}

// Chrome desktop ala referensi: bg abu flat, sidebar kiri (logo, menu pill,
// ikon bawah), topbar (judul besar, search pill, tombol Create hitam, bel,
// pesan, avatar). Hanya tampil di desktop, mobile memakai topbar + bottom nav.
export function DesktopWindow({
  role,
  username,
  children,
}: {
  role: Role;
  username: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const isAdmin = role === "superadmin";
  const initial = (username.charAt(0) || "?").toUpperCase();
  const dark = mounted && resolvedTheme === "dark";
  const title = refTitle(pathname, role);
  const searchCfg = refSearch(pathname, searchParams);

  const menu: SideItem[] = isAdmin
    ? [
        { key: "beranda", label: "Dashboard", href: "/admin", ActiveIcon: HiHome, IdleIcon: HiOutlineHome },
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
        { key: "anda", label: "Pengaturan", href: "/anda", ActiveIcon: HiCog, IdleIcon: HiOutlineCog },
      ]
    : [
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

  function menuActive(item: SideItem): boolean {
    if (item.href === "/" || item.href === "/admin") return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  const activeKey = menu.find((item) => menuActive(item))?.key ?? "";
  const sidebarItems: LiquidGlassSidebarItem[] = menu.map((item) => ({
    key: item.key,
    label: item.label,
    href: item.href,
    IdleIcon: item.IdleIcon,
    ActiveIcon: item.ActiveIcon,
  }));

  return (
    <div className="ref-shell hidden md:flex">
      {/* Sidebar kiri ala referensi */}
      <aside className="flex w-[260px] shrink-0 flex-col gap-1 overflow-y-auto px-4 py-2">
        <Link href={isAdmin ? "/admin" : "/"} aria-label="LaporAja beranda" className="flex min-h-[60px] items-center">
          {/* Wordmark punya dua berkas: terang untuk mode terang, gelap untuk
              mode gelap. Ditukar lewat kelas dark, bukan state JS, supaya tidak
              ada kedipan sesudah hidrasi. */}
          <Image
            src="/logolight.png"
            alt="LaporAja"
            width={1697}
            height={372}
            priority
            className="h-6 w-auto dark:hidden"
          />
          <Image
            src="/logodark.png"
            alt=""
            aria-hidden="true"
            width={1697}
            height={372}
            priority
            className="hidden h-6 w-auto dark:block"
          />
        </Link>

        <nav aria-label={isAdmin ? "Navigasi admin" : "Navigasi utama"} className="mt-3">
          <LiquidGlassSidebar
            ariaLabel={isAdmin ? "Navigasi admin" : "Navigasi utama"}
            value={activeKey}
            items={sidebarItems}
          />
        </nav>
      </aside>

      {/* Kolom kanan: block (bukan flex-col) agar sticky header ter-render
          benar. Blur langsung di header, bukan lapisan absolute terpisah. */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <header className="ref-navbar shrink-0">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: dark
                ? "linear-gradient(to bottom, rgb(16 16 20 / 0.8) 0%, rgb(16 16 20 / 0) 100%)"
                : "linear-gradient(to bottom, rgb(242 241 247 / 0.8) 0%, rgb(242 241 247 / 0) 100%)",
              backdropFilter: "blur(3px) saturate(1.5)",
              WebkitBackdropFilter: "blur(3px) saturate(1.5)",
              WebkitMaskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
              maskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
            }}
          />
          <div className="relative flex items-center gap-3 px-4 pt-4 pb-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="min-w-0 truncate text-[26px] font-semibold tracking-tight">{title}</h1>
            <SimpanTeks />
          </div>

          <NavbarSearch
            role={role}
            placeholder={
              searchCfg?.placeholder ??
              (isAdmin ? "Cari pengguna atau bulan…" : "Cari bulan…")
            }
          />

          <div className="ref-icon-btn-liquid">
          <button
            type="button"
            onClick={() => setTheme(dark ? "light" : "dark")}
            aria-label={dark ? "Matikan mode gelap" : "Nyalakan mode gelap"}
            className="ref-icon-btn-plain"
          >
            {dark ? (
              <Sun aria-hidden="true" className="size-5" />
            ) : (
              <Moon aria-hidden="true" className="size-5" />
            )}
          </button>
          </div>
          <div className="ref-icon-btn-liquid ref-profile-bare shrink-0">
            <ProfileMenu
              initial={initial}
              buttonClassName="ref-icon-btn-plain"
              avatarClassName="flex size-11 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600 dark:bg-white/15 dark:text-white"
            />
          </div>
          </div>
        </header>

        <main className="px-4 pb-6">{children}</main>
      </div>
    </div>
  );
}
