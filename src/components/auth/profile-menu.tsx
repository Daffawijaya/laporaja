"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";

import {
  DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  applyLiquidGlass,
} from "@/lib/liquid-glass";
import { createClient } from "@/lib/supabase/client";
import { MANUAL_SIGNOUT_KEY } from "@/components/auth/auth-listener";
import { getSignedImageUrl } from "@/lib/supabase/storage";
import { cn } from "@/lib/utils";
import "../ui/glass-select.css";

// Config kaca SAMA PERSIS panel dropdown (glass-select.tsx / glass-menu.tsx)
// supaya menu profil terlihat seperti komponen dropdown itu.
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
const MIN_PANEL_W = 224;
const MAX_PANEL_H = 360;
// Panel tetap ter-mount selama animasi keluar (sama glass-select, WAJIB >=
// --gsp-close-ms 380ms).
const EXIT_MS = 400;

// Panel fixed rata-kanan terhadap trigger (avatar di ujung navbar),
// logika flip/ukur sama seperti placePanel() di glass-menu.tsx.
function placePanel(trigger: HTMLElement | null, panel: HTMLElement | null) {
  if (!trigger || !panel) return;
  const rect = trigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const width = Math.max(trigger.offsetWidth, MIN_PANEL_W);
  const maxHeight = Math.min(MAX_PANEL_H, Math.max(below, above));
  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${maxHeight}px`;
  const height = panel.offsetHeight;
  const flip = height > below && above > below;
  const top = flip ? Math.max(EDGE, rect.top - GAP - height) : rect.bottom + GAP;
  const left = Math.min(
    Math.max(EDGE, rect.right - width),
    Math.max(EDGE, window.innerWidth - width - EDGE)
  );
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.transformOrigin = flip ? "bottom right" : "top right";

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

// Menu avatar navbar: diklik membuka dropdown kaca (bukan pindah halaman).
// Isi: foto + nama + bidang, divide-y, lalu opsi Pengaturan dan Keluar.
export function ProfileMenu({
  initial,
  buttonClassName,
  avatarClassName,
}: {
  /** Inisial tampil sebelum profil termuat / tanpa foto. */
  initial: string;
  /** Kelas tombol trigger (mengikuti chrome masing-masing topbar). */
  buttonClassName?: string;
  /** Kelas lingkaran avatar (mengikuti chrome masing-masing topbar). */
  avatarClassName?: string;
}) {
  const router = useRouter();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef(0);

  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [nama, setNama] = React.useState<string | null>(null);
  const [bidang, setBidang] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);

  // Profil ringkas untuk isi dropdown (nama, bidang, foto).
  React.useEffect(() => {
    let hidup = true;
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !hidup) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("nama, foto, bidang_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!hidup || !profile) return;
      setNama(profile.nama);
      if (profile.bidang_id) {
        const { data: row } = await supabase
          .from("bidang")
          .select("nama")
          .eq("id", profile.bidang_id)
          .maybeSingle();
        if (hidup) setBidang(row?.nama ?? null);
      }
      if (profile.foto) {
        const signed = await getSignedImageUrl(supabase, profile.foto);
        if (hidup) setUrl(signed);
      }
    })();
    return () => {
      hidup = false;
    };
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    const panel = panelRef.current;
    if (!panel) return;
    placePanel(triggerRef.current, panel);
    const handle = applyLiquidGlass(panel, () => GLASS_CONFIG);
    return () => handle.destroy();
  }, [mounted]);

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

  function close() {
    setOpen(false);
    setShown(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMounted(false), EXIT_MS);
  }

  function openPanel() {
    window.clearTimeout(closeTimer.current);
    setCursor(0);
    setMounted(true);
    setOpen(true);
  }

  async function keluar() {
    if (busy) return;
    setBusy(true);
    try {
      // Tandai keluar sengaja agar tidak ditampilkan sebagai sesi berakhir.
      window.sessionStorage.setItem(MANUAL_SIGNOUT_KEY, "1");
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Diabaikan: pengguna tetap diarahkan ke halaman masuk.
    } finally {
      close();
      router.push("/login");
      router.refresh();
    }
  }

  function kePengaturan() {
    close();
    router.push("/anda");
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
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        openPanel();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        openPanel();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setCursor((c) => Math.min(1, c + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (cursor === 0) kePengaturan();
        else void keluar();
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Menu akun"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={onTriggerKeyDown}
        className={buttonClassName}
      >
        <span aria-hidden="true" className={avatarClassName}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full rounded-full object-cover" />
          ) : (
            initial
          )}
        </span>
      </button>

      {mounted ? (
        <div ref={panelRef} data-radius="24" className={cn("gsp-panel", shown && "gsp-open")}>
          <div className="gsp-list">
            <div className="divide-y divide-neutral-200/70 dark:divide-white/10">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600 dark:bg-white/15 dark:text-white">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="size-full object-cover" />
                  ) : (
                    (nama?.charAt(0) || initial || "?").toUpperCase()
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {nama ?? "Akun"}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    {bidang ?? "Tanpa bidang"}
                  </span>
                </span>
              </div>
              <div role="menu" aria-label="Menu akun" className="py-1">
                <Link
                  href="/anda"
                  role="menuitem"
                  data-active={cursor === 0 ? "true" : "false"}
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerEnter={() => setCursor(0)}
                  onClick={kePengaturan}
                  className="gsp-item"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex shrink-0 items-center opacity-70 [&_svg]:size-4">
                      <Settings aria-hidden="true" />
                    </span>
                    <span className="truncate">Pengaturan</span>
                  </span>
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  data-active={cursor === 1 ? "true" : "false"}
                  disabled={busy}
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerEnter={() => setCursor(1)}
                  onClick={() => void keluar()}
                  className="gsp-item w-full"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex shrink-0 items-center text-danger opacity-70 [&_svg]:size-4">
                      <LogOut aria-hidden="true" />
                    </span>
                    <span className="truncate text-danger">
                      {busy ? "Keluar…" : "Keluar"}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
