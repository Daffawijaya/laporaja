-- Laporaja pengaturan umum (kunci-nilai): mis. unit kerja yang tampil di
-- rekap admin dan bisa diubah dari kartu Info di builder section.
-- Cara pakai: tempel isi file ini sekali di Supabase Dashboard lalu SQL Editor.

create table if not exists public.pengaturan (
  kunci text primary key,
  nilai text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists set_pengaturan_updated_at on public.pengaturan;
create trigger set_pengaturan_updated_at
  before update on public.pengaturan
  for each row execute function public.handle_updated_at();

insert into public.pengaturan (kunci, nilai) values
  ('unit_kerja', 'Diskop UKM Kutai Kartanegara - Bidang Pemberdayaan Usaha Mikro (PUM)')
on conflict (kunci) do nothing;

alter table public.pengaturan enable row level security;

drop policy if exists "pengaturan_select_all" on public.pengaturan;
create policy "pengaturan_select_all"
  on public.pengaturan for select
  to authenticated
  using (true);

drop policy if exists "pengaturan_write_superadmin" on public.pengaturan;
create policy "pengaturan_write_superadmin"
  on public.pengaturan for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());
