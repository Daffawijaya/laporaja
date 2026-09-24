# Database LaporAja

Tahap ini hanya database dan model data. Tidak ada fitur UI baru.

## File

- Migration siap pakai: `supabase/migrations/20260924000000_laporaja_foundation.sql`
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
- `keterangan_kegiatan`: mengikuti kepemilikan `kegiatan` induk.
- `reviews`: baca oleh pemilik kegiatan atau superadmin. Tulis, ubah, hapus
  hanya superadmin. User tidak dapat mengubah review.
- Storage `kegiatan-images`: baca tulis hanya folder milik sendiri atau
  superadmin.

## Cara pakai migration

Opsi SQL Editor:

1. Buka Supabase Dashboard lalu SQL Editor.
2. Tempel isi `20260924000000_laporaja_foundation.sql`.
3. Jalankan sekali.

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
