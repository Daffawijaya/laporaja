"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HiBell, HiOutlineBell } from "react-icons/hi2";

import { cn } from "@/lib/utils";
import type { Role } from "@/lib/supabase/database.types";

interface NavLink {
  key: string;
  label: string;
  href: string;
  hash?: string;
}

const USER_LINKS: NavLink[] = [
  { key: "beranda", label: "Beranda", href: "/" },
  { key: "indikator", label: "Indikator", href: "/laporan", hash: "#indikator" },
  { key: "notifikasi", label: "Notifikasi", href: "/laporan/notifikasi" },
  { key: "anda", label: "Anda", href: "/anda" },
];

const ADMIN_LINKS: NavLink[] = [
  { key: "beranda", label: "Beranda", href: "/admin" },
  { key: "laporan", label: "Laporan", href: "/admin/laporan" },
  { key: "users", label: "Pengguna", href: "/admin/users" },
  { key: "bidang", label: "Bidang", href: "/admin/bidang" },
  { key: "indikator", label: "Indikator", href: "/admin/indikator" },
];

// Navbar desktop floating liquid glass ala iPhone: bar kaca mengambang,
// logo kiri, menu tengah, bel badge dan avatar kanan.
// Hanya tampil di desktop, mobile memakai topbar dan bottom nav.
export function DesktopNavbar({
  role,
  username,
  badgeCount,
}: {
  role: Role;
  username: string;
  badgeCount: number;
}) {
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

  const links = role === "superadmin" ? ADMIN_LINKS : USER_LINKS;
  const bellHref = role === "superadmin" ? "/admin/laporan" : "/laporan/notifikasi";
  const initial = (username.charAt(0) || "?").toUpperCase();
  const badge = badgeCount > 9 ? "9+" : String(badgeCount);

  function isActive(link: NavLink): boolean {
    if (link.hash) return pathname === link.href && hash === link.hash;
    if (link.href === "/" || link.href === "/admin") return pathname === link.href;
    return pathname === link.href || pathname.startsWith(`${link.href}/`);
  }

  return (
    <div className="hidden px-8 pt-4 md:block">
      <nav
        aria-label={role === "superadmin" ? "Navigasi admin" : "Navigasi utama"}
        className="glass-nav mx-auto flex max-w-4xl items-center gap-1 rounded-2xl px-3 py-2"
      >
        <Link
          href="/"
          className="mr-2 shrink-0 px-2 text-[15px] font-semibold tracking-tight transition-soft hover:opacity-70"
        >
          LaporAja
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-1">
          {links.map((link) => {
            const active = isActive(link);
            return (
              <Link
                key={link.key}
                href={link.hash ? `${link.href}${link.hash}` : link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "transition-soft flex min-h-[40px] items-center rounded-full px-4 text-sm whitespace-nowrap",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <Link
          href={bellHref}
          aria-label={badgeCount > 0 ? `Notifikasi, ${badgeCount} baru` : "Notifikasi"}
          className="relative flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-soft hover:bg-muted/60 hover:text-foreground"
        >
          {badgeCount > 0 ? (
            <HiBell aria-hidden="true" className="size-5" />
          ) : (
            <HiOutlineBell aria-hidden="true" className="size-5" />
          )}
          {badgeCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-0.5 right-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[10px] font-semibold text-white"
            >
              {badge}
            </span>
          )}
        </Link>
        <Link
          href="/anda"
          aria-label="Akun Anda"
          className="flex size-10 shrink-0 items-center justify-center rounded-full transition-soft hover:bg-muted/60"
        >
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white"
          >
            {initial}
          </span>
        </Link>
      </nav>
    </div>
  );
}
