import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { RefListCard } from "@/components/ui/ref-list-card";
import { getCurrentProfile, HOME_BY_ROLE } from "@/lib/auth/session";

// Butuh cookie sesi: render saat request, jangan di-prerender waktu build.
export const dynamic = "force-dynamic";

// Gaya disamakan dengan dashboard (ref-card di bg flat, bukan glass-panel):
// kartu putih rounded-3xl + logo yang sama dengan topbar/sidebar.
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f2f1f7] px-5 py-12 dark:bg-[#101014]">
      <div className="w-full max-w-[360px]">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/logolight.png"
            alt="LaporAja"
            width={1697}
            height={372}
            priority
            className="h-7 w-auto dark:hidden"
          />
          <Image
            src="/logodark.png"
            alt=""
            aria-hidden="true"
            width={1697}
            height={372}
            priority
            className="hidden h-7 w-auto dark:block"
          />
          <p className="mt-3 text-sm text-muted-foreground">Masuk untuk melanjutkan</p>
        </div>

        {expired && (
          <p
            role="status"
            className="mt-5 rounded-md bg-amber-50 px-2.5 py-1.5 text-center text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
          >
            Sesi Anda berakhir. Silakan masuk lagi.
          </p>
        )}

        <RefListCard
          ariaLabel="Form masuk"
          title="Masuk"
          className={expired ? "mt-4" : "mt-5"}
        >
          <LoginForm />
        </RefListCard>
      </div>
    </main>
  );
}
