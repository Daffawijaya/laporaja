-- Section: blok Info + Indikator agar susunan laporan lengkap dan bisa
-- digeser seperti kartu lain. Info = kepala identitas (bulan, tahun, nama,
-- jabatan, unit kerja). Indikator = capaian kinerja. Keduanya selalu
-- dianggap tuntas (tidak mengunci persetujuan).
-- Cara pakai: tempel isi file ini sekali di Supabase Dashboard lalu SQL Editor.

alter table public.laporan_section
  drop constraint if exists laporan_bawaan_kode_check;

alter table public.laporan_section
  drop constraint if exists laporan_section_kode_check;

alter table public.laporan_section
  add constraint laporan_section_kode_check
  check (kode in ('kegiatan', 'rekomendasi', 'info', 'indikator'));

insert into public.laporan_section (kode, judul, urutan) values
  ('info', 'Info Laporan', -10),
  ('indikator', 'Indikator Kinerja', 20)
on conflict (kode) do nothing;

insert into public.laporan_section_bidang (kode, bidang_id)
select k.kode, b.id
from (values ('info'), ('indikator')) as k(kode)
cross join public.bidang b
on conflict do nothing;
