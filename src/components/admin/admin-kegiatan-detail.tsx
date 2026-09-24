"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { KeteranganImage } from "@/components/laporan/keterangan-image";
import { ReviewBadge } from "@/components/laporan/review-badge";
import { createClient } from "@/lib/supabase/client";
import { formatTanggalPanjang, type KegiatanItem } from "@/components/laporan/types";
import type { ReviewStatus } from "@/lib/supabase/database.types";

// Detail baca-saja + satu form review: status dan catatan. Tanpa komentar/chat.
export function AdminKegiatanDetail({
  item,
  ownerNama,
  ownerUsername,
  backHref,
}: {
  item: KegiatanItem;
  ownerNama: string;
  ownerUsername: string;
  backHref: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ReviewStatus | "">(
    item.review?.status ?? ""
  );
  const [catatan, setCatatan] = useState(item.review?.catatan ?? "");
  const [saved, setSaved] = useState<{ status: ReviewStatus; catatan: string | null } | null>(
    item.review ? { status: item.review.status, catatan: item.review.catatan } : null
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (status !== "approved" && status !== "revision") {
      setMessage({ ok: false, text: "Pilih status Disetujui atau Revisi." });
      return;
    }
    const cleaned = catatan.trim();
    if (status === "revision" && cleaned.length === 0) {
      setMessage({ ok: false, text: "Catatan wajib diisi bila status Revisi." });
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
      if (error) throw new Error("Gagal menyimpan review. Coba lagi.");
      setSaved({ status, catatan: cleaned.length > 0 ? cleaned : null });
      setMessage({ ok: true, text: "Review disimpan." });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Gagal menyimpan." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={backHref}
        className="transition-soft inline-flex min-h-[44px] items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Kembali
      </Link>

      <p className="mt-4 text-sm font-medium">{ownerNama}</p>
      <p className="text-xs text-muted-foreground">{ownerUsername}</p>
      <p className="mt-2 text-sm text-muted-foreground">{formatTanggalPanjang(item.tanggal)}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{item.nama}</h1>
        <ReviewBadge status={saved?.status ?? null} />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {item.keterangan.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada keterangan.</p>
        )}
        {item.keterangan.map((row, index) =>
          row.tipe === "text" ? (
            <p key={row.id} className="text-sm whitespace-pre-wrap">
              {row.isi_text}
            </p>
          ) : row.image_url ? (
            <figure key={row.id}>
              <KeteranganImage
                path={row.image_url}
                alt={`Gambar ${index + 1} kegiatan ${item.nama}`}
                className="w-full rounded-lg border border-border object-cover"
              />
              {row.isi_text && (
                <figcaption className="mt-1 text-sm text-muted-foreground">
                  {row.isi_text}
                </figcaption>
              )}
            </figure>
          ) : null
        )}
      </div>

      <section aria-label="Review" className="mt-8 border-t border-border pt-6">
        <h2 className="text-sm font-semibold">Review</h2>
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-4">
          <fieldset>
            <legend className="sr-only">Status review</legend>
            <div className="flex gap-2">
              {(
                [
                  { value: "approved", label: "Disetujui" },
                  { value: "revision", label: "Revisi" },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={`transition-soft flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-md border px-4 text-sm ${
                    status === option.value
                      ? "border-accent bg-white font-medium text-foreground shadow-subtle"
                      : "border-border bg-white text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={option.value}
                    checked={status === option.value}
                    onChange={() => setStatus(option.value)}
                    disabled={saving}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="review-catatan">
              Catatan{status === "revision" ? " (wajib)" : " (opsional)"}
            </Label>
            <textarea
              id="review-catatan"
              value={catatan}
              onChange={(event) => setCatatan(event.target.value)}
              rows={3}
              placeholder={
                status === "revision"
                  ? "Contoh: Foto kegiatan kurang jelas."
                  : "Tulis catatan bila perlu."
              }
              disabled={saving}
              className="shadow-subtle transition-soft flex w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {message && (
            <p
              role={message.ok ? "status" : "alert"}
              className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}
            >
              {message.text}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan review"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
