-- LaporAja foundation migration
-- Scope: database dan model data saja. Tidak ada perubahan UI.
--
-- Strategi auth:
-- - Password tidak pernah disimpan di tabel public. Sumber kebenaran password
--   adalah Supabase Auth (auth.users) yang memakai hashing aman.
-- - Login UX memakai username + password. Aplikasi memetakan username menjadi
--   email sintetis "<username>@laporaja.internal" sebelum memanggil
--   supabase.auth.signInWithPassword. Lihat src/lib/auth/username.ts.
-- - profiles.id adalah FK ke auth.users.id (on delete cascade).

create extension if not exists "pgcrypto";

-- Helper: updated_at otomatis (tidak bergantung tabel apa pun)
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabel: bidang (dikelola superadmin, dibaca semua user login)
-- ---------------------------------------------------------------------------
create table if not exists public.bidang (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique check (char_length(nama) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabel: profiles (1 baris per auth.users, username unik untuk login UX)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  nama text not null check (char_length(nama) between 2 and 120),
  role text not null default 'user' check (role in ('superadmin', 'user')),
  bidang_id uuid references public.bidang (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabel: user_sub_bidang (relasional, satu user punya banyak baris)
-- Contoh: user Daffa -> Kecamatan Tenggarong, Anggana, Loa Janan (3 baris).
-- ---------------------------------------------------------------------------
create table if not exists public.user_sub_bidang (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  nama text not null check (char_length(nama) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, nama)
);

-- ---------------------------------------------------------------------------
-- Tabel: kegiatan (milik satu user)
-- ---------------------------------------------------------------------------
create table if not exists public.kegiatan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tanggal date not null,
  nama_kegiatan text not null check (char_length(nama_kegiatan) between 2 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabel: keterangan_kegiatan (urutan campuran text/image)
-- Aturan isi:
-- - tipe 'text': isi_text wajib, image_url harus null.
-- - tipe 'image': image_url wajib, isi_text opsional sebagai caption/deskripsi.
-- ---------------------------------------------------------------------------
create table if not exists public.keterangan_kegiatan (
  id uuid primary key default gen_random_uuid(),
  kegiatan_id uuid not null references public.kegiatan (id) on delete cascade,
  tipe text not null check (tipe in ('text', 'image')),
  isi_text text,
  image_url text,
  urutan integer not null default 0 check (urutan >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kegiatan_id, urutan),
  check (
    (tipe = 'text' and isi_text is not null and isi_text <> '' and image_url is null)
    or
    (tipe = 'image' and image_url is not null and image_url <> '')
  )
);

-- ---------------------------------------------------------------------------
-- Tabel: reviews (satu review aktif per kegiatan, ditulis superadmin)
-- - status 'revision' wajib menyertakan catatan perbaikan.
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  kegiatan_id uuid not null unique references public.kegiatan (id) on delete cascade,
  status text not null check (status in ('approved', 'revision')),
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status = 'approved'
    or (status = 'revision' and catatan is not null and catatan <> '')
  )
);

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------
create index if not exists profiles_bidang_id_idx on public.profiles (bidang_id);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists user_sub_bidang_user_id_idx on public.user_sub_bidang (user_id);
create index if not exists kegiatan_user_id_tanggal_idx on public.kegiatan (user_id, tanggal desc);
create index if not exists keterangan_kegiatan_kegiatan_urutan_idx
  on public.keterangan_kegiatan (kegiatan_id, urutan);
create index if not exists reviews_kegiatan_id_idx on public.reviews (kegiatan_id);

-- ---------------------------------------------------------------------------
-- Helper: cek superadmin (bypass RLS karena SECURITY DEFINER).
-- Didefinisikan setelah tabel profiles ada agar validasi fungsi lolos.
-- ---------------------------------------------------------------------------
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'superadmin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists set_bidang_updated_at on public.bidang;
create trigger set_bidang_updated_at
  before update on public.bidang
  for each row execute function public.handle_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists set_user_sub_bidang_updated_at on public.user_sub_bidang;
create trigger set_user_sub_bidang_updated_at
  before update on public.user_sub_bidang
  for each row execute function public.handle_updated_at();

drop trigger if exists set_kegiatan_updated_at on public.kegiatan;
create trigger set_kegiatan_updated_at
  before update on public.kegiatan
  for each row execute function public.handle_updated_at();

drop trigger if exists set_keterangan_updated_at on public.keterangan_kegiatan;
create trigger set_keterangan_updated_at
  before update on public.keterangan_kegiatan
  for each row execute function public.handle_updated_at();

drop trigger if exists set_reviews_updated_at on public.reviews;
create trigger set_reviews_updated_at
  before update on public.reviews
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger: buat profile otomatis saat auth.users baru dibuat.
-- Mengambil username/nama dari raw_user_meta_data yang dikirim aplikasi.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_username text;
  meta_nama text;
begin
  meta_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  meta_nama := coalesce(new.raw_user_meta_data ->> 'nama', meta_username);

  if meta_username ~ '^[a-z0-9._-]{3,32}$' then
    insert into public.profiles (id, username, nama, role)
    values (new.id, meta_username, meta_nama, 'user')
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guard: user biasa tidak boleh mengubah role atau bidang_id miliknya.
-- Hanya superadmin yang boleh mengubah dua kolom itu.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
as $$
begin
  if old.role is distinct from new.role
    or old.bidang_id is distinct from new.bidang_id then
    if not public.is_superadmin() then
      raise exception 'Hanya superadmin yang boleh mengubah role atau bidang.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privilege on public.profiles;
create trigger guard_profile_privilege
  before update of role, bidang_id on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.bidang enable row level security;
alter table public.profiles enable row level security;
alter table public.user_sub_bidang enable row level security;
alter table public.kegiatan enable row level security;
alter table public.keterangan_kegiatan enable row level security;
alter table public.reviews enable row level security;

grant select, insert, update, delete on public.bidang to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_sub_bidang to authenticated;
grant select, insert, update, delete on public.kegiatan to authenticated;
grant select, insert, update, delete on public.keterangan_kegiatan to authenticated;
grant select, insert, update, delete on public.reviews to authenticated;

-- bidang: semua user login boleh membaca, hanya superadmin boleh menulis.
drop policy if exists "bidang_select_authenticated" on public.bidang;
create policy "bidang_select_authenticated"
  on public.bidang for select
  to authenticated
  using (true);

drop policy if exists "bidang_write_superadmin" on public.bidang;
create policy "bidang_write_superadmin"
  on public.bidang for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- profiles: user melihat/mengelola miliknya, superadmin mengelola semua.
-- Insert langsung hanya superadmin (pendaftaran normal lewat trigger).
drop policy if exists "profiles_select_own_or_superadmin" on public.profiles;
create policy "profiles_select_own_or_superadmin"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_superadmin());

drop policy if exists "profiles_insert_superadmin" on public.profiles;
create policy "profiles_insert_superadmin"
  on public.profiles for insert
  to authenticated
  with check (public.is_superadmin());

drop policy if exists "profiles_update_own_or_superadmin" on public.profiles;
create policy "profiles_update_own_or_superadmin"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id or public.is_superadmin())
  with check (auth.uid() = id or public.is_superadmin());

drop policy if exists "profiles_delete_superadmin" on public.profiles;
create policy "profiles_delete_superadmin"
  on public.profiles for delete
  to authenticated
  using (public.is_superadmin());

-- user_sub_bidang: pemilik atau superadmin.
drop policy if exists "user_sub_bidang_owner_all" on public.user_sub_bidang;
create policy "user_sub_bidang_owner_all"
  on public.user_sub_bidang for all
  to authenticated
  using (auth.uid() = user_id or public.is_superadmin())
  with check (auth.uid() = user_id or public.is_superadmin());

-- kegiatan: pemilik atau superadmin.
drop policy if exists "kegiatan_owner_all" on public.kegiatan;
create policy "kegiatan_owner_all"
  on public.kegiatan for all
  to authenticated
  using (auth.uid() = user_id or public.is_superadmin())
  with check (auth.uid() = user_id or public.is_superadmin());

-- keterangan_kegiatan: mengikuti kepemilikan kegiatan induk.
drop policy if exists "keterangan_select_owner" on public.keterangan_kegiatan;
create policy "keterangan_select_owner"
  on public.keterangan_kegiatan for select
  to authenticated
  using (
    exists (
      select 1 from public.kegiatan k
      where k.id = keterangan_kegiatan.kegiatan_id
        and (k.user_id = auth.uid() or public.is_superadmin())
    )
  );

drop policy if exists "keterangan_insert_owner" on public.keterangan_kegiatan;
create policy "keterangan_insert_owner"
  on public.keterangan_kegiatan for insert
  to authenticated
  with check (
    exists (
      select 1 from public.kegiatan k
      where k.id = keterangan_kegiatan.kegiatan_id
        and (k.user_id = auth.uid() or public.is_superadmin())
    )
  );

drop policy if exists "keterangan_update_owner" on public.keterangan_kegiatan;
create policy "keterangan_update_owner"
  on public.keterangan_kegiatan for update
  to authenticated
  using (
    exists (
      select 1 from public.kegiatan k
      where k.id = keterangan_kegiatan.kegiatan_id
        and (k.user_id = auth.uid() or public.is_superadmin())
    )
  )
  with check (
    exists (
      select 1 from public.kegiatan k
      where k.id = keterangan_kegiatan.kegiatan_id
        and (k.user_id = auth.uid() or public.is_superadmin())
    )
  );

drop policy if exists "keterangan_delete_owner" on public.keterangan_kegiatan;
create policy "keterangan_delete_owner"
  on public.keterangan_kegiatan for delete
  to authenticated
  using (
    exists (
      select 1 from public.kegiatan k
      where k.id = keterangan_kegiatan.kegiatan_id
        and (k.user_id = auth.uid() or public.is_superadmin())
    )
  );

-- reviews: user boleh membaca review miliknya, tulis hanya superadmin.
drop policy if exists "reviews_select_owner_or_superadmin" on public.reviews;
create policy "reviews_select_owner_or_superadmin"
  on public.reviews for select
  to authenticated
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.kegiatan k
      where k.id = reviews.kegiatan_id
        and k.user_id = auth.uid()
    )
  );

drop policy if exists "reviews_write_superadmin" on public.reviews;
create policy "reviews_write_superadmin"
  on public.reviews for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- Storage privat untuk gambar keterangan: bucket kegiatan-images.
-- Path wajib diawali user id: "<user_id>/<kegiatan_id>/...".
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('kegiatan-images', 'kegiatan-images', false)
on conflict (id) do nothing;

drop policy if exists "kegiatan_images_select_owner" on storage.objects;
create policy "kegiatan_images_select_owner"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kegiatan-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_superadmin()
    )
  );

drop policy if exists "kegiatan_images_insert_owner" on storage.objects;
create policy "kegiatan_images_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kegiatan-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_superadmin()
    )
  );

drop policy if exists "kegiatan_images_update_owner" on storage.objects;
create policy "kegiatan_images_update_owner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'kegiatan-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_superadmin()
    )
  )
  with check (
    bucket_id = 'kegiatan-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_superadmin()
    )
  );

drop policy if exists "kegiatan_images_delete_owner" on storage.objects;
create policy "kegiatan_images_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kegiatan-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_superadmin()
    )
  );
