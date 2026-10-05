"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import {
  DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  applyLiquidGlass,
} from "@/lib/liquid-glass";
import { createClient } from "@/lib/supabase/client";
import {
  labelPeriode,
  labelStatusReview,
} from "@/lib/laporan-tambahan/queries";
import type { Role } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import "../ui/glass-select.css";

// Config kaca SAMA PERSIS panel dropdown (glass-select.tsx) supaya panel
// hasil search terlihat seperti komponen dropdown itu.
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

// Panel diposisikan fixed di bawah input (bukan absolute) supaya lepas dari
// overflow ancestor — logika flip/ukur sama seperti glass-select.tsx.
function placePanel(trigger: HTMLElement | null, panel: HTMLElement | null) {
  if (!trigger || !panel) return;
  const rect = trigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  const width = Math.max(rect.width, MIN_PANEL_W);
  const maxHeight = Math.min(MAX_PANEL_H, Math.max(below, above));
  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${maxHeight}px`;
  // Ukur setelah maxHeight dipasang → tinggi sudah ter-clamp.
  const height = panel.offsetHeight;
  // Balik ke atas kalau tidak cukup ruang di bawah.
  const flip = height > below && above > below;
  const top = flip
    ? Math.max(EDGE, rect.top - GAP - height)
    : rect.bottom + GAP;
  const left = Math.min(
    Math.max(EDGE, rect.left),
    Math.max(EDGE, window.innerWidth - width - EDGE)
  );
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.transformOrigin = flip ? "bottom left" : "top left";

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

interface Hit {
  key: string;
  section: "bulan" | "pengguna";
  title: string;
  subtitle: string;
  href: string;
}

interface MonthHit {
  tahun: number;
  bulan: number;
  status?: string;
  userCount?: number;
}

interface UserHit {
  id: string;
  nama: string;
  username: string;
  bidangNama: string;
}

const MAKS_PER_SEKSI = 6;

// Search navbar global: tetap tampil di semua halaman. Mengetik memfilter
// daftar di halaman (via ?q=, seperti sebelumnya) SEKALIGUS membuka panel
// hasil berisi bulan + pengguna (admin) atau bulan sendiri (pengguna).
// Enter/panik: buka hasil aktif. Esc: tutup.
export function NavbarSearch({
  role,
  placeholder,
  syncUrl = true,
}: {
  role: Role;
  placeholder: string;
  /** false = mode lokal saja: jangan baca/tulis ?q= (mis. halaman tanpa daftar). */
  syncUrl?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Nilai ?q= (debounce), tetap ditulis agar daftar di halaman ikut tersaring.
  // Mode lokal (syncUrl=false): input murni lokal, URL tidak dibaca/ditulis
  // supaya tidak keisi sisa query seperti /anda?q=superadmin.
  const urlQ = syncUrl ? (searchParams.get("q") ?? "") : "";
  const [q, setQ] = React.useState(syncUrl ? urlQ : "");
  const [prevUrlQ, setPrevUrlQ] = React.useState(urlQ);
  // Selaraskan ketikan dengan URL saat navigasi (back/forward, clear).
  if (syncUrl && urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    setQ(urlQ);
  }
  React.useEffect(() => {
    if (!syncUrl) return;
    if (q === urlQ) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q, urlQ, pathname, router, searchParams, syncUrl]);

  // Mode lokal: bersihkan sisa ?q= di URL (mis. /anda?q=superadmin → /anda),
  // tanpa mengisi input. Pertahankan param lain (tahun/bulan/user).
  React.useEffect(() => {
    if (syncUrl) return;
    if (!searchParams.has("q")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [syncUrl, pathname, router, searchParams]);

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  // `open` = state logika, `shown` = gate kelas .gsp-open (pola glass-select).
  const [shown, setShown] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [months, setMonths] = React.useState<MonthHit[]>([]);
  const [users, setUsers] = React.useState<UserHit[]>([]);

  // Muat sekali saat mount (RLS yang membatasi: admin melihat semua,
  // pengguna hanya miliknya sendiri).
  React.useEffect(() => {
    let hidup = true;
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !hidup) return;
        if (role === "superadmin") {
          const [usersRes, monthsRes, bidangRes] = await Promise.all([
            supabase
              .from("profiles")
              .select("id, nama, username, bidang_id")
              .eq("role", "user")
              .order("nama")
              .limit(100),
            supabase.from("monthly_reviews").select("tahun, bulan, user_id").limit(2000),
            supabase.from("bidang").select("id, nama"),
          ]);
          if (!hidup) return;
          const namaByBidang = new Map(
            (bidangRes.data ?? []).map((row) => [row.id, row.nama])
          );
          setUsers(
            (usersRes.data ?? []).map((row) => ({
              id: row.id,
              nama: row.nama,
              username: row.username,
              bidangNama:
                (row.bidang_id && namaByBidang.get(row.bidang_id)) || "Tanpa bidang",
            }))
          );
          const penggunaPerBulan = new Map<string, Set<string>>();
          for (const row of monthsRes.data ?? []) {
            const kunci = `${row.tahun}-${row.bulan}`;
            const set = penggunaPerBulan.get(kunci) ?? new Set<string>();
            set.add(row.user_id);
            penggunaPerBulan.set(kunci, set);
          }
          setMonths(
            [...penggunaPerBulan]
              .map(([kunci, pengguna]) => {
                const [tahun, bulan] = kunci.split("-").map(Number);
                return { tahun, bulan, userCount: pengguna.size };
              })
              .sort((a, b) => b.tahun - a.tahun || b.bulan - a.bulan)
          );
        } else {
          const { data } = await supabase
            .from("monthly_reviews")
            .select("tahun, bulan, status")
            .eq("user_id", user.id)
            .order("tahun", { ascending: false })
            .order("bulan", { ascending: false })
            .limit(100);
          if (!hidup) return;
          setMonths(
            (data ?? []).map((row) => ({
              tahun: row.tahun,
              bulan: row.bulan,
              status: row.status,
            }))
          );
          setUsers([]);
        }
      } finally {
        if (hidup) setLoading(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [role]);

  const query = q.trim().toLowerCase();
  const monthHits: Hit[] = query
    ? months
        .filter(
          (row) =>
            labelPeriode(row).toLowerCase().includes(query) ||
            String(row.tahun).includes(query)
        )
        .slice(0, MAKS_PER_SEKSI)
        .map((row) => ({
          key: `bulan-${row.tahun}-${row.bulan}`,
          section: "bulan" as const,
          title: labelPeriode(row),
          subtitle:
            role === "superadmin"
              ? `${row.userCount ?? 0} pengguna`
              : labelStatusReview(row.status ?? "menunggu"),
          href:
            role === "superadmin"
              ? `/admin/laporan?tahun=${row.tahun}&bulan=${row.bulan}`
              : `/laporan?tahun=${row.tahun}&bulan=${row.bulan}`,
        }))
    : [];
  const userHits: Hit[] =
    query && role === "superadmin"
      ? users
          .filter(
            (row) =>
              row.nama.toLowerCase().includes(query) ||
              row.username.toLowerCase().includes(query)
          )
          .slice(0, MAKS_PER_SEKSI)
          .map((row) => ({
            key: `user-${row.id}`,
            title: row.nama,
            section: "pengguna" as const,
            subtitle: `@${row.username} · ${row.bidangNama}`,
            href: `/admin/laporan?user=${row.id}`,
          }))
      : [];
  const flat: Hit[] = [...monthHits, ...userHits];
  // Jepit kursor ke hasil yang ada (query berubah / daftar menyusut).
  const aktif = Math.min(cursor, Math.max(0, flat.length - 1));
  const tampil = open && query.length > 0;

  // Pasang/delepas node kaca + hitung posisi begitu panel mount.
  React.useEffect(() => {
    if (!mounted) return;
    const panel = panelRef.current;
    if (!panel) return;
    placePanel(wrapRef.current, panel);
    const handle = applyLiquidGlass(panel, () => GLASS_CONFIG);
    return () => handle.destroy();
  }, [mounted]);

  // Blob → panel: nyalakan .gsp-open setelah dua frame.
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

  // Ikuti trigger saat halaman/scroll digeser.
  React.useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    const update = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        placePanel(wrapRef.current, panelRef.current);
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
    // Mode lokal (mis. /anda): tidak ada daftar yang difilter, jadi ketikan
    // ikut dibuang saat panel ditutup supaya search kembali kosong.
    if (!syncUrl) setQ("");
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMounted(false), EXIT_MS);
  }

  function openPanel() {
    window.clearTimeout(closeTimer.current);
    setCursor(0);
    setMounted(true);
    setOpen(true);
  }

  function pilih(href: string) {
    // Bersihkan ketikan supaya halaman tujuan tiba tanpa sisa filter.
    // (Effect debounce ikut cleanup via render ulang sesudah navigasi.)
    setQ("");
    close();
    router.push(href);
  }

  // Tutup panel + kosongkan ketikan saat pindah halaman (render-phase sync
  // ala codebase). Mode syncUrl tetap mengandalkan sinkron urlQ di atas;
  // mode lokal dibersihkan manual karena tidak membaca URL.
  const [prevPath, setPrevPath] = React.useState(pathname);
  const [prevSync, setPrevSync] = React.useState(syncUrl);
  if (prevPath !== pathname || prevSync !== syncUrl) {
    setPrevPath(pathname);
    setPrevSync(syncUrl);
    setOpen(false);
    setShown(false);
    setMounted(false);
    // Selalu kosongkan: pindah ke halaman tanpa daftar (syncUrl mati,
    // mis. daftar → detail di pathname yang sama) tidak boleh membawa
    // sisa ketikan seperti "superadmin".
    setQ("");
  }

  // Klik di luar input + panel → tutup.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
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

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openPanel();
      else setCursor((c) => Math.min(flat.length - 1, c + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (event.key === "Enter") {
      const hit = flat[aktif];
      if (open && hit) {
        event.preventDefault();
        pilih(hit.href);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  return (
    <>
      <div ref={wrapRef} className="ref-search-wrap relative w-56 shrink-0 lg:w-72">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-neutral-400"
        />
        <input
          ref={inputRef}
          type="search"
          name="pencarian-navbar"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-label={placeholder}
          aria-expanded={tampil}
          aria-controls={tampil ? "navbar-search-list" : undefined}
          aria-activedescendant={tampil && flat[aktif] ? flat[aktif].key : undefined}
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            openPanel();
          }}
          onFocus={() => {
            if (q.trim()) openPanel();
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="ref-search"
        />
      </div>

      {mounted && tampil ? (
        <div ref={panelRef} data-radius="24" className={cn("gsp-panel", shown && "gsp-open")}>
          <div id="navbar-search-list" role="listbox" aria-label={placeholder} className="gsp-list">
            {loading ? (
              <p className="px-3 py-2 text-sm text-neutral-500">Memuat…</p>
            ) : flat.length === 0 ? (
              <p className="px-3 py-2 text-sm text-neutral-500">
                Tidak ada bulan atau pengguna yang cocok dengan &ldquo;{q.trim()}&rdquo;.
              </p>
            ) : (
              <>
                {monthHits.length > 0 ? (
                  <div>
                    <p className="px-3 pt-2 text-[11px] font-medium text-neutral-400">Bulan</p>
                    {monthHits.map((hit, idx) => (
                      <Link
                        key={hit.key}
                        id={hit.key}
                        href={hit.href}
                        data-active={idx === aktif ? "true" : "false"}
                        onPointerDown={(event) => event.preventDefault()}
                        onPointerEnter={() => setCursor(idx)}
                        onClick={() => pilih(hit.href)}
                        className="gsp-item"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{hit.title}</span>
                          <span className="block truncate text-xs text-neutral-500">
                            {hit.subtitle}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}
                {role === "superadmin" && userHits.length > 0 ? (
                  <div>
                    <p className="px-3 pt-2 text-[11px] font-medium text-neutral-400">Pengguna</p>
                    {userHits.map((hit, i) => {
                      const idx = monthHits.length + i;
                      return (
                        <Link
                          key={hit.key}
                          id={hit.key}
                          href={hit.href}
                          data-active={idx === aktif ? "true" : "false"}
                          onPointerDown={(event) => event.preventDefault()}
                          onPointerEnter={() => setCursor(idx)}
                          onClick={() => pilih(hit.href)}
                          className="gsp-item"
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{hit.title}</span>
                            <span className="block truncate text-xs text-neutral-500">
                              {hit.subtitle}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
