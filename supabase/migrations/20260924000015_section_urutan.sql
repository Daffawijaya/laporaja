-- LaporAja section builder: urutan bebas antar section di halaman admin.
-- Section tetap (kegiatan, rekomendasi) dan laporan dinamis bisa disusun
-- dalam satu urutan. Urutan dinamis juga dipakai di halaman laporan user.
-- Cara pakai: tempel isi file ini sekali di Supabase Dashboard lalu SQL Editor.

alter table public.laporan_tambahan
  add column if not exists urutan integer not null default 0;

alter table public.laporan_section
  add column if not exists urutan integer not null default 0;

-- Isi awal: section tetap dulu (kegiatan, rekomendasi), dinamis lanjut abjad.
update public.laporan_section
  set urutan = case kode when 'kegiatan' then 0 when 'rekomendasi' then 10 else 20 end;

with ranked as (
  select id, row_number() over (order by judul) as rn from public.laporan_tambahan
)
update public.laporan_tambahan t
  set urutan = 100 + ranked.rn * 10
  from ranked
  where ranked.id = t.id;
