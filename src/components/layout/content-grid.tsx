// Grid konten desktop: satu kolom menumpuk di mobile, dua kolom di lg.
// Kolom utama full-bleed mengisi gutter kiri-kanan, aside 300px sticky
// berisi info kontekstual (filter, ringkasan, meta). Teks panjang di kolom
// utama tetap dikunci max-w-prose agar terbaca di layar ultra-lebar.
// Alasan: satu pola mengisi ruang desktop untuk semua halaman.
export function ContentGrid({
  children,
  aside,
  gapClassName = "lg:gap-8",
}: {
  children: React.ReactNode;
  aside: React.ReactNode;
  gapClassName?: string;
}) {
  return (
    <div className={`w-full lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start ${gapClassName}`}>
      <div className="min-w-0">{children}</div>
      <aside className="mt-8 min-w-0 self-start lg:mt-0">
        <div className="flex flex-col gap-6">{aside}</div>
      </aside>
    </div>
  );
}
