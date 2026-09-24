import { redirect } from "next/navigation";
import { getCurrentProfile, HOME_BY_ROLE } from "@/lib/auth/session";

export default async function Home() {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) redirect("/login");
  redirect(HOME_BY_ROLE[profile.role]);
}
