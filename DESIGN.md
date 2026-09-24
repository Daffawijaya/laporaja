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
- Liquid Glass dipakai hemat, maksimal 2 permukaan: bar navigasi dan panel login. Alasan: memisahkan lapisan navigasi dari konten tanpa menutup konten. Tidak dipakai di semua card, modal, dan sidebar sekaligus.
- Tanpa dekorasi yang tidak punya fungsi. Whitespace adalah struktur.

## Gerak

- Dial MOTION 1: hanya transisi hover 160ms `ease-out` untuk warna dan opacity.
- Hormati `prefers-reduced-motion`.

## Komposisi

- Bukan template Hero + grid fitur + testimoni + pricing + footer.
- Login: satu kolom terpusat, satu panel.
- Dashboard: satu header, satu daftar kosong, tanpa card berlebihan.
- Ikon Lucide hanya bila relevan dengan labelnya. Tanpa ikon sparkle, robot, atau sihir sebagai hiasan.

## Alasan tiap keputusan (R-31)

- Warna netral: agar laporan mudah dibaca dan tidak lelah dilihat.
- Satu aksen biru: menandai aksi utama saja.
- Glass hanya di navigasi: memberi konteks lapisan tanpa dekorasi tambahan.
- Radius 10/14: cukup lembut, tetap rapi, tidak seperti pil.
- Tanpa gradient: tidak membantu hierarki di aplikasi operasional.
