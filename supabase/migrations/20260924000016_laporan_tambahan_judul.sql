-- LaporAja laporan tambahan: bentuk ketiga "judul" (judul + deskripsi
-- tanpa isian, mis. pembatas bab). Blok judul tidak wajib diisi dan tidak
-- mengunci persetujuan.
-- Cara pakai: tempel isi file ini sekali di Supabase Dashboard lalu SQL Editor.

alter table public.laporan_tambahan
  drop constraint if exists laporan_tambahan_format_check;

alter table public.laporan_tambahan
  add constraint laporan_tambahan_format_check check (format in ('tabel', 'esai', 'judul'));
