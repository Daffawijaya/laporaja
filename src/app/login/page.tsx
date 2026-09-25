import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentProfile, HOME_BY_ROLE } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { user, profile } = await getCurrentProfile();
  if (user && profile) redirect(HOME_BY_ROLE[profile.role]);

  const params = await searchParams;
  const expired = params.expired === "1";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-[360px]">
        <div className="text-center">
          <p className="text-lg font-semibold tracking-tight">LaporAja</p>
          <p className="mt-1 text-sm text-muted-foreground">Masuk untuk melanjutkan</p>
        </div>

        {expired && (
          <p
            role="status"
            className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-800"
          >
            Sesi Anda berakhir. Silakan masuk lagi.
          </p>
        )}

        <section
          aria-label="Form masuk"
          className={cn("glass-panel rounded-lg px-6 py-7", expired ? "mt-4" : "mt-7")}
        >
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
