import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface RefListCardItem {
  key: string;
  /** Baris utama. */
  title: string;
  /** Baris kecil abu di bawah title. */
  subtitle?: string;
  /** Baris ketiga abu (gaya Ringkasan). Bila diisi, baris jadi susun vertikal. */
  meta?: string;
  /** Teks kecil di kanan (gaya Kelola, mis. "5 akun"). */
  desc?: string;
  /** Catatan amber di bawah (gaya revisi / notifikasi). */
  note?: string;
  /** Bila diisi, seluruh baris jadi Link. */
  href?: string;
  /** Bila diisi, tampil tombol kecil di kanan (gaya Perlu Review). */
  actionHref?: string;
  actionLabel?: string;
}

interface RefListCardProps {
  items?: RefListCardItem[];
  /** Isi kustom di dalam card (dipakai bila baris butuh badge, gambar, tombol). */
  children?: React.ReactNode;
  /** Judul di LUAR card (opsional). */
  title?: string;
  /** Teks saat daftar kosong (opsional). */
  emptyText?: string;
  ariaLabel: string;
  id?: string;
  /** Spacing section, mis. "mt-3". */
  className?: string;
}

// Satu kartu list super dinamis dengan style baku:
// card ref-card p-4, title di luar, baris divide abu,
// baris pertama tanpa pt, tengah py-3, terakhir tanpa pb.
export function RefListCard({
  items = [],
  children,
  title,
  emptyText,
  ariaLabel,
  id,
  className,
}: RefListCardProps) {
  return (
    <section aria-label={ariaLabel} id={id} className={className}>
      {title && <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>}
      <div className={cn("ref-card p-4", title && "mt-2")}>
        {children != null ? (
          children
        ) : items.length === 0 ? (
          emptyText ? (
            <p className="text-sm text-neutral-500">{emptyText}</p>
          ) : null
        ) : (
          <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
            {items.map((item, i) => {
              const pad =
                i === 0 ? " pb-3" : i === items.length - 1 ? " pt-3" : " py-3";
              const stacked = item.meta != null;
              const linkable = item.href != null && item.actionHref == null;

              const chevron = linkable ? (
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-neutral-400" />
              ) : item.actionHref ? (
                <Link
                  href={item.actionHref}
                  aria-label={item.actionLabel ?? "Lihat"}
                  className="flex shrink-0 items-center justify-center"
                >
                  <ChevronRight aria-hidden="true" className="size-5 text-neutral-400" />
                </Link>
              ) : null;

              const row = stacked ? (
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.title}</span>
                    {item.subtitle && (
                      <span className="mt-0.5 block text-xs text-neutral-500">{item.subtitle}</span>
                    )}
                    <span className="mt-1 block text-sm text-neutral-500">{item.meta}</span>
                  </span>
                  {chevron}
                </span>
              ) : (
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    {item.subtitle && (
                      <span className="mt-0.5 block truncate text-xs text-neutral-500">
                        {item.subtitle}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.desc && (
                      <span className="text-xs text-neutral-500">{item.desc}</span>
                    )}
                    {chevron}
                  </span>
                </span>
              );

              const inner = (
                <>
                  {row}
                  {item.note && (
                    <span className="mt-2 block rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                      {item.note}
                    </span>
                  )}
                </>
              );

              return (
                <li key={item.key}>
                  {linkable ? (
                    <Link
                      href={item.href as string}
                      className={cn(
                        "block px-1 transition-colors hover:text-black dark:hover:text-white",
                        pad
                      )}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className={cn("px-1", pad)}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
