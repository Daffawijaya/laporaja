"use client";

import { useSyncExternalStore } from "react";

// Status autosave global (halaman Section): ditulis oleh kartu/builder saat
// menyimpan, dibaca oleh teks kecil di navbar. Tanpa animasi — teks saja.
export type SimpanStatus = "idle" | "saving" | "saved" | "error";

let status: SimpanStatus = "idle";
const listeners = new Set<() => void>();

export function setSimpanStatus(next: SimpanStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SimpanStatus {
  return status;
}

export function useSimpanStatus(): SimpanStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
