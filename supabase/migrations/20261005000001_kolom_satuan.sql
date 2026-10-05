-- Satuan tiap kolom isian (dipakai format indikator: nama + satuan,
-- user mengisi angka). Opsional, default kosong.
alter table public.laporan_tambahan_kolom
  add column if not exists satuan text not null default '';
