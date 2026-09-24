import { cn } from "@/lib/utils";
import type { ReviewStatus } from "@/lib/supabase/database.types";

const STYLES: Record<ReviewStatus | "none", { label: string; className: string }> = {
  none: {
    label: "Menunggu Review",
    className: "border-border bg-muted text-muted-foreground",
  },
  approved: {
    label: "Disetujui",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  revision: {
    label: "Perlu perbaikan",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
};

export function ReviewBadge({ status }: { status: ReviewStatus | null }) {
  const style = STYLES[status ?? "none"];
  return (
    <span
      className={cn(
        "inline-flex min-h-[28px] shrink-0 items-center rounded-md border px-2 text-xs",
        style.className
      )}
    >
      {style.label}
    </span>
  );
}
