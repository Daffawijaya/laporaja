-- Section: judul kegiatan + hapus indikator (keputusan: section tetap
-- hanya LAPORAN KEGIATAN PENDAMPINGAN + Rekomendasi dan Tindak Lanjut).

update public.laporan_section
  set judul = 'LAPORAN KEGIATAN PENDAMPINGAN'
  where kode = 'kegiatan';

delete from public.laporan_section_bidang where kode = 'indikator';
delete from public.laporan_section where kode = 'indikator';
