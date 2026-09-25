"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  normalizeUsername,
  usernameToEmail,
} from "@/lib/auth/username";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeUserFolder } from "@/lib/supabase/storage";

export interface UserActionResult {
  ok: boolean;
  message: string;
  code?: "unauthorized";
}

export interface UserFormInput {
  nama: string;
  username: string;
  password: string;
  bidangId: string | null;
  subBidang: string[];
  indikators: { nama: string; target: number }[];
}

// Galat khusus agar pemanggil dapat membedakan sesi berakhir dari galat lain.
class UnauthorizedError extends Error {}

async function assertSuperadmin() {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile || profile.role !== "superadmin") {
    throw new UnauthorizedError("Akses ditolak.");
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
  if (cleaned.length === 0) throw new Error("Nama wajib diisi.");
  if (cleaned.length < 2 || cleaned.length > 120) {
    throw new Error("Nama harus 2-120 karakter.");
  }
  return cleaned;
}

function cleanIndikators(list: unknown): { nama: string; target: number }[] {
  if (!Array.isArray(list)) return [];
  const out: { nama: string; target: number }[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as { nama?: unknown; target?: unknown };
    const nama = typeof record.nama === "string" ? record.nama.trim() : "";
    const target = typeof record.target === "number" ? record.target : Number(record.target);
    if (nama.length === 0 && (record.target === undefined || record.target === "")) continue;
    if (nama.length < 2 || nama.length > 120) {
      throw new Error("Setiap indikator harus 2-120 karakter.");
    }
    if (!Number.isInteger(target) || target < 1 || target > 100000) {
      throw new Error("Jumlah per bulan harus angka bulat 1 sampai 100000.");
    }
    out.push({ nama, target });
  }
  return out;
}

function toFailure(error: unknown): UserActionResult {
  if (error instanceof UnauthorizedError) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Sesi Anda berakhir. Silakan masuk lagi.",
    };
  }
  return {
    ok: false,
    message: error instanceof Error ? error.message : "Gagal menyimpan. Coba lagi.",
  };
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
    const indikators = cleanIndikators(input.indikators);

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
      throw new Error("Gagal membuat akun. Coba lagi.");
    }

    const userId = created.user.id;
    const { error: profileError } = await admin
      .from("profiles")
      .update({ nama, bidang_id: bidangId })
      .eq("id", userId);
    if (profileError) {
      throw new Error("Akun dibuat, tetapi profil gagal disimpan. Coba lagi.");
    }

    if (subs.length > 0) {
      const { error: subError } = await admin.from("user_sub_bidang").insert(
        subs.map((namaSub) => ({ user_id: userId, nama: namaSub }))
      );
      if (subError) {
        throw new Error("User dibuat, tetapi sub bidang gagal disimpan. Coba lagi.");
      }
    }

    if (indikators.length > 0) {
      const { error: indikatorError } = await admin.from("indikator").insert(
        indikators.map((indikator) => ({
          user_id: userId,
          nama: indikator.nama,
          target_bulanan: indikator.target,
        }))
      );
      if (indikatorError) {
        throw new Error("User dibuat, tetapi indikator gagal disimpan. Coba lagi.");
      }
    }

    revalidatePath("/admin/users");
    return { ok: true, message: `User '${username}' ditambahkan.` };
  } catch (error) {
    return toFailure(error);
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
    const indikators = cleanIndikators(input.indikators);

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
      if (emailError) throw new Error("Gagal mengubah username. Coba lagi.");
    }

    if (gantiPassword) {
      const { error: passwordError } = await admin.auth.admin.updateUserById(id, {
        password: input.password,
      });
      if (passwordError) throw new Error("Gagal mengubah kata sandi. Coba lagi.");
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ nama, username, bidang_id: bidangId })
      .eq("id", id);
    if (profileError) {
      throw new Error("Gagal menyimpan profil. Coba lagi.");
    }

    const { error: hapusSubError } = await admin
      .from("user_sub_bidang")
      .delete()
      .eq("user_id", id);
    if (hapusSubError) {
      throw new Error("Gagal menyimpan sub bidang. Coba lagi.");
    }
    if (subs.length > 0) {
      const { error: subError } = await admin.from("user_sub_bidang").insert(
        subs.map((namaSub) => ({ user_id: id, nama: namaSub }))
      );
      if (subError) {
        throw new Error("Gagal menyimpan sub bidang. Coba lagi.");
      }
    }

    // Indikator digabung berdasar nama agar tautan kegiatan tidak hilang:
    // yang sama dipertahankan, yang baru ditambah, yang dibuang dihapus.
    const { data: indikatorLama, error: indikatorBacaError } = await admin
      .from("indikator")
      .select("id, nama, target_bulanan")
      .eq("user_id", id);
    if (indikatorBacaError) {
      throw new Error("Gagal menyimpan indikator. Coba lagi.");
    }
    const lamaByNama = new Map(
      (indikatorLama ?? []).map((row) => [row.nama, row])
    );
    const dipertahankan = new Set<string>();
    for (const indikator of indikators) {
      const lama = lamaByNama.get(indikator.nama);
      if (lama) {
        dipertahankan.add(lama.id);
        if (lama.target_bulanan !== indikator.target) {
          const { error: ubahError } = await admin
            .from("indikator")
            .update({ nama: indikator.nama, target_bulanan: indikator.target })
            .eq("id", lama.id);
          if (ubahError) throw new Error("Gagal menyimpan indikator. Coba lagi.");
        }
      } else {
        const { error: tambahError } = await admin.from("indikator").insert({
          user_id: id,
          nama: indikator.nama,
          target_bulanan: indikator.target,
        });
        if (tambahError) throw new Error("Gagal menyimpan indikator. Coba lagi.");
      }
    }
    const dibuang = (indikatorLama ?? [])
      .map((row) => row.id)
      .filter((indikatorId) => !dipertahankan.has(indikatorId));
    if (dibuang.length > 0) {
      const { error: hapusIndikatorError } = await admin
        .from("indikator")
        .delete()
        .in("id", dibuang);
      if (hapusIndikatorError) {
        throw new Error("Gagal menyimpan indikator. Coba lagi.");
      }
    }

    revalidatePath("/admin/users");
    return { ok: true, message: `User '${username}' diperbarui.` };
  } catch (error) {
    return toFailure(error);
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

    // Bersihkan gambar milik user agar tidak meninggalkan berkas yatim.
    // Kegagalan di sini tidak menggagalkan penghapusan akun.
    try {
      await removeUserFolder(admin, id);
    } catch {
      // Diabaikan: akun tetap dihapus walau berkas gagal dibersihkan.
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) throw new Error("Gagal menghapus user. Coba lagi.");

    revalidatePath("/admin/users");
    return { ok: true, message: `User '${profil.username}' dihapus.` };
  } catch (error) {
    return toFailure(error);
  }
}
