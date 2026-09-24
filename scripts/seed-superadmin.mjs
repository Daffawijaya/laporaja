import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const AUTH_EMAIL_DOMAIN = "laporaja.internal";

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

async function countRows(supabase, table, userId) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return -1;
  return count ?? 0;
}

async function main() {
  loadEnvFile(".env.local");

  const [usernameArg, passwordArg, namaArg] = process.argv.slice(2);
  if (!usernameArg || !passwordArg) {
    fail("Cara pakai: npm run seed:superadmin -- <username> <kata-sandi> [nama]");
  }

  const username = usernameArg.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    fail("Username harus 3-32 karakter: huruf kecil, angka, titik, underscore, atau strip.");
  }
  if (passwordArg.length < 8) {
    fail("Kata sandi minimal 8 karakter.");
  }
  const nama = (namaArg || username).trim().slice(0, 120) || username;
  const email = `${username}@${AUTH_EMAIL_DOMAIN}`;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail("Env belum lengkap. Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local.");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId = null;
  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password: passwordArg,
      email_confirm: true,
      user_metadata: { username, nama },
    });

  if (created && created.user) {
    userId = created.user.id;
    console.log(`Akun auth untuk '${username}' dibuat.`);
  } else if (createError && /already|exists|registered|duplicate/i.test(createError.message)) {
    userId = await findUserIdByEmail(supabase.auth.admin, email);
    if (!userId) fail(`Akun sudah ada tetapi tidak ditemukan. Pesan: ${createError.message}`);
    console.log(`Akun auth untuk '${username}' sudah ada, memakai yang ada.`);
  } else if (createError) {
    fail(`Gagal membuat akun auth: ${createError.message}`);
  }

  const profileRow = { id: userId, username, nama, role: "superadmin" };
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(profileRow, { onConflict: "id" });

  if (!profileError) {
    console.log(`Superadmin '${username}' siap. Masuk memakai username dan kata sandi.`);
    return;
  }

  // Guard database memblokir perubahan role lewat API bila trigger
  // handle_new_user sudah membuat profil 'user' lebih dulu. Untuk akun
  // tanpa data turunan, aman membuat ulang baris profil via hapus + isi.
  if (!/Hanya superadmin/.test(profileError.message)) {
    fail(`Akun dibuat tetapi profil gagal disimpan: ${profileError.message}`);
  }

  const [subBidang, kegiatan] = await Promise.all([
    countRows(supabase, "user_sub_bidang", userId),
    countRows(supabase, "kegiatan", userId),
  ]);
  if (subBidang !== 0 || kegiatan !== 0) {
    fail(
      `Profil terkunci dan akun sudah punya data, batal demi keamanan. ` +
      `Jalankan di Supabase SQL Editor: update public.profiles set role = 'superadmin' where username = '${username}';`
    );
  }

  const { error: deleteError } = await supabase.from("profiles").delete().eq("id", userId);
  if (deleteError) fail(`Akun dibuat tetapi profil gagal disimpan: ${deleteError.message}`);

  const { error: insertError } = await supabase.from("profiles").insert(profileRow);
  if (insertError) fail(`Akun dibuat tetapi profil gagal disimpan: ${insertError.message}`);

  console.log(`Superadmin '${username}' siap. Masuk memakai username dan kata sandi.`);
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
