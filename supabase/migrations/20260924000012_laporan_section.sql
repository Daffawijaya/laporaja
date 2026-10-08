-- Laporaja: ganti istilah "laporan bawaan" menjadi "section"
-- Rename tabel (data ikut pindah) + index + nama policy.

alter table if exists public.laporan_bawaan rename to laporan_section;
alter table if exists public.laporan_bawaan_bidang rename to laporan_section_bidang;

alter index if exists laporan_bawaan_bidang_bidang_idx
  rename to laporan_section_bidang_bidang_idx;

alter policy if exists "laporan_bawaan_select_all"
  on public.laporan_section rename to "laporan_section_select_all";
alter policy if exists "laporan_bawaan_write_superadmin"
  on public.laporan_section rename to "laporan_section_write_superadmin";
alter policy if exists "laporan_bawaan_bidang_select_applicable"
  on public.laporan_section_bidang rename to "laporan_section_bidang_select_applicable";
alter policy if exists "laporan_bawaan_bidang_write_superadmin"
  on public.laporan_section_bidang rename to "laporan_section_bidang_write_superadmin";
