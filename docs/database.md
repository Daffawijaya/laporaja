# Database LaporAja

Tahap ini hanya database dan model data. Tidak ada fitur UI baru.

## File

- Migration siap pakai: `supabase/migrations/20260924000000_laporaja_foundation.sql`
- Guard service role: `supabase/migrations/20260924000001_profile_guard_service_role.sql`
- Batas berkas Storage: `supabase/migrations/20260924000002_storage_limits.sql`
  (maksimal 5 MB, hanya `image/jpeg`, `image/png`, `image/webp`, `image/gif`)
- Indikator kinerja: `supabase/migrations/20260924000003_indikator_kinerja.sql`
  (tabel `indikator` dan `kegiatan_indikator`)
- Penyederhanaan indikator: `supabase/migrations/20260924000004_indikator_sederhana.sql`
  (tanpa periode, tanpa cakupan bidang, target per bulan milik satu user)
- Indikator bidang atau user: `supabase/migrations/20260924000005_indikator_bidang_user.sql`
  (satu indikator tepat milik satu bidang atau satu user, dikelola dari menu
  Bidang dan menu User)
- Indikator global: `supabase/migrations/20260924000006_indikator_global.sql`
  (boleh tanpa pemilik, berlaku untuk semua, ditambah dari menu Indikator)
- Target opsional: `supabase/migrations/20260924000007_indikator_target_opsional.sql`
  (tambah indikator cukup isi nama, jumlah diisi di menu Bidang atau User)
- Tipe aplikasi: `src/lib/supabase/database.types.ts`
- Helper login username: `src/lib/auth/username.ts`
- Client Supabase (sudah memakai tipe `Database`):
  `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`

## Relasi

- `profiles.id` -> `auth.users.id` (cascade, 1 banding 1)
- `profiles.bidang_id` -> `bidang.id` (set null bila bidang dihapus)
- `user_sub_bidang.user_id` -> `profiles.id` (cascade)
- `kegiatan.user_id` -> `profiles.id` (cascade)
- `keterangan_kegiatan.kegiatan_id` -> `kegiatan.id` (cascade)
- `reviews.kegiatan_id` -> `kegiatan.id` (cascade, unik, satu review aktif per kegiatan)
- `indikator.bidang_id` -> `bidang.id` (cascade, milik satu bidang)
- `indikator.user_id` -> `profiles.id` (cascade, milik satu user)
- `kegiatan_indikator.kegiatan_id` -> `kegiatan.id` (cascade)
- `kegiatan_indikator.indikator_id` -> `indikator.id` (cascade)
- Storage `kegiatan-images` path `<user_id>/<kegiatan_id>/...`

Contoh sesuai kebutuhan: user Daffa pada bidang Digitalisasi memiliki 3 baris
di `user_sub_bidang` (Tenggarong, Anggana, Loa Janan), bukan satu string.

Urutan `keterangan_kegiatan.urutan` unik per kegiatan sehingga kombinasi
text, image, text, image dapat disimpan berurutan. Untuk `tipe = 'image'`,
kolom `isi_text` dipakai sebagai caption opsional.

## Login username tanpa email sebagai UX

Supabase Auth tetap menjadi penyimpan password yang aman. Tidak ada kolom
password di tabel public.

Alurnya:

1. User mengetik `username` dan `password` di UI.
2. Aplikasi memanggil `usernameToEmail(username)` menjadi
   `<username>@laporaja.internal`.
3. Aplikasi memanggil `supabase.auth.signInWithPassword` memakai email sintetis itu.
4. Pendaftaran mengirim `raw_user_meta_data` berisi `username` dan `nama`,
   lalu trigger `handle_new_user` membuat baris `profiles`.

Aturan username: huruf kecil, angka, titik, underscore, strip, 3-32 karakter.

## RLS

- `bidang`: dibaca semua user login, tulis hanya superadmin.
- `profiles`: baca milik sendiri atau superadmin. Insert langsung hanya
  superadmin (pendaftaran normal lewat trigger). Update milik sendiri atau
  superadmin, tetapi trigger `prevent_profile_privilege_escalation`
  memblokir user biasa yang mengubah `role` atau `bidang_id`.
- `user_sub_bidang` dan `kegiatan`: hanya pemilik (`user_id = auth.uid()`)
  atau superadmin.
- `indikator`: baca oleh superadmin atau user yang tercakup (global, miliknya,
  atau bidangnya). Tulis hanya superadmin. Paling satu pemilik (keduanya
  kosong berarti global). Target `target_bulanan` berarti jumlah per bulan.
  Tautan `kegiatan_indikator` divalidasi trigger `validate_kegiatan_indikator`
  agar kegiatan hanya ditautkan ke indikator yang berlaku untuk pemiliknya.
- `keterangan_kegiatan`: mengikuti kepemilikan `kegiatan` induk.
- `reviews`: baca oleh pemilik kegiatan atau superadmin. Tulis, ubah, hapus
  hanya superadmin. User tidak dapat mengubah review.
- Storage `kegiatan-images`: baca tulis hanya folder milik sendiri atau
  superadmin. Batas 5 MB dan tipe gambar ditegakkan di level bucket lewat
  migration `20260924000002_storage_limits.sql`. Saat akun user dihapus,
  gambarnya ikut dibersihkan agar tidak ada berkas yatim.

## Cara pakai migration

Opsi SQL Editor:

1. Buka Supabase Dashboard lalu SQL Editor.
2. Tempel dan jalankan setiap file di `supabase/migrations/` secara berurutan.
3. Jalankan sekali per file.

Opsi CLI (bila memakai Supabase local):

```bash
supabase db push
```

## Membuat superadmin pertama

1. Daftar satu akun lewat Auth seperti biasa.
2. Jalankan SQL ini dengan username yang didaftarkan:

```sql
update public.profiles
set role = 'superadmin'
where username = 'admin';
```

3. Login ulang agar klaim peran baru terbaca.

## Konsistensi dengan aplikasi

- `database.types.ts` sama persis dengan constraint di migration:
  `Role`, `KeteranganTipe`, `ReviewStatus`, dan bentuk Insert/Update.
- `username.ts` memakai domain dan pola yang sama dengan trigger
  `handle_new_user` dan check `profiles.username`.
- Tidak ada perubahan halaman login atau dashboard pada tahap ini.
  Penyambungan form username ke helper auth dikerjakan pada tahap fitur auth.
