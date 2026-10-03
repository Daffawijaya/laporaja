import { Skeleton } from "@/components/ui/skeleton";

// Kerangka halaman generik untuk route loading. Lebar penuh mengikuti konten
// dan kartu (tanpa max-w/mx-auto), baris seukuran kartu ref-card.
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="w-full" aria-busy="true" aria-label="Memuat halaman">
      <Skeleton className="h-4 w-32 rounded-full" />
      <Skeleton className="mt-3 h-6 w-56 rounded-full" />
      <div className="mt-5 flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-[24px]" />
        ))}
      </div>
    </div>
  );
}
