"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/layout/error-state";

// Batas galat untuk seluruh halaman. Pesan selalu ramah, tanpa detail teknis.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <ErrorState
          message="Tidak dapat memuat halaman ini. Periksa koneksi lalu coba lagi."
          onRetry={reset}
        />
      </div>
    </div>
  );
}
