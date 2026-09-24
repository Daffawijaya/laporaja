import { LogoutButton } from "@/components/auth/logout-button";

export function AuthShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
      <header className="glass sticky top-0 z-10 shadow-subtle">
        <div className="flex min-h-16 items-center justify-between px-4 md:px-8">
          <p className="text-base font-semibold tracking-tight">LaporAja</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">{username}</p>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
