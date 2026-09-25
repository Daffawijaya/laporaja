-- LaporAja indikator tanpa target wajib
-- Scope: target_bulanan boleh kosong. Tambah indikator di menu Indikator
-- hanya mengisi nama. Jumlah per bulan diisi belakangan di menu Bidang
-- atau menu User.

alter table public.indikator alter column target_bulanan drop not null;
