import Link from "next/link";

import { Button } from "@/components/ui/button";
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
  /** Bila diisi, seluruh baris jadi Link. */
  href?: string;
  /** Bila diisi, tampil tombol kecil di kanan (gaya Perlu Review). */
  actionHref?: string;
  actionLabel?: string;
}

interface RefListCardProps {
  items: RefListCardItem[];
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
  items,
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
        {items.length === 0 ? (
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

              const inner = stacked ? (
                <>
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.subtitle && (
                    <p className="mt-0.5 text-xs text-neutral-500">{item.subtitle}</p>
                  )}
                  <p className="mt-1 text-sm text-neutral-500">{item.meta}</p>
                </>
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
                  {item.desc && (
                    <span className="shrink-0 text-xs text-neutral-500">{item.desc}</span>
                  )}
                  {item.actionHref && !linkable && (
                    <Button asChild className="shrink-0">
                      <Link href={item.actionHref}>{item.actionLabel ?? "Lihat"}</Link>
                    </Button>
                  )}
                </span>
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
