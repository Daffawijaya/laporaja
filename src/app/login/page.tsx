import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentProfile, HOME_BY_ROLE } from "@/lib/auth/session";

export default async function LoginPage() {
  const { user, profile } = await getCurrentProfile();
  if (user && profile) redirect(HOME_BY_ROLE[profile.role]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-center text-base font-semibold tracking-tight">
          LaporAja
        </p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Masuk untuk melanjutkan
        </p>

        <section
          aria-label="Form masuk"
          className="glass mt-6 rounded-lg px-6 py-7 shadow-subtle"
        >
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
