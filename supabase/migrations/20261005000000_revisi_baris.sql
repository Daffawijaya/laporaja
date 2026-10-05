-- Revisi per baris isian: admin menandai baris tertentu perlu diperbaiki
-- beserta catatannya; user melihat tanda + catatan di baris itu saja.
-- Ada baris = perlu revisi; hapus baris = batal revisi.
create table if not exists public.revisi_baris (
  baris_id uuid primary key references public.laporan_tambahan_baris (id) on delete cascade,
  catatan text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.revisi_baris enable row level security;

create or replace function public.handle_revisi_baris()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists trg_revisi_baris on public.revisi_baris;
create trigger trg_revisi_baris
  before insert or update on public.revisi_baris
  for each row execute function public.handle_revisi_baris();

-- Baca: pemilik baris atau superadmin.
drop policy if exists "revisi_select" on public.revisi_baris;
create policy "revisi_select" on public.revisi_baris
  for select using (
    public.is_superadmin()
    or exists (
      select 1 from public.laporan_tambahan_baris b
      where b.id = revisi_baris.baris_id and b.user_id = auth.uid()
    )
  );

-- Tulis: superadmin saja (user hanya memperbaiki isiannya).
drop policy if exists "revisi_insert_admin" on public.revisi_baris;
create policy "revisi_insert_admin" on public.revisi_baris
  for insert with check (public.is_superadmin());

drop policy if exists "revisi_update_admin" on public.revisi_baris;
create policy "revisi_update_admin" on public.revisi_baris
  for update
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "revisi_delete_admin" on public.revisi_baris;
create policy "revisi_delete_admin" on public.revisi_baris
  for delete using (public.is_superadmin());
