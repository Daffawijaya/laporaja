"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/laporan", label: "Laporan" },
  { href: "/admin/users", label: "Pengguna" },
  { href: "/admin/bidang", label: "Bidang" },
  { href: "/admin/indikator", label: "Indikator" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi admin"
      className="mb-8 flex gap-1 rounded-lg border border-border bg-muted/70 p-1"
    >
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "transition-soft flex min-h-[44px] flex-1 items-center justify-center rounded-md px-3 text-sm whitespace-nowrap",
              active
                ? "shadow-subtle bg-surface font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
