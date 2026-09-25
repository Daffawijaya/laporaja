-- LaporAja penyederhanaan indikator kinerja
-- Scope: indikator menjadi sederhana dan personal.
-- - Tanpa periode (tahun dan rentang bulan dibuang).
-- - Tanpa cakupan bidang (hanya milik satu user).
-- - target berarti jumlah per bulan, diganti nama menjadi target_bulanan.
--
-- Baris cakupan bidang yang mungkin ada ikut terhapus karena tidak dipakai lagi.

-- Cabut policy lama dulu karena bergantung pada kolom bidang_id.
drop policy if exists "indikator_select_applicable" on public.indikator;

-- Hapus baris yatim cakupan bidang sebelum user_id diwajibkan.
delete from public.indikator where user_id is null;

-- Buang kolom periode dan cakupan bidang. Check yang bergantung ikut gugur.
alter table public.indikator
  drop column if exists bidang_id,
  drop column if exists tahun,
  drop column if exists bulan_mulai,
  drop column if exists bulan_selesai;

-- target sekarang berarti jumlah per bulan.
alter table public.indikator rename column target to target_bulanan;

-- Setiap indikator wajib milik satu user.
alter table public.indikator alter column user_id set not null;

drop index if exists public.indikator_bidang_id_idx;
drop index if exists public.indikator_tahun_idx;

-- ---------------------------------------------------------------------------
-- Validasi tautan: kegiatan hanya boleh ditautkan ke indikator milik pemiliknya.
-- ---------------------------------------------------------------------------
create or replace function public.validate_kegiatan_indikator()
returns trigger
language plpgsql
as $$
declare
  v_user_id uuid;
  v_ok boolean;
begin
  select user_id into v_user_id
  from public.kegiatan
  where id = new.kegiatan_id;

  if v_user_id is null then
    raise exception 'Kegiatan tidak ditemukan.';
  end if;

  select exists (
    select 1 from public.indikator
    where id = new.indikator_id
      and user_id = v_user_id
  ) into v_ok;

  if not v_ok then
    raise exception 'Indikator tidak berlaku untuk kegiatan ini.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS indikator: superadmin kelola semua, user membaca miliknya sendiri.
-- ---------------------------------------------------------------------------
drop policy if exists "indikator_select_applicable" on public.indikator;
create policy "indikator_select_own"
  on public.indikator for select
  to authenticated
  using (
    public.is_superadmin()
    or user_id = auth.uid()
  );
