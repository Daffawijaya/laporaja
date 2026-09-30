-- LaporAja laporan tambahan: deskripsi formulir (ala Google Forms)
-- Teks petunjuk di bawah judul, opsional, maksimal 1000 karakter.

alter table public.laporan_tambahan
  add column if not exists deskripsi text
  check (deskripsi is null or char_length(deskripsi) <= 1000);
