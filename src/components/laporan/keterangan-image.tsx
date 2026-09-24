"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getSignedImageUrl } from "@/lib/supabase/storage";

// Menampilkan gambar privat dari Storage lewat signed URL sementara.
export function KeteranganImage({
  path,
  alt,
  className,
}: {
  path: string;
  alt: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState<{
    path: string;
    url: string | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    getSignedImageUrl(createClient(), path)
      .then((signed) => {
        if (!active) return;
        setLoaded({ path, url: signed, failed: !signed });
      })
      .catch(() => {
        if (active) setLoaded({ path, url: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [path]);

  const current = loaded && loaded.path === path ? loaded : null;
  const url = current?.url ?? null;
  const failed = current?.failed ?? false;

  if (failed) {
    return (
      <span
        className={cn(
          "flex min-h-[64px] items-center justify-center rounded-md border border-border bg-muted px-3 text-xs text-muted-foreground",
          className
        )}
      >
        Gambar tidak dapat dimuat
      </span>
    );
  }

  if (!url) {
    return (
      <span
        aria-label="Memuat gambar"
        className={cn("block min-h-[64px] animate-pulse rounded-md bg-muted", className)}
      />
    );
  }

  // img biasa disengaja: URL bertanda tangan sementara tidak lewat optimizer next/image.
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
