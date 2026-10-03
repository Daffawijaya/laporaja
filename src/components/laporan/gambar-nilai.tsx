"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { resolveGambarUrl } from "@/lib/supabase/storage";

// Tampilan nilai kolom gambar: thumbnail via proxy Drive / signed URL Storage
// + deskripsi. Dipakai di daftar isian user dan pratinjau admin.
export function GambarNilaiTampil({
  path,
  deskripsi,
  ukuran = "sm",
}: {
  path: string;
  deskripsi: string;
  ukuran?: "sm" | "md";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [prevPath, setPrevPath] = useState(path);
  // Reset pratinjau saat path berganti (pola render-phase sync).
  if (prevPath !== path) {
    setPrevPath(path);
    setUrl(null);
  }

  useEffect(() => {
    let hidup = true;
    if (!path) return;
    const supabase = createClient();
    void resolveGambarUrl(supabase, path).then((resolved) => {
      if (hidup) setUrl(resolved);
    });
    return () => {
      hidup = false;
    };
  }, [path]);

  if (!path) return <span className="text-neutral-500">-</span>;

  return (
    <figure className="flex flex-col gap-1">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={deskripsi || "Gambar isian"}
          className={
            ukuran === "md"
              ? "h-auto w-full max-w-sm rounded-md object-cover"
              : "h-16 w-24 rounded-md object-cover"
          }
          loading="lazy"
        />
      ) : (
        <span className="text-neutral-500">Memuat gambar…</span>
      )}
      {deskripsi ? (
        <figcaption className="whitespace-pre-wrap">{deskripsi}</figcaption>
      ) : null}
    </figure>
  );
}
