"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { useStandalone } from "@/lib/standalone";

// Tarikan mentah (px) untuk memicu refresh.
const AMBANG = 90;
// Konstanta redaman visual: offset = REDAM * (1 - e^(-mentah / REDAM)).
const REDAM = 140;
// Posisi spinner saat memutar.
const POSISI_SEGAR = 56;
// Lama minimum spinner terlihat (msec) karena router.refresh() tak awaitable.
const SEGER_MS = 1400;

// Zona yang gesturnya tidak dibajak (form, dialog, menu popover).
const ZONA_ABAIKAN =
  'input, textarea, select, [contenteditable="true"], [role="dialog"], [data-radix-popper-content-wrapper]';

// Scroller vertikal terdekat dari titik sentuh; null = scroller jendela;
// "abaikan" = gestur tidak diganggu.
function cariScroller(target: EventTarget | null): HTMLElement | null | "abaikan" {
  const el = target instanceof HTMLElement ? target : null;
  if (el?.closest(ZONA_ABAIKAN)) return "abaikan";
  let n = el;
  while (n && n !== document.body) {
    const oy = window.getComputedStyle(n).overflowY;
    if (
      (oy === "auto" || oy === "scroll") &&
      n.scrollHeight > n.clientHeight + 4
    ) {
      return n;
    }
    n = n.parentElement;
  }
  return null;
}

function diAtas(scroller: HTMLElement | null): boolean {
  if (!scroller) {
    const d = document.scrollingElement;
    return (d ? d.scrollTop : window.scrollY) <= 1;
  }
  return scroller.scrollTop <= 1;
}

// Pull-to-refresh ala aplikasi mobile: tarik ke bawah dari posisi paling
// atas → spinner lingkaran → lepas melewati ambang → refresh data.
// Aktif HANYA di PWA standalone + sentuhan (browser mobile memakai
// pull-to-refresh bawaan; mouse tidak memicu gestur sentuh).
export function PullToRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const standalone = useStandalone();
  // Offset visual spinner (px dari posisi parkir).
  const [tarik, setTarik] = useState(0);
  const [menyegarkan, setMenyegarkan] = useState(false);
  const status = useRef({
    awalY: 0,
    id: -1,
    scroller: null as HTMLElement | null,
    aktif: false,
    mentah: 0,
  });
  const sibuk = useRef(false);
  const timer = useRef(0);

  // Reset tiap pindah halaman supaya spinner tak nyangkut: state via
  // render-phase sync ala codebase, ref/timer via effect (tanpa setState).
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setMenyegarkan(false);
    setTarik(0);
  }
  useEffect(() => {
    status.current.aktif = false;
    status.current.mentah = 0;
    sibuk.current = false;
    window.clearTimeout(timer.current);
  }, [pathname]);

  useEffect(() => {
    if (!standalone) return;

    const mulai = (event: TouchEvent) => {
      if (event.touches.length !== 1 || sibuk.current) return;
      const sentuh = event.touches[0];
      const scroller = cariScroller(event.target);
      if (scroller === "abaikan") return;
      if (!diAtas(scroller)) return;
      status.current = {
        awalY: sentuh.clientY,
        id: sentuh.identifier,
        scroller,
        aktif: true,
        mentah: 0,
      };
    };

    const gerak = (event: TouchEvent) => {
      const st = status.current;
      if (!st.aktif || event.touches.length !== 1) {
        if (st.aktif) {
          st.aktif = false;
          st.mentah = 0;
          setTarik(0);
        }
        return;
      }
      const sentuh = event.touches[0];
      if (sentuh.identifier !== st.id) return;
      // Konten ikut bergulir (mis. momentum): lepas, biarkan scroll alami.
      if (!diAtas(st.scroller)) {
        st.aktif = false;
        st.mentah = 0;
        setTarik(0);
        return;
      }
      const delta = sentuh.clientY - st.awalY;
      if (delta <= 4) {
        if (st.mentah !== 0) {
          st.mentah = 0;
          setTarik(0);
        }
        return;
      }
      // Tarikan ke bawah dari puncak: tahan scroll bawaan, tampilkan spinner.
      event.preventDefault();
      st.mentah = delta;
      setTarik(Math.round(REDAM * (1 - Math.exp(-delta / REDAM))));
    };

    const lepas = () => {
      const st = status.current;
      if (!st.aktif) return;
      st.aktif = false;
      const mentah = st.mentah;
      st.mentah = 0;
      if (mentah >= AMBANG && !sibuk.current) {
        sibuk.current = true;
        setMenyegarkan(true);
        setTarik(POSISI_SEGAR);
        router.refresh();
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          sibuk.current = false;
          setMenyegarkan(false);
          setTarik(0);
        }, SEGER_MS);
      } else {
        setTarik(0);
      }
    };

    document.addEventListener("touchstart", mulai, { passive: true });
    document.addEventListener("touchmove", gerak, { passive: false });
    document.addEventListener("touchend", lepas, { passive: true });
    document.addEventListener("touchcancel", lepas, { passive: true });
    return () => {
      document.removeEventListener("touchstart", mulai);
      document.removeEventListener("touchmove", gerak);
      document.removeEventListener("touchcancel", lepas);
      document.removeEventListener("touchend", lepas);
      window.clearTimeout(timer.current);
    };
  }, [standalone, router]);

  if (!standalone || (tarik <= 2 && !menyegarkan)) return null;

  const progres = Math.min(1, tarik / 72);
  return (
    <div
      aria-hidden={!menyegarkan}
      className="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+8px)] left-1/2 z-[100]"
      style={{
        transform: `translate(-50%, ${tarik}px) scale(${0.5 + 0.5 * progres})`,
        opacity: 0.4 + 0.6 * progres,
      }}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-white text-accent shadow-lg dark:bg-neutral-800">
        <RefreshCw
          aria-hidden="true"
          className={`size-5 ${menyegarkan ? "animate-spin" : ""}`}
          style={
            menyegarkan ? undefined : { transform: `rotate(${tarik * 2.4}deg)` }
          }
        />
      </span>
    </div>
  );
}
