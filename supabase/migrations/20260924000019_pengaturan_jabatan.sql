-- LaporAja pengaturan: awalan jabatan (mis. Tenaga Ahli Pendamping).
-- Jabatan tampil = awalan + bidang user + sub bidang user.
-- Cara pakai: tempel isi file ini sekali di Supabase Dashboard lalu SQL Editor.

insert into public.pengaturan (kunci, nilai) values
  ('jabatan_awalan', 'Tenaga Ahli Pendamping')
on conflict (kunci) do nothing;
