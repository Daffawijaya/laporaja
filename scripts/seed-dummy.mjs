import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const AUTH_EMAIL_DOMAIN = "laporaja.internal";
const DUMMY_PASSWORD = "dummy1234";

function loadEnvFile(filename) {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function findUserIdByEmail(admin, email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const found = data.users.find(
      (u) => u.email && u.email.toLowerCase() === email
    );
    if (found) return found.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

// Data dummy sementara untuk preview tampilan dashboard.
// Idempoten: boleh dijalankan ulang, data dummy lama diganti yang baru.
const DUMMY_USERS = [
  { username: "andi", nama: "Andi Pratama", bidang: "Digitalisasi", subs: ["Aplikasi", "Website"] },
  { username: "budi", nama: "Budi Santoso", bidang: "Digitalisasi", subs: ["Jaringan"] },
  { username: "citra", nama: "Citra Lestari", bidang: "Pemasaran", subs: ["Sosial Media", "Event"] },
  { username: "dewi", nama: "Dewi Anggraini", bidang: "Keuangan", subs: ["Anggaran"] },
  { username: "eko", nama: "Eko Wijaya", bidang: null, subs: [] },
];

const KEGIATAN_POOL = [
  "Apel pagi dan briefing tim",
  "Monitoring progres mingguan",
  "Koordinasi lintas bidang",
  "Penyusunan laporan harian",
  "Kunjungan lapangan",
  "Rapat evaluasi bulanan",
  "Pendataan arsip dokumen",
  "Sosialisasi program kerja",
];

const CATATAN_REVISI = [
  "Foto kegiatan kurang jelas, mohon dilengkapi.",
  "Uraian terlalu singkat, tambahkan hasil kegiatannya.",
  "Tanggal kegiatan tidak sesuai jadwal, periksa kembali.",
];

// Foto contoh untuk baris keterangan bertipe "image". URL-nya diisi utuh
// http(s) supaya aplikasi memakainya langsung tanpa perlu upload ke Storage
// (lihat getSignedImageUrl di src/lib/supabase/storage.ts). Foto dari Pexels
// (bebas dipakai), semata-mata agar tampilan preview punya gambar.
const GAMBAR_CONTOH = [
  "https://images.pexels.com/photos/7888985/pexels-photo-7888985.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/12969403/pexels-photo-12969403.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/590016/pexels-photo-590016.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/7688173/pexels-photo-7688173.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/7640830/pexels-photo-7640830.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/7709268/pexels-photo-7709268.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/3184328/pexels-photo-3184328.jpeg?auto=compress&cs=tinysrgb&w=1200",
];

// Urutan tetap: nama kegiatan ke-i memakai foto ke-i, jadi gambar tiap
// kegiatan konsisten walau seeder dijalankan ulang.
const GAMBAR_PER_KEGIATAN = new Map(
  KEGIATAN_POOL.map((nama, i) => [nama, GAMBAR_CONTOH[i % GAMBAR_CONTOH.length]])
);

async function main() {
  loadEnvFile(".env.local");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail("Env belum lengkap. Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local.");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Bidang (pakai yang ada, tambah yang kurang).
  const bidangNames = [...new Set(DUMMY_USERS.map((u) => u.bidang).filter(Boolean))];
  const { data: bidangExisting, error: bidangErr } = await supabase.from("bidang").select("id, nama");
  if (bidangErr) fail(`Gagal memuat bidang: ${bidangErr.message}`);
  const bidangByNama = new Map((bidangExisting ?? []).map((b) => [b.nama, b.id]));
  for (const nama of bidangNames) {
    if (bidangByNama.has(nama)) continue;
    const { data, error } = await supabase.from("bidang").insert({ nama }).select("id").single();
    if (error || !data) fail(`Gagal menambah bidang '${nama}': ${error?.message}`);
    bidangByNama.set(nama, data.id);
  }
  console.log(`${bidangByNama.size} bidang siap.`);

  // 2. Akun + profil dummy.
  const userIds = [];
  for (const dummy of DUMMY_USERS) {
    const email = `${dummy.username}@${AUTH_EMAIL_DOMAIN}`;
    let userId = null;
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: DUMMY_PASSWORD,
      email_confirm: true,
      user_metadata: { username: dummy.username, nama: dummy.nama },
    });
    if (created?.user) {
      userId = created.user.id;
    } else if (createError && /already|exists|registered|duplicate/i.test(createError.message)) {
      userId = await findUserIdByEmail(supabase.auth.admin, email);
      if (!userId) fail(`Akun '${dummy.username}' sudah ada tetapi tidak ditemukan.`);
    } else if (createError) {
      fail(`Gagal membuat akun '${dummy.username}': ${createError.message}`);
    }
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        username: dummy.username,
        nama: dummy.nama,
        role: "user",
        bidang_id: dummy.bidang ? (bidangByNama.get(dummy.bidang) ?? null) : null,
      },
      { onConflict: "id" }
    );
    if (profileError) fail(`Gagal menyimpan profil '${dummy.username}': ${profileError.message}`);
    userIds.push(userId);
  }
  console.log(`${userIds.length} user dummy siap (kata sandi: ${DUMMY_PASSWORD}).`);

  // 3. Bersihkan data turunan dummy lama agar bisa dijalankan ulang.
  const { data: oldKegiatan } = await supabase.from("kegiatan").select("id").in("user_id", userIds);
  const oldIds = (oldKegiatan ?? []).map((k) => k.id);
  if (oldIds.length > 0) {
    await supabase.from("kegiatan_indikator").delete().in("kegiatan_id", oldIds);
    await supabase.from("reviews").delete().in("kegiatan_id", oldIds);
    await supabase.from("keterangan_kegiatan").delete().in("kegiatan_id", oldIds);
    await supabase.from("kegiatan").delete().in("id", oldIds);
  }
  await supabase.from("monthly_reviews").delete().in("user_id", userIds);
  for (const userId of userIds) {
    await supabase.from("user_sub_bidang").delete().eq("user_id", userId);
  }

  // 4. Sub bidang dummy.
  for (let i = 0; i < DUMMY_USERS.length; i++) {
    for (const nama of DUMMY_USERS[i].subs) {
      const { error } = await supabase.from("user_sub_bidang").insert({ user_id: userIds[i], nama });
      if (error) fail(`Gagal menambah sub bidang: ${error.message}`);
    }
  }

  // 5. Kegiatan bulan berjalan. Sebaran status bulanan yang ditarget:
  // andi=Selesai, budi=Revisi (kegiatan), citra=Menunggu,
  // dewi=Revisi (rekomendasi), eko=Belum lapor (tanpa kegiatan).
  // Beberapa hari sengaja diisi lebih dari 1 kegiatan.
  const HARI_PER_USER = [
    [1, 1, 2, 3, 5], // andi
    [2, 2, 3, 5], // budi
    [3, 5, 7], // citra
    [1, 3, 3, 5], // dewi
    [], // eko
  ];
  const now = new Date();
  const tahun = now.getFullYear();
  const bulan = now.getMonth() + 1;
  const lastDate = new Date(tahun, bulan, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");

  const kegiatanRows = [];
  DUMMY_USERS.forEach((dummy, ui) => {
    HARI_PER_USER[ui].forEach((day, k) => {
      if (day < 1 || day > lastDate) return;
      kegiatanRows.push({
        user_id: userIds[ui],
        tanggal: `${tahun}-${pad(bulan)}-${pad(day)}`,
        nama_kegiatan: KEGIATAN_POOL[(ui * 3 + k) % KEGIATAN_POOL.length],
        _ui: ui,
        _k: k,
      });
    });
  });
  const { data: kegiatanInserted, error: kegiatanError } = await supabase
    .from("kegiatan")
    .insert(kegiatanRows.map(({ _ui, _k, ...row }) => row))
    .select("id, user_id, tanggal, nama_kegiatan");
  if (kegiatanError) fail(`Gagal menambah kegiatan: ${kegiatanError.message}`);
  console.log(`${kegiatanInserted.length} kegiatan dummy dibuat.`);

  // Rekomendasi tiap user (kalimat depannya kapital). eko tanpa baris
  // (belum lapor); dewi direvisi agar tombol Setujui-nya terkunci.
  const REKOMENDASI = [
    "Kegiatan bulan ini berjalan lancar sesuai rencana. Perlu percepatan input data harian agar rekap mingguan tepat waktu.",
    "Monitoring progres perlu ditindaklanjuti lewat rapat koordinasi. Hasil lapangan dilaporkan setiap Jumat.",
    "Sosialisasi program kerja butuh materi tambahan. Evaluasi event dibahas bersama tim pemasaran.",
    "Arsip dokumen perlu digitalisasi bertahap.",
  ];

  // 6. Keterangan teks + gambar + review per user:
  // andi semua approved; budi kegiatan pertama revision sisanya approved;
  // citra tanpa review; dewi kegiatan pertama revision sisanya tanpa review.
  const perUser = DUMMY_USERS.map((dummy, ui) =>
    (kegiatanInserted ?? []).filter((k) => k.user_id === userIds[ui])
  );
  let n = 0;
  for (let ui = 0; ui < perUser.length; ui++) {
    for (const [kIdx, k] of perUser[ui].entries()) {
      // urutan 1: gambar dulu (constraint tabel: tipe 'image' wajib image_url),
      // supaya tampilannya "foto di atas, keterangannya di bawah".
      const { error: gambarError } = await supabase.from("keterangan_kegiatan").insert({
        kegiatan_id: k.id,
        tipe: "image",
        urutan: 1,
        image_url: GAMBAR_PER_KEGIATAN.get(k.nama_kegiatan) ?? GAMBAR_CONTOH[n % GAMBAR_CONTOH.length],
      });
      if (gambarError) fail(`Gagal menambah gambar: ${gambarError.message}`);

      // urutan 2: keterangan teks kegiatan yang duduk di bawah gambarnya.
      const { error: ketError } = await supabase.from("keterangan_kegiatan").insert({
        kegiatan_id: k.id,
        tipe: "text",
        urutan: 2,
        isi_text: `Pelaksanaan ${k.nama_kegiatan.toLowerCase()} berjalan lancar sesuai rencana pada ${k.tanggal}.`,
      });
      if (ketError) fail(`Gagal menambah keterangan: ${ketError.message}`);

      if (ui === 0) {
        const { error } = await supabase.from("reviews").insert({ kegiatan_id: k.id, status: "approved" });
        if (error) fail(`Gagal menyimpan review: ${error.message}`);
      } else if (ui === 1) {
        if (kIdx === 0) {
          const { error } = await supabase
            .from("reviews")
            .insert({ kegiatan_id: k.id, status: "revision", catatan: CATATAN_REVISI[1] });
          if (error) fail(`Gagal menyimpan review: ${error.message}`);
        } else {
          const { error } = await supabase.from("reviews").insert({ kegiatan_id: k.id, status: "approved" });
          if (error) fail(`Gagal menyimpan review: ${error.message}`);
        }
      } else if (ui === 3 && kIdx === 0) {
        const { error } = await supabase
          .from("reviews")
          .insert({ kegiatan_id: k.id, status: "revision", catatan: CATATAN_REVISI[0] });
        if (error) fail(`Gagal menyimpan review: ${error.message}`);
      }
      n += 1;
    }
  }

  // 6b. Baris review bulanan: andi disetujui; budi & citra menunggu;
  // dewi direvisi (rekomendasinya) agar Setujui terkunci.
  const monthlyRows = [
    { ui: 0, status: "approved", catatan: null },
    { ui: 1, status: "menunggu", catatan: null },
    { ui: 2, status: "menunggu", catatan: null },
    { ui: 3, status: "revision", catatan: "Rekomendasi belum memuat hasil kegiatan, lengkapi dulu." },
  ];
  for (const row of monthlyRows) {
    const { error } = await supabase.from("monthly_reviews").upsert(
      {
        user_id: userIds[row.ui],
        tahun,
        bulan,
        rekomendasi: REKOMENDASI[row.ui],
        status: row.status,
        catatan: row.catatan,
      },
      { onConflict: "user_id,tahun,bulan" }
    );
    if (error) fail(`Gagal menyimpan review bulanan: ${error.message}`);
  }
  console.log("Review bulanan dummy siap (1 selesai, 1 menunggu, 2 revisi, 1 belum lapor).");

  // 7. Indikator dummy (2 global + 1 milik bidang pertama).
  const { data: indExisting } = await supabase.from("indikator").select("id, nama");
  const indByNama = new Map((indExisting ?? []).map((r) => [r.nama, r.id]));
  async function ensureIndikator(nama, target, bidangId) {
    if (indByNama.has(nama)) return indByNama.get(nama);
    const { data, error } = await supabase
      .from("indikator")
      .insert({ nama, target_bulanan: target, bidang_id: bidangId ?? null, user_id: null })
      .select("id")
      .single();
    if (error || !data) fail(`Gagal menambah indikator '${nama}': ${error?.message}`);
    indByNama.set(nama, data.id);
    return data.id;
  }
  const indGlobal = await ensureIndikator("Laporan tepat waktu", 10, null);
  await ensureIndikator("Kegiatan lapangan", 20, null);
  await ensureIndikator("Apel pagi", 25, bidangByNama.get(bidangNames[0]) ?? null);
  for (let i = 0; i < (kegiatanInserted ?? []).length; i += 2) {
    await supabase
      .from("kegiatan_indikator")
      .insert({ kegiatan_id: kegiatanInserted[i].id, indikator_id: indGlobal });
  }
  console.log("Indikator dummy siap.");

  console.log("Selesai. Buka /admin untuk melihat tampilan berisi data.");
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
