"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContentGrid } from "@/components/layout/content-grid";
import { useToast } from "@/components/ui/toast";
import { KeteranganImage } from "@/components/laporan/keterangan-image";
import { ReviewBadge } from "@/components/laporan/review-badge";
import { createClient } from "@/lib/supabase/client";
import { SessionExpiredError, isSessionError } from "@/lib/errors";
import { formatTanggalPanjang, type KegiatanItem } from "@/components/laporan/types";
import type { ReviewStatus } from "@/lib/supabase/database.types";

const STATUS_OPTIONS = [
  {
    value: "approved",
    label: "Disetujui",
    dot: "bg-emerald-500",
    active:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  },
  {
    value: "revision",
    label: "Revisi",
    dot: "bg-amber-500",
    active:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
  },
] as const;

// Detail baca-saja + satu form review: status dan catatan. Tanpa komentar/chat.
export function AdminKegiatanDetail({
  item,
  ownerNama,
  ownerUsername,
  backHref,
  indikatorNames,
}: {
  item: KegiatanItem;
  ownerNama: string;
  ownerUsername: string;
  backHref: string;
  indikatorNames: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<ReviewStatus | "">(item.review?.status ?? "");
  const [catatan, setCatatan] = useState(item.review?.catatan ?? "");
  const [saved, setSaved] = useState<{ status: ReviewStatus; catatan: string | null } | null>(
    item.review ? { status: item.review.status, catatan: item.review.catatan } : null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (status !== "approved" && status !== "revision") {
      setMessage("Pilih status Disetujui atau Revisi.");
      return;
    }
    const cleaned = catatan.trim();
    if (status === "revision" && cleaned.length === 0) {
      setMessage("Catatan wajib diisi bila status Revisi.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("reviews").upsert(
        {
          kegiatan_id: item.id,
          status,
          catatan: cleaned.length > 0 ? cleaned : null,
        },
        { onConflict: "kegiatan_id" }
      );
      if (error) throw error;
      setSaved({ status, catatan: cleaned.length > 0 ? cleaned : null });
      toast.success("Review disimpan.");
      router.refresh();
    } catch (err) {
      if (err instanceof SessionExpiredError || isSessionError(err)) {
        setMessage("Sesi Anda berakhir. Silakan masuk lagi.");
        router.replace("/login?expired=1");
        return;
      }
      setMessage("Gagal menyimpan review. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full">
      <Link
        href={backHref}
        className="transition-soft inline-flex min-h-[44px] items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Kembali
      </Link>

      <div className="mt-2">
        <ContentGrid
          aside={
            <>
              <section aria-label="Info kegiatan">
                <h2 className="text-sm font-semibold">Info</h2>
                <dl className="panel mt-2 divide-y divide-border overflow-hidden rounded-lg text-sm">
                  <div className="flex gap-2 px-4 py-2.5">
                    <dt className="w-20 shrink-0 text-muted-foreground">Pelapor</dt>
                    <dd className="min-w-0">
                      <p className="truncate font-medium">{ownerNama}</p>
                      <p className="text-xs text-muted-foreground">{ownerUsername}</p>
                    </dd>
                  </div>
                  <div className="flex gap-2 px-4 py-2.5">
                    <dt className="w-20 shrink-0 text-muted-foreground">Tanggal</dt>
                    <dd>{formatTanggalPanjang(item.tanggal)}</dd>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2.5">
                    <dt className="w-20 shrink-0 text-muted-foreground">Status</dt>
                    <dd>
                      <ReviewBadge status={saved?.status ?? null} />
                    </dd>
                  </div>
                  {indikatorNames.length > 0 && (
                    <div className="flex gap-2 px-4 py-2.5">
                      <dt className="w-20 shrink-0 text-muted-foreground">Indikator</dt>
                      <dd>{indikatorNames.join(", ")}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section aria-label="Review" className="panel rounded-lg p-5">
                <h2 className="text-sm font-semibold">Review</h2>
                <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
                  <fieldset>
                    <legend className="sr-only">Status review</legend>
                    <div className="flex gap-2">
                      {STATUS_OPTIONS.map((option) => {
                        const selected = status === option.value;
                        return (
                          <label
                            key={option.value}
                            className={`transition-soft flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-4 text-sm ${
                              selected
                                ? `${option.active} font-medium`
                                : "border-border bg-surface text-muted-foreground hover:bg-muted"
                            } ${saving ? "cursor-not-allowed opacity-60" : ""}`}
                          >
                            <input
                              type="radio"
                              name="status"
                              value={option.value}
                              checked={selected}
                              onChange={() => setStatus(option.value)}
                              disabled={saving}
                              className="sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className={`size-1.5 rounded-full ${option.dot}`}
                            />
                            {option.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="review-catatan">
                      Catatan{status === "revision" ? " (wajib)" : " (opsional)"}
                    </Label>
                    <Textarea
                      id="review-catatan"
                      value={catatan}
                      onChange={(event) => {
                        setCatatan(event.target.value);
                        setMessage(null);
                      }}
                      rows={3}
                      placeholder={
                        status === "revision"
                          ? "Contoh: Foto kegiatan kurang jelas."
                          : "Tulis catatan bila perlu."
                      }
                      disabled={saving}
                    />
                  </div>

                  {message && (
                    <p role="alert" className="text-sm text-danger">
                      {message}
                    </p>
                  )}

                  <Button type="submit" disabled={saving} className="w-full">
                    {saving ? "Menyimpan..." : "Simpan review"}
                  </Button>
                </form>
              </section>
            </>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{ownerNama}</p>
              <p className="text-xs text-muted-foreground">{ownerUsername}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatTanggalPanjang(item.tanggal)}
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{item.nama}</h1>
              {indikatorNames.length > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {indikatorNames.join(", ")}
                </p>
              )}
            </div>
            <ReviewBadge status={saved?.status ?? null} />
          </div>

          <div className="mt-8 flex flex-col gap-5">
            {item.keterangan.length === 0 && (
              <p className="text-sm text-muted-foreground">Belum ada keterangan.</p>
            )}
            {item.keterangan.map((row, index) =>
              row.tipe === "text" ? (
                <p key={row.id} className="max-w-prose text-sm leading-relaxed whitespace-pre-wrap">
                  {row.isi_text}
                </p>
              ) : row.image_url ? (
                <figure key={row.id}>
                  <KeteranganImage
                    path={row.image_url}
                    alt={`Gambar ${index + 1} kegiatan ${item.nama}`}
                    fallback="full"
                    className="w-full rounded-lg border border-border object-cover"
                  />
                  {row.isi_text && (
                    <figcaption className="mt-1.5 max-w-prose text-sm text-muted-foreground">
                      {row.isi_text}
                    </figcaption>
                  )}
                </figure>
              ) : null
            )}
          </div>
        </ContentGrid>
      </div>
    </div>
  );
}
