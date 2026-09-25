"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

// Baris pengaturan mode gelap di halaman profil.
// Switch bergaya liquid glass lewat class .fx-switch.
export function ThemeSwitchSetting() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const dark = mounted && resolvedTheme === "dark";

  return (
    <div className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">Mode gelap</p>
        <p className="text-xs text-muted-foreground">
          {dark ? "Menyala" : "Mati"}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label="Mode gelap"
        onClick={() => setTheme(dark ? "light" : "dark")}
        className="fx-switch flex h-8 w-[52px] shrink-0 items-center rounded-full border border-border bg-muted px-1"
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-6 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-[160ms] ease-out",
            dark && "translate-x-5"
          )}
        />
      </button>
    </div>
  );
}
