"use client";

import { useSyncExternalStore } from "react";

// Id section yang kartunya sudah tampil optimistis tapi baris DB-nya belum
// selesai ditulis. Dipakai menunda autosave kartu tsb sampai insert rampung
// (efek autosave jalan lagi otomatis saat status berubah).
const pending = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function tambahPending(id: string): void {
  pending.add(id);
  emit();
}

export function hapusPending(id: string): void {
  if (pending.delete(id)) emit();
}

export function isPending(id: string): boolean {
  return pending.has(id);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSectionPending(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pending.has(id),
    () => false
  );
}
