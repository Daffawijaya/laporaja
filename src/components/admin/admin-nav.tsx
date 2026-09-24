"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/laporan", label: "Laporan" },
  { href: "/admin/users", label: "Pengguna" },
  { href: "/admin/bidang", label: "Bidang" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigasi admin" className="mb-6 flex gap-2">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "transition-soft flex min-h-[44px] items-center rounded-md border px-4 text-sm",
              active
                ? "shadow-subtle border-border bg-white font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
