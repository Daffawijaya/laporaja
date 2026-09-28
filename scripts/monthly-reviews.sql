-- Review bulanan: 1 baris = 1 laporan user per bulan.
-- Rekomendasi ditulis user; status + catatan revisi hanya boleh diubah superadmin
-- (dikunci trigger, bukan cuma UI). Jalankan di Supabase Dashboard > SQL Editor.
-- Aman dijalankan ulang (idempoten).

create table if not exists public.monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tahun integer not null,
  bulan integer not null check (bulan between 1 and 12),
  rekomendasi text,
  status text not null default 'menunggu'
    check (status in ('menunggu', 'revision', 'approved')),
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tahun, bulan)
);

alter table public.monthly_reviews enable row level security;

-- Sentuh updated_at otomatis + kunci kolom status/catatan untuk non-superadmin.
create or replace function public.handle_monthly_reviews()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    if TG_OP = 'UPDATE'
      and (NEW.status is distinct from OLD.status
        or NEW.catatan is distinct from OLD.catatan) then
      raise exception 'Hanya superadmin yang boleh mengubah status/catatan.';
    end if;
    if TG_OP = 'INSERT' and (NEW.status <> 'menunggu' or NEW.catatan is not null) then
      raise exception 'Baris baru selalu berstatus menunggu tanpa catatan.';
    end if;
  end if;
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists trg_monthly_reviews on public.monthly_reviews;
create trigger trg_monthly_reviews
  before insert or update on public.monthly_reviews
  for each row execute function public.handle_monthly_reviews();

-- RLS: user hanya milik sendiri, superadmin semua (cermin tabel reviews).
drop policy if exists "monthly_select_own" on public.monthly_reviews;
create policy "monthly_select_own" on public.monthly_reviews
  for select using (auth.uid() = user_id or public.is_superadmin());

drop policy if exists "monthly_insert_own" on public.monthly_reviews;
create policy "monthly_insert_own" on public.monthly_reviews
  for insert with check (auth.uid() = user_id or public.is_superadmin());

drop policy if exists "monthly_update_own" on public.monthly_reviews;
create policy "monthly_update_own" on public.monthly_reviews
  for update
  using (auth.uid() = user_id or public.is_superadmin())
  with check (auth.uid() = user_id or public.is_superadmin());

drop policy if exists "monthly_delete_admin" on public.monthly_reviews;
create policy "monthly_delete_admin" on public.monthly_reviews
  for delete using (public.is_superadmin());
