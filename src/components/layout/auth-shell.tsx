import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";

export function AuthShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass-bar sticky top-0 z-20">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 md:px-8">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-tight transition-soft hover:opacity-70"
          >
            LaporAja
          </Link>
          <div className="flex items-center gap-1">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {username}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 py-6 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
