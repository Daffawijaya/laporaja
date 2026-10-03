-- Scope: bentuk section "indikator" (salinan tabel: judul + kolom isian,
-- diisi per baris seperti tabel). Hanya label/format yang beda.

alter table public.laporan_tambahan
  drop constraint if exists laporan_tambahan_format_check;

alter table public.laporan_tambahan
  add constraint laporan_tambahan_format_check
  check (format in ('tabel', 'esai', 'judul', 'indikator'));
