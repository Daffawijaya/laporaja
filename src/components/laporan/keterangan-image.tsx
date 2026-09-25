"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getSignedImageUrl } from "@/lib/supabase/storage";

// Menampilkan gambar privat dari Storage lewat signed URL sementara.
// `fallback` mengatur tampilan galat: "compact" untuk thumbnail, "full" untuk
// gambar besar. Keduanya menyediakan cara memuat ulang.
export function KeteranganImage({
  path,
  alt,
  className,
  fallback = "compact",
}: {
  path: string;
  alt: string;
  className?: string;
  fallback?: "compact" | "full";
}) {
  const [reload, setReload] = useState(0);
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
  }, [path, reload]);

  const current = loaded && loaded.path === path ? loaded : null;
  const url = current?.url ?? null;
  const failed = current?.failed ?? false;

  function retry() {
    setLoaded(null);
    setReload((value) => value + 1);
  }

  if (failed) {
    if (fallback === "compact") {
      return (
        <button
          type="button"
          onClick={retry}
          aria-label={`${alt}. Gambar tidak dapat dimuat. Ketuk untuk mencoba lagi.`}
          className={cn(
            "flex items-center justify-center rounded-md border border-border bg-muted text-muted-foreground",
            className
          )}
        >
          <span aria-hidden="true" className="text-xs">
            Gagal
          </span>
        </button>
      );
    }
    return (
      <div
        className={cn(
          "flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-6 text-center",
          className
        )}
      >
        <p className="text-sm text-muted-foreground">Gambar tidak dapat dimuat.</p>
        <Button type="button" variant="secondary" onClick={retry}>
          Coba lagi
        </Button>
      </div>
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
