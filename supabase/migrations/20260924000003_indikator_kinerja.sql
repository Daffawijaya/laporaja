-- LaporAja indikator kinerja migration
-- Scope: indikator kinerja + relasi kegiatan. Tidak ada perubahan tabel lama.
--
-- Model:
-- - indikator: nama, target total, tahun, rentang bulan (mulai sampai selesai).
--   Target per bulan = target / jumlah bulan, dihitung di aplikasi.
-- - Cakupan tepat satu: bidang_id (berlaku untuk semua user di bidang itu)
--   atau user_id (khusus satu user).
-- - kegiatan_indikator: relasi banyak ke banyak. Satu kegiatan boleh
--   memenuhi banyak indikator. User menandai lewat form kegiatan.

-- ---------------------------------------------------------------------------
-- Tabel: indikator
-- ---------------------------------------------------------------------------
create table if not exists public.indikator (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (char_length(nama) between 2 and 120),
  target integer not null check (target between 1 and 100000),
  tahun integer not null check (tahun between 2000 and 2100),
  bulan_mulai smallint not null check (bulan_mulai between 1 and 12),
  bulan_selesai smallint not null check (bulan_selesai between 1 and 12),
  bidang_id uuid references public.bidang (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (bulan_selesai >= bulan_mulai),
  check (
    (bidang_id is not null and user_id is null)
    or (bidang_id is null and user_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- Tabel: kegiatan_indikator (relasi kegiatan memenuhi indikator)
-- ---------------------------------------------------------------------------
create table if not exists public.kegiatan_indikator (
  kegiatan_id uuid not null references public.kegiatan (id) on delete cascade,
  indikator_id uuid not null references public.indikator (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kegiatan_id, indikator_id)
);

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------
create index if not exists indikator_bidang_id_idx on public.indikator (bidang_id);
create index if not exists indikator_user_id_idx on public.indikator (user_id);
create index if not exists indikator_tahun_idx on public.indikator (tahun);
create index if not exists kegiatan_indikator_indikator_id_idx
  on public.kegiatan_indikator (indikator_id);
create index if not exists kegiatan_indikator_kegiatan_id_idx
  on public.kegiatan_indikator (kegiatan_id);

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists set_indikator_updated_at on public.indikator;
create trigger set_indikator_updated_at
  before update on public.indikator
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Validasi: kegiatan hanya boleh ditautkan ke indikator yang berlaku
-- untuk pemiliknya (indikator khusus user itu, atau indikator bidangnya).
-- ---------------------------------------------------------------------------
create or replace function public.validate_kegiatan_indikator()
returns trigger
language plpgsql
as $$
declare
  v_user_id uuid;
  v_bidang_id uuid;
  v_ok boolean;
begin
  select user_id into v_user_id
  from public.kegiatan
  where id = new.kegiatan_id;

  if v_user_id is null then
    raise exception 'Kegiatan tidak ditemukan.';
  end if;

  select bidang_id into v_bidang_id
  from public.profiles
  where id = v_user_id;

  select exists (
    select 1 from public.indikator
    where id = new.indikator_id
      and (
        user_id = v_user_id
        or (bidang_id is not null and bidang_id = v_bidang_id)
      )
  ) into v_ok;

  if not v_ok then
    raise exception 'Indikator tidak berlaku untuk kegiatan ini.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_kegiatan_indikator on public.kegiatan_indikator;
create trigger check_kegiatan_indikator
  before insert on public.kegiatan_indikator
  for each row execute function public.validate_kegiatan_indikator();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.indikator enable row level security;
alter table public.kegiatan_indikator enable row level security;

grant select, insert, update, delete on public.indikator to authenticated;
grant select, insert, update, delete on public.kegiatan_indikator to authenticated;

-- indikator: superadmin kelola semua. User membaca yang berlaku untuknya
-- (khusus dirinya, atau bidangnya).
drop policy if exists "indikator_select_applicable" on public.indikator;
create policy "indikator_select_applicable"
  on public.indikator for select
  to authenticated
  using (
    public.is_superadmin()
    or user_id = auth.uid()
    or (
      bidang_id is not null
      and bidang_id = (
        select bidang_id from public.profiles where id = auth.uid()
      )
    )
  );

drop policy if exists "indikator_write_superadmin" on public.indikator;
create policy "indikator_write_superadmin"
  on public.indikator for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- kegiatan_indikator: mengikuti kepemilikan kegiatan induk.
drop policy if exists "kegiatan_indikator_select_owner" on public.kegiatan_indikator;
create policy "kegiatan_indikator_select_owner"
  on public.kegiatan_indikator for select
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.kegiatan k
      where k.id = kegiatan_indikator.kegiatan_id
        and k.user_id = auth.uid()
    )
  );

drop policy if exists "kegiatan_indikator_insert_owner" on public.kegiatan_indikator;
create policy "kegiatan_indikator_insert_owner"
  on public.kegiatan_indikator for insert
  to authenticated
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.kegiatan k
      where k.id = kegiatan_indikator.kegiatan_id
        and k.user_id = auth.uid()
    )
  );

drop policy if exists "kegiatan_indikator_update_owner" on public.kegiatan_indikator;
create policy "kegiatan_indikator_update_owner"
  on public.kegiatan_indikator for update
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.kegiatan k
      where k.id = kegiatan_indikator.kegiatan_id
        and k.user_id = auth.uid()
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.kegiatan k
      where k.id = kegiatan_indikator.kegiatan_id
        and k.user_id = auth.uid()
    )
  );

drop policy if exists "kegiatan_indikator_delete_owner" on public.kegiatan_indikator;
create policy "kegiatan_indikator_delete_owner"
  on public.kegiatan_indikator for delete
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.kegiatan k
      where k.id = kegiatan_indikator.kegiatan_id
        and k.user_id = auth.uid()
    )
  );
