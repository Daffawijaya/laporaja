-- Section: validasi minimal 1 karakter (bukan 2) untuk judul section dan
-- label kolom/subjudul, supaya autosave di /admin/section tidak gagal saat
-- admin baru mengetik 1 karakter.
alter table public.laporan_tambahan
  drop constraint if exists laporan_tambahan_judul_check,
  add constraint laporan_tambahan_judul_check
  check (char_length(judul) between 1 and 120);

alter table public.laporan_tambahan_kolom
  drop constraint if exists laporan_tambahan_kolom_label_check,
  add constraint laporan_tambahan_kolom_label_check
  check (char_length(label) between 1 and 120);
