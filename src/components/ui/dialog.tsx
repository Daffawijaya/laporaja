"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// Dialog sederhana ala sheet bawah pada mobile, terpusat pada desktop.
// Mobile: sheet solid geser dari bawah. Desktop (sm+): liquid glass via
// .fx-liquid-modal (full copas --fx-filter lab-glass liquid-glass() +
// blur() Dark/Light). Buka dengan spring "blob", tutup mencair seperti
// tetes air ala Apple (squash-stretch + tenggelam + blur).
// Alasan: satu pola dialog untuk seluruh form admin. Hanya animasi
// transform/opacity/filter (tanpa menyentuh width/height/border-radius)
// agar FxFilter tidak regenerasi displacement map selama animasi berjalan.
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
  const isDesktop = useDesktop();
  const reduceMotion = !!useReducedMotion();
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
          <div
            className="absolute inset-0 bg-black/25 sm:backdrop-blur-[2px]"
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "shadow-subtle fx-liquid-modal relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden outline-none",
              "rounded-t-lg border border-border sm:rounded-2xl"
            )}
            style={{ transformOrigin: "center" }}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : isDesktop
                  ? { opacity: 0, scale: 0.86, y: 28 }
                  : { y: "100%" }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : isDesktop
                  ? { opacity: 1, scale: 1, y: 0 }
                  : { y: "0%" }
            }
            exit={
              reduceMotion
                ? { opacity: 0 }
                : isDesktop
                  ? {
                      // Tutup ala tetes air: gepeng dulu (squash-stretch),
                      // lalu menyusut-tenggelam sambil meleleh jadi blur.
                      opacity: [1, 1, 0.85, 0],
                      scaleX: [1, 1.05, 0.94, 0.84],
                      scaleY: [1, 0.93, 0.9, 0.8],
                      y: [0, 4, 12, 30],
                      filter: [
                        "blur(0px)",
                        "blur(2px)",
                        "blur(6px)",
                        "blur(12px)",
                      ],
                      transition: {
                        duration: 0.38,
                        times: [0, 0.3, 0.65, 1],
                        ease: "easeIn",
                      },
                    }
                  : {
                      y: "100%",
                      transition: { duration: 0.24, ease: "easeIn" },
                    }
            }
            transition={
              reduceMotion
                ? { duration: 0.15 }
                : isDesktop
                  ? {
                      type: "spring",
                      stiffness: 420,
                      damping: 34,
                      mass: 0.9,
                      opacity: { duration: 0.22 },
                    }
                  : { duration: 0.34, ease: [0.32, 0.72, 0, 1] }
            }
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <h2
                id={titleId}
                className="text-base font-semibold tracking-tight"
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="transition-soft -mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
