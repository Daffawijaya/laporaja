"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  applyLiquidGlass,
  type LiquidGlassHandle,
} from "@/lib/liquid-glass";
import { useOverlay } from "@/components/ui/overlay-host";
import { cn } from "@/lib/utils";

// Config kaca SALINAN panel dropdown (glass-select.tsx) supaya ujung modal
// merefraksi persis sama: tanpa tint biru, tanpa kilau, blur tipis.
const MODAL_GLASS_CONFIG = {
  ...DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG,
  glassThickness: 24,
  blur: 0.6,
  specularOpacity: 0,
  specularSat: 0,
  tintColor: "255,255,255",
  tintOpacity: 0,
  balancedSpecular: true,
};

// Dialog sederhana ala sheet bawah pada mobile, terpusat pada desktop.
// Kaca tepi 1:1 panel dropdown: cangkang + applyLiquidGlass, TANPA lapisan
// FxFilter ganda (--fx-filter tidak dipakai di sini supaya dark mode tidak
// ketumpuk overlay hitam). Buka (desktop): zoom-out besar→normal + fade
// yang cepat dan mulus (satu tween 240ms); tutup: fade opacity saja
// tanpa gerak.
// Alasan: satu pola dialog untuk seluruh form admin. Hanya animasi
// transform/opacity/filter (tanpa menyentuh width/height/border-radius)
// agar tidak regenerasi displacement map selama animasi berjalan.
// Baca sinkron saat init (bukan false dulu lalu effect) agar varian yang
// benar langsung dipakai di frame pertama. Effect di bawah tetap dipakai
// untuk perubahan ukuran layar. Diekspor untuk dipakai shell responsif.
export function useDesktop() {
  const [desktop, setDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 640px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

// Kunci remount untuk modal yang selalu ke-mount (pola open boolean).
// Diubah SETIAP dibuka (state form segar), dibiarkan saat ditutup agar
// exit animation AnimatePresence sempat jalan sampai selesai.
// Alasan: key yang dihitung dari state dialog (misal "closed" saat tutup)
// me-remount tepat saat close sehingga animasi tutup hilang. Itu yang
// terjadi di halaman pengguna/kegiatan sebelum pola ini dipakai.
export function useModalKey() {
  const [key, setKey] = useState("closed");
  const count = useRef(0);
  const reopen = useCallback((base: string) => {
    count.current += 1;
    setKey(`${base}-${count.current}`);
  }, []);
  return [key, reopen] as const;
}
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const glassHandleRef = useRef<LiquidGlassHandle | null>(null);
  const isDesktop = useDesktop();
  const reduceMotion = !!useReducedMotion();
  // Overlay global (hitam 5%): acquire selama modal tampil. Pindah
  // modal→modal tidak memicu fade karena counter tidak pernah 0.
  useOverlay(open);
  // will-change dicabut sesudah animasi buka selesai: selama menempel,
  // panel menjadi containing block bagi dropdown fixed (GlassSelect/
  // GlassMenu) sehingga panel dropdown terklip overflow-hidden modal
  // dan terlihat "tidak bisa dibuka". Dialog selalu remount tiap dibuka
  // (AnimatePresence kondisional) jadi state ini segar tiap open.
  const [animDone, setAnimDone] = useState(false);

  // Tunda bangun kaca sampai animasi buka selesai (~260ms):
  // generateDisplacementMap di lib me-loop per-piksel secara sinkron di main
  // thread — kalau jalan saat mount, animasi buka jank dan kacanya landing
  // telat (pop di akhir animasi). Ref hanya menyimpan node; efek yang pasang
  // timer + destroy (jalan juga saat unmount/sesudah exit, jadi tidak pop).
  const attachGlass = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
  }, []);

  useEffect(() => {
    if (!open) return;
    const node = panelRef.current;
    if (!node) return;
    const timer = window.setTimeout(() => {
      glassHandleRef.current?.destroy();
      glassHandleRef.current = applyLiquidGlass(node, () => MODAL_GLASS_CONFIG);
    }, 260);
    return () => {
      window.clearTimeout(timer);
      glassHandleRef.current?.destroy();
      glassHandleRef.current = null;
    };
  }, [open ]);
  // onClose selalu inline baru tiap render di pemanggil. Simpan di ref agar
  // efek di bawah tidak jalan ulang (dan tidak mencuri fokus) saat mengetik.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="dialog-root"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: {
              duration: reduceMotion ? 0.15 : isDesktop ? 0.32 : 0.24,
            },
          }}
          transition={{ duration: reduceMotion ? 0.15 : 0.2 }}
        >
          <motion.div
            ref={attachGlass}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              // Cangkang persis panel dropdown (.gsp-panel): bg 85% +
              // border putih + shadow yang sama, terang maupun gelap.
              // Kaca refraksi dipasang via applyLiquidGlass (efek timer).
              // dlg-panel = scope gaya tombol & input modal (lihat globals.css).
              "dlg-panel relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden outline-none",
              !animDone && "will-change-transform",
              "rounded-t-[32px] border border-white bg-[#f3f3f3]/85 shadow-[0_1px_4px_rgb(0_0_0/0.05)] sm:rounded-[32px]",
              "dark:border-white/12 dark:bg-[rgb(28_28_30/0.85)] dark:shadow-[0_1px_4px_rgb(0_0_0/0.42)]"
            )}
            style={{ transformOrigin: "center" }}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : isDesktop
                  ? { opacity: 0, scale: 1.07 }
                  : { y: "100%" }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : isDesktop
                  ? { opacity: 1, scale: 1 }
                  : { y: "0%" }
            }
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            onAnimationComplete={() => setAnimDone(true)}
            transition={
              reduceMotion
                ? { duration: 0.15 }
                : isDesktop
                  ? {
                      // Buka: zoom-out besar→normal + fade dalam SATU tween
                      // (fade jangan dibuat terpisah/lebih cepat dari zoom
                      // agar panel tidak keburu 100% di tengah animasi).
                      duration: 0.24,
                      ease: [0.22, 1, 0.36, 1],
                    }
                  : { duration: 0.34, ease: [0.32, 0.72, 0, 1] }
            }
          >
            {/* Tanpa header judul + tombol X: judul hanya untuk pembaca layar. */}
            <h2 id={titleId} className="sr-only">
              {title}
            </h2>
            <div className="overflow-y-auto px-5 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
