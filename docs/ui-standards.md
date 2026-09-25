# Standar Implementasi UI LaporAja

Referensi: https://github.com/miqdadbadjuber/anti-slop (filter, bukan style guide).
Arah visual LaporAja ada di `DESIGN.md`. Dokumen ini menerjemahkan prinsip anti-slop menjadi aturan kerja harian.

## Prinsip dasar

1. Teknik tanpa tujuan tidak dipakai. Setiap gradient, glass, shadow, animasi, ikon, atau card harus punya alasan satu baris. Kalau alasannya hanya terlihat modern, teknik itu dibuang.
2. Jujur lebih penting dari penuh. Tidak ada angka, testimoni, klaim keamanan, atau tautan yang dibuat-buat. Kosong lebih baik dari menipu.
3. Setiap tombol dan tautan harus berfungsi. Tidak ada kontrol mati. Placeholder harus berlabel jelas, misalnya Segera hadir, dan tercatat sebagai TODO di kode.
4. Setiap tampilan data wajib punya tiga kondisi: kosong, memuat, dan galat.
5. Mobile bukan tambahan. Tidak ada overflow horizontal, teks keluar wadah, atau target sentuh di bawah 44px.
6. Kontras teks memenuhi WCAG AA (4.5:1 untuk teks normal, 3:1 untuk teks besar).
7. Semua elemen interaktif bisa dipakai keyboard (Tab, Enter, Escape) dan punya indikator fokus yang terlihat. Tidak boleh menghapus outline tanpa pengganti.

## Batasan dosis LaporAja

- Glass maksimal 2 permukaan dalam satu layar.
- Tidak ada glow yang menyebar ke banyak elemen.
- Shadow hanya satu tingkat ringan untuk elevasi.
- Radius tidak seragam pil. Ikuti token: 10px untuk kontrol, 14px untuk panel.
- Palet aktif: netral + 1 aksen `#0071e3`.
- Animasi: hanya transisi lembut 160ms. Tidak ada Fade Up massal, floating, atau bounce sebagai default.
- Ikon: satu ikon per item navigasi yang relevan. Tanpa ikon generik AI dan tanpa panah di setiap tombol.
- Card bukan layout default. Gunakan teks dan pemisah bila cukup. Satu panel per layar bila memang perlu pembatas visual.
- Daftar bulanan memakai satu panel dengan pemisah tipis per hari, bukan satu card per kegiatan.
- Status memakai satu bahasa visual di semua layar: titik warna plus label. Menunggu Review netral, Disetujui emerald, Revisi amber.
- Tidak ada kalender. Aktivitas disusun sebagai daftar per tanggal yang ada isinya.
- Tanpa badge kapsul berisi kata umum seperti Baru atau Beta tanpa fungsi nyata.
- Tanpa FAQ template, tanpa logo bar, tanpa pricing tiga kolom, tanpa footer empat kolom template.

## Keadaan wajib di setiap layar

Setiap tampilan data dan form harus lengkap keadaannya, tanpa pengecualian.

1. Memuat: kerangka halaman lewat `loading.tsx` dan label tombol yang berubah saat sibuk.
2. Kosong: satu judul, satu kalimat bantuan, satu aksi berikutnya. Tidak lebih dari dua baris.
3. Galat: batas galat halaman lewat `error.tsx` dengan tombol Coba lagi, plus galat inline di form dan daftar.
4. Berhasil: toast singkat dari `useToast()` setelah aksi berhasil.
5. Hapus: selalu lewat `ConfirmDialog`.
6. Validasi form: wajib, panjang, dan format dicek sebelum kirim.
7. Nonaktif: kontrol dinonaktifkan saat menyimpan, dengan label proses yang jelas.
8. Unggah: progres bertahap "Mengunggah gambar X dari Y".
9. Galat gambar: pesan singkat dan tombol Coba lagi.
10. Sesi berakhir: arahkan ke `/login?expired=1` dengan keterangan singkat.

Bahasa galat selalu sederhana dan berorientasi tindakan. Tidak ada pesan
teknis (nama tabel, kode, atau pesan sistem) yang tampil ke pengguna biasa.

### Aturan validasi

- Nama kegiatan wajib, 2-200 karakter.
- Nama indikator wajib, 2-120 karakter.
- Jumlah per bulan wajib angka bulat 1-100000 saat diisi di menu Bidang atau User.
  Boleh kosong saat tambah cepat di menu Indikator.
- Indikator paling milik satu bidang atau satu user. Tanpa pemilik berarti global.
- Tanggal kegiatan wajib.
- Minimal satu keterangan per kegiatan.
- Blok teks tidak boleh kosong.
- Gambar harus bertipe gambar dan maksimal 5 MB.
- Review dengan status Revisi wajib memakai catatan.

## Pemeriksaan sebelum selesai

Blokir rilis bila salah satu jawabannya ya:

- Ada teks dengan em dash.
- Ada angka atau testimoni tanpa sumber nyata.
- Ada tautan navigasi ke halaman yang belum ada.
- Ada tombol yang tidak melakukan apa pun.
- Ada kondisi kosong, memuat, atau galat yang hilang.
- Ada kontras di bawah standar atau fokus keyboard yang rusak.
- Ada glass, shadow, atau animasi yang dipakai tanpa alasan tertulis.

Lolos bila:

- Dial ENERGY 1 / RHYTHM 1 / MOTION 1 konsisten dari login sampai dashboard.
- Ada satu titik fokus per layar.
- Whitespace memisahkan bagian, bukan sisa ruang.
- Ada satu aksen yang dipakai hemat, bukan nol dan bukan di semua tempat.
