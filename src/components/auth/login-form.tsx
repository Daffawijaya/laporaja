"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isValidUsername, usernameToEmail } from "@/lib/auth/username";
import type { Role } from "@/lib/supabase/database.types";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);

    if (!username.trim() || !password) {
      setError("Isi username dan kata sandi terlebih dahulu.");
      return;
    }
    if (!isValidUsername(username)) {
      setError("Username tidak valid. Periksa kembali penulisan username.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: usernameToEmail(username),
          password,
        });

      if (signInError || !data.user) {
        setError("Username atau kata sandi salah.");
        return;
      }

      const { data: roleRow, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      // Inferensi select-string sengaja tidak dipakai, tipe baris eksplisit.
      const role = (roleRow as { role: Role } | null)?.role ?? null;

      if (profileError || !role) {
        await supabase.auth.signOut();
        setError("Akun belum memiliki profil. Hubungi superadmin.");
        return;
      }

      router.push(role === "superadmin" ? "/admin" : "/laporan");
      router.refresh();
    } catch {
      setError("Tidak dapat masuk saat ini. Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          type="text"
          autoComplete="username"
          placeholder="Tulis username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={loading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Kata sandi</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Masukkan kata sandi"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <Button type="submit" className="mt-1 w-full" disabled={loading}>
        {loading ? "Memeriksa..." : "Masuk"}
      </Button>
    </form>
  );
}
