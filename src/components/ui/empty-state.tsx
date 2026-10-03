import { cn } from "@/lib/utils";

// Empty state singkat: satu judul, satu kalimat bantuan, lalu aksi berikutnya.
// Gaya kartu disamakan dengan daftar terisi (ref-card).
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ref-card px-6 py-10 text-center", className)}>
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
