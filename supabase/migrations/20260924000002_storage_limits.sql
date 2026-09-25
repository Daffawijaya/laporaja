-- LaporAja migration 000002
-- Scope: batasi ukuran dan tipe berkas pada bucket kegiatan-images.
--
-- Validasi di klien bisa dilewati dengan permintaan langsung ke Storage API,
-- jadi batas ini ditegakkan di sisi bucket dan berlaku untuk semua jalur.
--
-- Cara pakai: tempel isi file ini sekali di Supabase Dashboard lalu SQL Editor.

update storage.buckets
set file_size_limit = 5242880, -- 5 MB, sama dengan MAX_IMAGE_BYTES di aplikasi
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'kegiatan-images';
