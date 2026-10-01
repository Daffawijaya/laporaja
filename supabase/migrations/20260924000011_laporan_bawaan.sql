-- LaporAja laporan bawaan: master + penugasan bidang untuk tiga laporan
-- default (kegiatan, rekomendasi, indikator) agar bisa diatur dari daftar
-- /admin/laporan-tambahan seperti laporan tambahan.
-- Semantik: bidang yang tertaut = WAJIB (mengunci Setujui bila belum
-- tuntas); bidang yang tidak tertaut tetap melihat bagiannya tapi opsional.
-- Awal: tautkan ketiga laporan ke semua bidang yang ada (perilaku lama).

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------
create table if not exists public.laporan_bawaan (
  kode text primary key check (kode in ('kegiatan', 'rekomendasi', 'indikator')),
  judul text not null
);

create table if not exists public.laporan_bawaan_bidang (
  kode text not null references public.laporan_bawaan (kode) on delete cascade,
  bidang_id uuid not null references public.bidang (id) on delete cascade,
  primary key (kode, bidang_id)
);

create index if not exists laporan_bawaan_bidang_bidang_idx
  on public.laporan_bawaan_bidang (bidang_id);

-- ---------------------------------------------------------------------------
-- Seed master + tautan awal ke semua bidang
-- ---------------------------------------------------------------------------
insert into public.laporan_bawaan (kode, judul) values
  ('kegiatan', 'Kegiatan Bulanan'),
  ('rekomendasi', 'Rekomendasi dan Tindak Lanjut'),
  ('indikator', 'Indikator Kinerja')
on conflict (kode) do update set judul = excluded.judul;

insert into public.laporan_bawaan_bidang (kode, bidang_id)
select b.kode, f.id
from public.laporan_bawaan b
cross join public.bidang f
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS: superadmin kelola semua. User membaca tautan bidangnya sendiri.
-- ---------------------------------------------------------------------------
alter table public.laporan_bawaan enable row level security;
alter table public.laporan_bawaan_bidang enable row level security;

drop policy if exists "laporan_bawaan_select_all" on public.laporan_bawaan;
create policy "laporan_bawaan_select_all"
  on public.laporan_bawaan for select
  to authenticated
  using (true);

drop policy if exists "laporan_bawaan_write_superadmin" on public.laporan_bawaan;
create policy "laporan_bawaan_write_superadmin"
  on public.laporan_bawaan for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "laporan_bawaan_bidang_select_applicable" on public.laporan_bawaan_bidang;
create policy "laporan_bawaan_bidang_select_applicable"
  on public.laporan_bawaan_bidang for select
  to authenticated
  using (
    public.is_superadmin()
    or bidang_id = (
      select bidang_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "laporan_bawaan_bidang_write_superadmin" on public.laporan_bawaan_bidang;
create policy "laporan_bawaan_bidang_write_superadmin"
  on public.laporan_bawaan_bidang for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());
