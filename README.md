# LaporAja

Aplikasi pelaporan internal. Login memakai username dan kata sandi
(tanpa email di UX). Peran: `superadmin` masuk ke `/admin`,
`user` masuk ke `/laporan`.

## Jalankan lokal

```bash
npm install
npm run dev
```

Isi dulu `.env.local` (salin dari `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (hanya server dan script seed)

## Buat superadmin pertama

Tidak ada registrasi publik. User hanya dibuat lewat akun auth
dengan profil `superadmin`:

```bash
npm run seed:superadmin -- <username> <kata-sandi> [nama]
```

Contoh:

```bash
npm run seed:superadmin -- admin ContohSandi08 "Admin Utama"
```

Lalu masuk di `/login` memakai username dan kata sandi itu.
