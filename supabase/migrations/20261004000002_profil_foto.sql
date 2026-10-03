-- Scope: foto profil user (CRUD gambar di halaman Anda).
-- Path storage privat di bucket kegiatan-images: "<user_id>/avatar/<acak>.webp"
-- (kebijakan folder-milik sudah ada, tak perlu policy baru).

alter table public.profiles
  add column if not exists foto text;

comment on column public.profiles.foto is
  'Path foto profil di Storage (bucket kegiatan-images), null bila belum ada.';
