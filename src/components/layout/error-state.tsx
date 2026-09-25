"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "Terjadi masalah",
  message,
  onRetry,
  retryLabel = "Coba lagi",
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("panel rounded-lg px-6 py-10 text-center", className)}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-5">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
