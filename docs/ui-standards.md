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
- Tanpa badge kapsul berisi kata umum seperti Baru atau Beta tanpa fungsi nyata.
- Tanpa FAQ template, tanpa logo bar, tanpa pricing tiga kolom, tanpa footer empat kolom template.

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
