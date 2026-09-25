-- LaporAja indikator per bidang atau per user
-- Scope: kembalikan cakupan bidang. Satu indikator tepat milik satu bidang
-- atau satu user. Kelola dari menu Bidang (per bidang) dan menu User (per user).
-- Target tetap jumlah per bulan (target_bulanan), tanpa periode.

alter table public.indikator
  add column if not exists bidang_id uuid references public.bidang (id) on delete cascade;

alter table public.indikator alter column user_id drop not null;

alter table public.indikator
  drop constraint if exists indikator_bidang_id_check,
  drop constraint if exists indikator_user_id_check;

-- Tepat satu cakupan terisi. Nama constraint eksplisit agar mudah dikelola.
alter table public.indikator
  add constraint indikator_scope_check check (
    (bidang_id is not null and user_id is null)
    or (bidang_id is null and user_id is not null)
  );

create index if not exists indikator_bidang_id_idx on public.indikator (bidang_id);

-- ---------------------------------------------------------------------------
-- Validasi tautan: kegiatan boleh ditautkan ke indikator milik pemiliknya
-- atau milik bidangnya.
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

-- ---------------------------------------------------------------------------
-- RLS indikator: superadmin kelola semua. User membaca miliknya atau bidangnya.
-- ---------------------------------------------------------------------------
drop policy if exists "indikator_select_own" on public.indikator;
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
