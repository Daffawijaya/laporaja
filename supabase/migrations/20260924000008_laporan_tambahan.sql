-- LaporAja laporan tambahan (tugas isian UMKM per bidang per bulan)
-- Alur: superadmin membuat laporan (judul + bulan/tahun) lalu menautkan ke
-- satu/lebih bidang. User yang bidangnya tertaut WAJIB mengisi (tambah baris
-- isian UMKM). Approve bulanan dikunci selama ada tugas belum terisi.
-- Export PDF bulanan menggabungkan baris-baris ini.
--
-- Skema kolom baris tetap: nama_usaha, nik, jenis_usaha, alamat,
-- permasalahan, saran.

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------
create table if not exists public.laporan_tambahan (
  id uuid primary key default gen_random_uuid(),
  judul text not null check (char_length(judul) between 2 and 120),
  bulan smallint not null check (bulan between 1 and 12),
  tahun smallint not null check (tahun between 2000 and 2100),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.laporan_tambahan_bidang (
  laporan_id uuid not null references public.laporan_tambahan (id) on delete cascade,
  bidang_id uuid not null references public.bidang (id) on delete cascade,
  primary key (laporan_id, bidang_id)
);

create table if not exists public.laporan_tambahan_baris (
  id uuid primary key default gen_random_uuid(),
  laporan_id uuid not null references public.laporan_tambahan (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  urutan integer not null default 0,
  nama_usaha text not null check (char_length(nama_usaha) between 2 and 200),
  nik varchar(16) not null check (nik ~ '^[0-9]{16}$'),
  jenis_usaha text not null check (char_length(jenis_usaha) between 2 and 120),
  alamat text not null check (char_length(alamat) between 2 and 500),
  permasalahan text not null check (char_length(permasalahan) between 2 and 1000),
  saran text not null check (char_length(saran) between 2 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------
create index if not exists laporan_tambahan_periode_idx
  on public.laporan_tambahan (tahun, bulan);
create index if not exists laporan_tambahan_bidang_bidang_idx
  on public.laporan_tambahan_bidang (bidang_id);
create index if not exists laporan_tambahan_baris_laporan_user_idx
  on public.laporan_tambahan_baris (laporan_id, user_id);

-- ---------------------------------------------------------------------------
-- Trigger updated_at (pola sama seperti tabel lain)
-- ---------------------------------------------------------------------------
drop trigger if exists set_laporan_tambahan_updated_at on public.laporan_tambahan;
create trigger set_laporan_tambahan_updated_at
  before update on public.laporan_tambahan
  for each row execute function public.handle_updated_at();

drop trigger if exists set_laporan_tambahan_baris_updated_at on public.laporan_tambahan_baris;
create trigger set_laporan_tambahan_baris_updated_at
  before update on public.laporan_tambahan_baris
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: superadmin kelola semua. User membaca laporan yang tertaut ke
-- bidangnya, serta CRUD baris miliknya sendiri.
-- ---------------------------------------------------------------------------
alter table public.laporan_tambahan enable row level security;
alter table public.laporan_tambahan_bidang enable row level security;
alter table public.laporan_tambahan_baris enable row level security;

drop policy if exists "laporan_tambahan_select_applicable" on public.laporan_tambahan;
create policy "laporan_tambahan_select_applicable"
  on public.laporan_tambahan for select
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1
      from public.laporan_tambahan_bidang lb
      where lb.laporan_id = laporan_tambahan.id
        and lb.bidang_id = (
          select bidang_id from public.profiles where id = auth.uid()
        )
    )
  );

drop policy if exists "laporan_tambahan_write_superadmin" on public.laporan_tambahan;
create policy "laporan_tambahan_write_superadmin"
  on public.laporan_tambahan for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "laporan_tambahan_bidang_select_applicable" on public.laporan_tambahan_bidang;
create policy "laporan_tambahan_bidang_select_applicable"
  on public.laporan_tambahan_bidang for select
  to authenticated
  using (
    public.is_superadmin()
    or bidang_id = (
      select bidang_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "laporan_tambahan_bidang_write_superadmin" on public.laporan_tambahan_bidang;
create policy "laporan_tambahan_bidang_write_superadmin"
  on public.laporan_tambahan_bidang for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "laporan_tambahan_baris_select_own" on public.laporan_tambahan_baris;
create policy "laporan_tambahan_baris_select_own"
  on public.laporan_tambahan_baris for select
  to authenticated
  using (
    public.is_superadmin()
    or user_id = auth.uid()
  );

drop policy if exists "laporan_tambahan_baris_write_own" on public.laporan_tambahan_baris;
create policy "laporan_tambahan_baris_write_own"
  on public.laporan_tambahan_baris for all
  to authenticated
  using (
    public.is_superadmin()
    or user_id = auth.uid()
  )
  with check (
    public.is_superadmin()
    or user_id = auth.uid()
  );
