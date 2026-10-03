-- Section: tipe kolom baru "image" (gambar + deskripsi, nilai JSON).
alter table public.laporan_tambahan_kolom
  drop constraint if exists laporan_tambahan_kolom_tipe_check,
  add constraint laporan_tambahan_kolom_tipe_check
  check (tipe in ('text', 'textarea', 'date', 'number', 'image'));
