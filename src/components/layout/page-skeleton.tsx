import { Skeleton } from "@/components/ui/skeleton";

// Kerangka halaman generik untuk route loading. Meniru pola judul lalu daftar.
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="mx-auto w-full max-w-2xl"
      aria-busy="true"
      aria-label="Memuat halaman"
    >
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-6 w-44" />
      <Skeleton className="mt-5 h-11 w-full sm:w-40" />
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
