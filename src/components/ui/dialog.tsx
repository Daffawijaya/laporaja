"use client";

import { useEffect, useId } from "react";

// Dialog sederhana ala sheet bawah pada mobile, terpusat pada desktop.
// Alasan: satu pola dialog untuk seluruh form admin tanpa dependensi baru.
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

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="shadow-subtle relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-white px-6 py-6"
      >
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
