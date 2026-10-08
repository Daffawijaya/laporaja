-- Laporaja laporan tambahan: kolom isian dinamis per laporan
-- Perubahan dari skema baris 6-kolom tetap: admin menentukan sendiri
-- kolom apa saja yang diisi (label + tipe: text/textarea/date/number)
-- sehingga satu laporan bisa dipakai untuk format pendataan apa pun.
-- Periode bulan/tahun dihapus: penugasan permanen sampai user mengisi.

-- ---------------------------------------------------------------------------
-- Definisi kolom per laporan
-- ---------------------------------------------------------------------------
create table if not exists public.laporan_tambahan_kolom (
  id uuid primary key default gen_random_uuid(),
  laporan_id uuid not null references public.laporan_tambahan (id) on delete cascade,
  label text not null check (char_length(label) between 2 and 120),
  tipe text not null check (tipe in ('text', 'textarea', 'date', 'number')),
  wajib boolean not null default true,
  urutan integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists laporan_tambahan_kolom_laporan_urutan_idx
  on public.laporan_tambahan_kolom (laporan_id, urutan);

drop trigger if exists set_laporan_tambahan_kolom_updated_at on public.laporan_tambahan_kolom;
create trigger set_laporan_tambahan_kolom_updated_at
  before update on public.laporan_tambahan_kolom
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Nilai isian per baris per kolom (semua disimpan sebagai teks)
-- ---------------------------------------------------------------------------
create table if not exists public.laporan_tambahan_nilai (
  baris_id uuid not null references public.laporan_tambahan_baris (id) on delete cascade,
  kolom_id uuid not null references public.laporan_tambahan_kolom (id) on delete cascade,
  nilai text not null default '',
  primary key (baris_id, kolom_id)
);

-- ---------------------------------------------------------------------------
-- Baris: kolom isian tetap diganti relasi nilai
-- ---------------------------------------------------------------------------
alter table public.laporan_tambahan_baris
  drop column if exists nama_usaha,
  drop column if exists nik,
  drop column if exists jenis_usaha,
  drop column if exists alamat,
  drop column if exists permasalahan,
  drop column if exists saran;

alter table public.laporan_tambahan
  drop column if exists bulan,
  drop column if exists tahun;

drop index if exists public.laporan_tambahan_periode_idx;

-- ---------------------------------------------------------------------------
-- RLS: superadmin kelola semua. User membaca kolom laporan bidangnya,
-- serta CRUD nilai milik barisnya sendiri.
-- ---------------------------------------------------------------------------
alter table public.laporan_tambahan_kolom enable row level security;
alter table public.laporan_tambahan_nilai enable row level security;

drop policy if exists "laporan_tambahan_kolom_select_applicable" on public.laporan_tambahan_kolom;
create policy "laporan_tambahan_kolom_select_applicable"
  on public.laporan_tambahan_kolom for select
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1
      from public.laporan_tambahan_bidang lb
      join public.profiles p on p.bidang_id = lb.bidang_id
      where lb.laporan_id = laporan_tambahan_kolom.laporan_id
        and p.id = auth.uid()
    )
  );

drop policy if exists "laporan_tambahan_kolom_write_superadmin" on public.laporan_tambahan_kolom;
create policy "laporan_tambahan_kolom_write_superadmin"
  on public.laporan_tambahan_kolom for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "laporan_tambahan_nilai_select_own" on public.laporan_tambahan_nilai;
create policy "laporan_tambahan_nilai_select_own"
  on public.laporan_tambahan_nilai for select
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1
      from public.laporan_tambahan_baris b
      where b.id = laporan_tambahan_nilai.baris_id
        and b.user_id = auth.uid()
    )
  );

drop policy if exists "laporan_tambahan_nilai_write_own" on public.laporan_tambahan_nilai;
create policy "laporan_tambahan_nilai_write_own"
  on public.laporan_tambahan_nilai for all
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1
      from public.laporan_tambahan_baris b
      where b.id = laporan_tambahan_nilai.baris_id
        and b.user_id = auth.uid()
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1
      from public.laporan_tambahan_baris b
      where b.id = laporan_tambahan_nilai.baris_id
        and b.user_id = auth.uid()
    )
  );
