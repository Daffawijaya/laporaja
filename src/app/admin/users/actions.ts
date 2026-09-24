"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  normalizeUsername,
  usernameToEmail,
} from "@/lib/auth/username";
import { createAdminClient } from "@/lib/supabase/admin";

export interface UserActionResult {
  ok: boolean;
  message: string;
}

export interface UserFormInput {
  nama: string;
  username: string;
  password: string;
  bidangId: string | null;
  subBidang: string[];
}

async function assertSuperadmin() {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile || profile.role !== "superadmin") {
    throw new Error("Hanya superadmin yang dapat mengelola pengguna.");
  }
  return { user, profile };
}

function cleanSubBidang(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const nama = item.trim();
    if (nama.length < 2 || nama.length > 120) {
      throw new Error("Setiap sub bidang harus 2-120 karakter.");
    }
    const key = nama.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(nama);
  }
  return out;
}

function cleanNama(nama: unknown): string {
  const cleaned = typeof nama === "string" ? nama.trim() : "";
  if (cleaned.length < 2 || cleaned.length > 120) {
    throw new Error("Nama harus 2-120 karakter.");
  }
  return cleaned;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Gagal menyimpan.";
}

export async function createUserAction(
  input: UserFormInput
): Promise<UserActionResult> {
  try {
    await assertSuperadmin();

    const nama = cleanNama(input.nama);
    const username = normalizeUsername(input.username);
    if (!input.password || input.password.length < 8) {
      throw new Error("Kata sandi minimal 8 karakter.");
    }
    const bidangId = input.bidangId || null;
    const subs = cleanSubBidang(input.subBidang);

    const admin = createAdminClient();

    const { data: dipakai } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (dipakai) throw new Error("Username sudah dipakai.");

    if (bidangId) {
      const { data: bidang } = await admin
        .from("bidang")
        .select("id")
        .eq("id", bidangId)
        .maybeSingle();
      if (!bidang) throw new Error("Bidang tidak ditemukan.");
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: usernameToEmail(username),
        password: input.password,
        email_confirm: true,
        user_metadata: { username, nama },
      });
    if (createError || !created.user) {
      if (/already|exists|registered|duplicate/i.test(createError?.message ?? "")) {
        throw new Error("Username sudah dipakai.");
      }
      throw new Error(`Gagal membuat akun: ${createError?.message ?? "tidak diketahui"}`);
    }

    const userId = created.user.id;
    const { error: profileError } = await admin
      .from("profiles")
      .update({ nama, bidang_id: bidangId })
      .eq("id", userId);
    if (profileError) {
      throw new Error(`Akun dibuat tetapi profil gagal disimpan: ${profileError.message}`);
    }

    if (subs.length > 0) {
      const { error: subError } = await admin.from("user_sub_bidang").insert(
        subs.map((namaSub) => ({ user_id: userId, nama: namaSub }))
      );
      if (subError) {
        throw new Error(`User dibuat tetapi sub bidang gagal disimpan: ${subError.message}`);
      }
    }

    revalidatePath("/admin/users");
    return { ok: true, message: `User '${username}' ditambahkan.` };
  } catch (error) {
    return { ok: false, message: toErrorMessage(error) };
  }
}

export async function updateUserAction(
  id: string,
  input: UserFormInput
): Promise<UserActionResult> {
  try {
    await assertSuperadmin();

    const nama = cleanNama(input.nama);
    const username = normalizeUsername(input.username);
    const gantiPassword = input.password.length > 0;
    if (gantiPassword && input.password.length < 8) {
      throw new Error("Kata sandi minimal 8 karakter.");
    }
    const bidangId = input.bidangId || null;
    const subs = cleanSubBidang(input.subBidang);

    const admin = createAdminClient();

    const { data: profil } = await admin
      .from("profiles")
      .select("id, username")
      .eq("id", id)
      .maybeSingle();
    if (!profil) throw new Error("User tidak ditemukan.");

    if (bidangId) {
      const { data: bidang } = await admin
        .from("bidang")
        .select("id")
        .eq("id", bidangId)
        .maybeSingle();
      if (!bidang) throw new Error("Bidang tidak ditemukan.");
    }

    if (username !== profil.username) {
      const { data: dipakai } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (dipakai) throw new Error("Username sudah dipakai.");

      const { error: emailError } = await admin.auth.admin.updateUserById(id, {
        email: usernameToEmail(username),
        user_metadata: { username, nama },
      });
      if (emailError) throw new Error(`Gagal mengubah username: ${emailError.message}`);
    }

    if (gantiPassword) {
      const { error: passwordError } = await admin.auth.admin.updateUserById(id, {
        password: input.password,
      });
      if (passwordError) throw new Error(`Gagal mengubah kata sandi: ${passwordError.message}`);
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ nama, username, bidang_id: bidangId })
      .eq("id", id);
    if (profileError) {
      throw new Error(`Gagal menyimpan profil: ${profileError.message}`);
    }

    const { error: hapusSubError } = await admin
      .from("user_sub_bidang")
      .delete()
      .eq("user_id", id);
    if (hapusSubError) {
      throw new Error(`Gagal menyimpan sub bidang: ${hapusSubError.message}`);
    }
    if (subs.length > 0) {
      const { error: subError } = await admin.from("user_sub_bidang").insert(
        subs.map((namaSub) => ({ user_id: id, nama: namaSub }))
      );
      if (subError) {
        throw new Error(`Gagal menyimpan sub bidang: ${subError.message}`);
      }
    }

    revalidatePath("/admin/users");
    return { ok: true, message: `User '${username}' diperbarui.` };
  } catch (error) {
    return { ok: false, message: toErrorMessage(error) };
  }
}

export async function deleteUserAction(id: string): Promise<UserActionResult> {
  try {
    const { user } = await assertSuperadmin();
    if (id === user.id) {
      throw new Error("Tidak dapat menghapus akun sendiri.");
    }

    const admin = createAdminClient();
    const { data: profil } = await admin
      .from("profiles")
      .select("username")
      .eq("id", id)
      .maybeSingle();
    if (!profil) throw new Error("User tidak ditemukan.");

    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) throw new Error(`Gagal menghapus user: ${deleteError.message}`);

    revalidatePath("/admin/users");
    return { ok: true, message: `User '${profil.username}' dihapus.` };
  } catch (error) {
    return { ok: false, message: toErrorMessage(error) };
  }
}
