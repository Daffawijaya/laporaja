-- Laporaja pengaturan: judul blok Info di builder section.
-- Cara pakai: tempel isi file ini sekali di Supabase Dashboard lalu SQL Editor.

insert into public.pengaturan (kunci, nilai) values
  ('info_judul', 'Info Laporan')
on conflict (kunci) do nothing;
