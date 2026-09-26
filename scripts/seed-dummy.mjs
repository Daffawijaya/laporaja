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

  // 5. Kegiatan bulan berjalan (tanggal 1-7 + hari ini).
  const now = new Date();
  const tahun = now.getFullYear();
  const bulan = now.getMonth() + 1;
  const lastDate = new Date(tahun, bulan, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");
  const daySet = [...new Set([1, 2, 3, 5, 7, now.getDate()].filter((d) => d >= 1 && d <= lastDate))].sort(
    (a, b) => a - b
  );

  const kegiatanRows = [];
  DUMMY_USERS.forEach((dummy, ui) => {
    const count = ui === 4 ? 1 : 4; // eko hanya 1 kegiatan
    for (let k = 0; k < count; k++) {
      const day = daySet[(ui + k) % daySet.length];
      kegiatanRows.push({
        user_id: userIds[ui],
        tanggal: `${tahun}-${pad(bulan)}-${pad(day)}`,
        nama_kegiatan: KEGIATAN_POOL[(ui * 3 + k) % KEGIATAN_POOL.length],
        _ui: ui,
        _k: k,
      });
    }
  });
  const { data: kegiatanInserted, error: kegiatanError } = await supabase
    .from("kegiatan")
    .insert(kegiatanRows.map(({ _ui, _k, ...row }) => row))
    .select("id, user_id, tanggal, nama_kegiatan");
  if (kegiatanError) fail(`Gagal menambah kegiatan: ${kegiatanError.message}`);
  console.log(`${kegiatanInserted.length} kegiatan dummy dibuat.`);

  // 6. Keterangan teks + review bervariasi (approved / revision / menunggu).
  let n = 0;
  for (const k of kegiatanInserted ?? []) {
    const { error: ketError } = await supabase.from("keterangan_kegiatan").insert({
      kegiatan_id: k.id,
      tipe: "text",
      urutan: 1,
      isi_text: `Pelaksanaan ${k.nama_kegiatan.toLowerCase()} berjalan lancar sesuai rencana pada ${k.tanggal}.`,
    });
    if (ketError) fail(`Gagal menambah keterangan: ${ketError.message}`);
    const mode = n % 3;
    if (mode === 0) {
      const { error } = await supabase.from("reviews").insert({ kegiatan_id: k.id, status: "approved" });
      if (error) fail(`Gagal menyimpan review: ${error.message}`);
    } else if (mode === 1) {
      const { error } = await supabase
        .from("reviews")
        .insert({ kegiatan_id: k.id, status: "revision", catatan: CATATAN_REVISI[n % CATATAN_REVISI.length] });
      if (error) fail(`Gagal menyimpan review: ${error.message}`);
    }
    n += 1;
  }

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
