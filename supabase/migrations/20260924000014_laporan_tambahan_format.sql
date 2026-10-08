-- Laporaja laporan tambahan: bentuk isian per laporan (tabel vs esai)
-- Tabel = baris-baris data berisi kolom-kolom (mis. progres verifikasi).
-- Esai = satu isian teks panjang per user (mis. rekomendasi).
-- Laporan yang sudah ada otomatis menjadi tabel.
-- Cara pakai: tempel isi file ini sekali di Supabase Dashboard lalu SQL Editor.

alter table public.laporan_tambahan
  add column if not exists format text not null default 'tabel';

alter table public.laporan_tambahan
  drop constraint if exists laporan_tambahan_format_check;

alter table public.laporan_tambahan
  add constraint laporan_tambahan_format_check check (format in ('tabel', 'esai'));
