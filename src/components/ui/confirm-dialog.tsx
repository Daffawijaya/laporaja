"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Hapus",
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {message ? (
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Batal
        </Button>
        <Button
          variant="secondary"
          className="text-danger hover:text-danger"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Menghapus..." : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
