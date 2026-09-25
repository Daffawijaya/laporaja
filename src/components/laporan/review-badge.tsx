import { cn } from "@/lib/utils";
import type { ReviewStatus } from "@/lib/supabase/database.types";

// Tiga status punya perlakuan visual yang sama: titik warna + label.
// Warna dipakai seperlunya supaya mudah dibedakan tanpa terlihat ramai.
const STYLES: Record<
  ReviewStatus | "none",
  { label: string; dot: string; className: string }
> = {
  none: {
    label: "Menunggu Review",
    dot: "bg-muted-foreground/60",
    className: "border-border bg-muted text-muted-foreground",
  },
  approved: {
    label: "Disetujui",
    dot: "bg-emerald-500",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  },
  revision: {
    label: "Revisi",
    dot: "bg-amber-500",
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
  },
};

export function ReviewBadge({ status }: { status: ReviewStatus | null }) {
  const style = STYLES[status ?? "none"];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs whitespace-nowrap",
        style.className
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}
