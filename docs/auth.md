# Auth LaporAja

## UX

Login hanya memakai username, kata sandi, dan tombol Masuk. Kata email tidak
pernah tampil di layar pengguna.

## Mekanisme internal

Supabase Auth butuh email secara internal. Aplikasi memetakan username menjadi
email sintetis `<username>@laporaja.internal` lewat `usernameToEmail` sebelum
memanggil `signInWithPassword`. Pemetaan ini tidak ditampilkan di UX.

Password tidak disimpan di tabel public. Trigger `handle_new_user` membuat
baris `profiles` dari metadata saat akun auth dibuat.

## Rute

- `/login`: bila sudah masuk, langsung diarahkan ke `/admin` atau `/laporan`.
- `/`: memeriksa sesi lalu mengarahkan ke `/login`, `/admin`, atau `/laporan`.
- `/admin`: hanya superadmin. User biasa diarahkan ke `/laporan`.
- `/laporan`: semua user yang masuk. Superadmin boleh membuka bila perlu,
  tetapi alur utama superadmin tetap `/admin`.

## Proteksi

- `src/proxy.ts` menyegarkan sesi di setiap request sehingga sesi tetap
  ada setelah refresh. Bila env Supabase belum diisi, proxy meneruskan request
  agar halaman menampilkan pesan konfigurasi yang jelas.
- `src/lib/auth/session.ts` menyediakan `requireUser` dan
  `requireSuperadmin` untuk layout server.
- `AuthListener` di root layout menyinkronkan perubahan sesi client
  (masuk, keluar, refresh token) ke Server Component lewat
  `router.refresh()`.
- Tidak ada registrasi publik di aplikasi. User hanya dibuat oleh superadmin
  lewat halaman `/admin/users` (didukung Server Actions memakai service role).

## Sesi dan keluar

- Sesi disimpan sebagai cookie oleh `@supabase/ssr` dengan opsi
  `path=/`, `sameSite=lax`, dan `secure` saat produksi.
- Cookie sengaja **tidak** `httpOnly`. Client Supabase di browser harus
  membacanya untuk menandatangani permintaan. Karena itu CSRF dimitigasi lewat
  `sameSite=lax` dan akses data tetap dibatasi RLS, bukan oleh flag cookie.
- Tombol Keluar memanggil `signOut` lalu mengarahkan ke `/login`.
- Sesi yang berakhir tanpa aksi pengguna ditangani `AuthListener`: peristiwa
  `SIGNED_OUT` mengarahkan ke `/login?expired=1` dan halaman masuk menampilkan
  keterangan singkat. Keluar sengaja ditandai agar tidak terbaca sebagai sesi
  berakhir.
- Tulis data di client dan Server Action mendeteksi galat sesi (status 401 atau
  kode PGRST301) lalu mengarahkan ke `/login?expired=1`.

## Seed superadmin pertama

Butuh `NEXT_PUBLIC_SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` di
`.env.local`, lalu jalankan:

```bash
npm run seed:superadmin -- <username> <kata-sandi> [nama]
```

Contoh:

```bash
npm run seed:superadmin -- admin ContohSandi08 "Admin Utama"
```

Script membuat akun auth dengan email internal yang sudah dikonfirmasi,
lalu menaikkan `profiles.role` menjadi `superadmin`. Bila akun sudah ada,
script memakai akun itu dan hanya memperbaiki profilnya.
