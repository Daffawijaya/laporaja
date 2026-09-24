import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, Role } from "@/lib/supabase/database.types";

export const HOME_BY_ROLE: Record<Role, string> = {
  superadmin: "/admin",
  user: "/laporan",
};

export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { user, profile: (profile ?? null) as ProfileRow | null };
}

export async function requireUser() {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");
  return { user, profile };
}

export async function requireSuperadmin() {
  const { user, profile } = await requireUser();
  if (profile.role !== "superadmin") redirect(HOME_BY_ROLE[profile.role]);
  return { user, profile };
}
