import { redirect } from "next/navigation";
import { getCurrentProfile, HOME_BY_ROLE } from "@/lib/auth/session";

// Butuh cookie sesi: render saat request, jangan di-prerender waktu build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");
  redirect(HOME_BY_ROLE[profile.role]);
}
