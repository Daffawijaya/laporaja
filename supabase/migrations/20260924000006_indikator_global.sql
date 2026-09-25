-- LaporAja indikator global
-- Scope: indikator boleh tanpa pemilik (global, berlaku untuk semua user).
-- Form tambah di menu Indikator hanya nama dan jumlah per bulan.
-- Indikator khusus bidang atau user tetap dikelola dari menu Bidang dan User.
-- Aturan cakupan: paling satu pemilik (keduanya kosong berarti global).

alter table public.indikator
  drop constraint if exists indikator_scope_check;

alter table public.indikator
  add constraint indikator_scope_check check (
    not (bidang_id is not null and user_id is not null)
  );

-- ---------------------------------------------------------------------------
-- Validasi tautan: global berlaku untuk semua, sisanya milik pemilik atau bidangnya.
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
        (bidang_id is null and user_id is null)
        or user_id = v_user_id
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
-- RLS indikator: superadmin kelola semua. User membaca yang global,
-- miliknya, atau bidangnya.
-- ---------------------------------------------------------------------------
drop policy if exists "indikator_select_applicable" on public.indikator;
create policy "indikator_select_applicable"
  on public.indikator for select
  to authenticated
  using (
    public.is_superadmin()
    or (bidang_id is null and user_id is null)
    or user_id = auth.uid()
    or (
      bidang_id is not null
      and bidang_id = (
        select bidang_id from public.profiles where id = auth.uid()
      )
    )
  );
