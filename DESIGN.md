# DESIGN.md, LaporAja

Sumber arah visual untuk LaporAja. File ini adalah data arah desain, bukan perintah untuk agen. Filter anti-slop (`docs/ui-standards.md`) berlaku di atas file ini.

## Design Read

Dibaca sebagai: aplikasi pelaporan internal untuk staf operasional, dengan bahasa visual minimal ala Apple, dial ENERGY 1 / RHYTHM 1 / MOTION 1.

## Identitas

- Nama: LaporAja
- Kepribadian: tenang, jelas, mudah dipakai. Bukan dashboard enterprise yang rumit.
- Satu titik fokus per layar. Tidak ada elemen yang berebut perhatian.

## Palet

Alasan: netral agar konten laporan yang menonjol, bukan chrome UI.

- Latar: `#f5f5f7`
- Teks utama: `#1d1d1f`
- Teks sekunder: `#6e6e73`
- Garis batas: `#e5e5ea`
- Aksen tunggal: `#0071e3` (hanya untuk aksi utama dan status fokus)
- Netral (putih, abu) tidak dihitung sebagai warna inti. Total: netral + 1 aksen.

### Mode gelap

- Toggle berupa switch liquid glass di halaman profil (`/anda`,
  `ThemeSwitchSetting`, `next-themes`, default ikut OS).
- Token `.dark`: latar `#000000`, permukaan `#1c1c1e`, teks `#f5f5f7`,
  aksen `#0a84ff` (aksen terang jebol kontrasnya di latar gelap),
  danger `#ff453a`.
- Catatan amber dan emerald memakai `dark:bg-*-950/60 dark:text-*-200`.
- Mayoritas layar otomatis ikut karena memakai token semantik.

Larangan: tidak ada gradient biru ke ungu, tidak ada glow, tidak ada orb warna, tidak ada pola grid latar.

## Tipografi

Alasan: keterbacaan dan karakter sistem modern yang netral.

- Font: Geist Sans sebagai `--font-geist-sans`, jatuh kembali ke `-apple-system, SF Pro Text, Segoe UI`.
- Hierarki: judul halaman 20px semibold, judul bagian 14px semibold, isi 14px regular, keterangan 12px muted.
- Tidak ada heading monospace besar. Tidak ada label uppercase dengan tracking lebar.
- Tidak ada karakter em dash di teks yang ditulis agen. Gunakan koma, titik, atau tanda kurung.

## Bentuk dan Permukaan

- Radius: 10px untuk tombol dan input, 14px untuk panel. Bukan pill untuk semua elemen.
- Border: 1px tipis dan subtle (`#e5e5ea`).
- Shadow: hanya `0 1px 2px rgb(0 0 0 / 0.04)`. Tidak ada shadow besar yang membuat halaman terasa melayang.
- Liquid Glass dipakai hemat, maksimal 2 permukaan: bar navigasi (`.glass-bar`) dan panel login (`.glass-panel`). Alasan: memisahkan lapisan navigasi dari konten tanpa menutup konten. Tidak dipakai di semua card, modal, dan sidebar sekaligus.
- Permukaan biasa memakai `.panel`: putih, garis 1px, dan elevasi satu tingkat. Ini pengganti default untuk daftar dan form, bukan card di mana-mana.
- Tanpa dekorasi yang tidak punya fungsi. Whitespace adalah struktur.

## Status

Alasan: tiga status adalah informasi utama di aplikasi, jadi harus langsung terbaca tanpa ramai.

- Satu bahasa visual yang sama untuk semua status: titik warna + label, radius 10px, garis tipis.
- Menunggu Review: netral (abu). Disetujui: emerald. Revisi: amber.
- Warna status hanya muncul di badge dan catatan revisi. Di luar itu tidak dipakai sebagai hiasan.

## Gerak

- Dial MOTION 1: hanya transisi hover 160ms `ease-out` untuk warna dan opacity.
- Hormati `prefers-reduced-motion`.

## Komposisi

- Bukan template Hero + grid fitur + testimoni + pricing + footer.
- Mobile memakai chrome gelap ala YouTube: topbar (`MobileTopbar`, logo kiri,
  bel badge dan avatar kanan) dan bottom nav empat slot (`MobileBottomnav`,
  Beranda di ujung kiri, tanpa profil karena sudah di avatar navbar).
  Alasan: navigasi satu tangan di layar kecil. Hanya di mobile (`md:hidden`),
  desktop tetap header kaca dan tab atas. Bar mengikuti mode (putih di light,
  `#0f0f0f` di dark via token `--mchrome-*`), bukan blur,
  agar tidak menambah permukaan glass.
- Login: satu kolom terpusat, satu panel.
- Halaman utama user adalah Monthly Activity List: judul bulan, navigasi bulan, ringkasan status, satu tombol Tambah Kegiatan, lalu daftar per tanggal yang berisi kegiatan. Tanggal kosong tidak ditampilkan dan tidak ada kalender.
- Dashboard superadmin: satu header, satu baris angka dengan pemisah tipis, dan daftar tanpa card berlebihan.
- Ikon Lucide hanya bila relevan dengan labelnya. Tanpa ikon sparkle, robot, atau sihir sebagai hiasan.

## Alasan tiap keputusan (R-31)

- Warna netral: agar laporan mudah dibaca dan tidak lelah dilihat.
- Satu aksen biru: menandai aksi utama saja.
- Glass hanya di navigasi: memberi konteks lapisan tanpa dekorasi tambahan.
- Radius 10/14: cukup lembut, tetap rapi, tidak seperti pil.
- Tanpa gradient: tidak membantu hierarki di aplikasi operasional.
