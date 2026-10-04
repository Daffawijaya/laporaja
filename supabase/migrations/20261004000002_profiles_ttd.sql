-- Tanda tangan milik user (satu gambar per user, rujukan drive:…).
alter table public.profiles
  add column if not exists ttd text;
