import Link from "next/link";
import { HiBell, HiPlay } from "react-icons/hi2";

// Topbar mobile ala YouTube: logo kiri, bel badge dan avatar kanan.
// Hanya tampil di mobile, desktop memakai sidebar kaca kiri.
export function MobileTopbar({
  badgeCount,
  bellHref,
  initial,
}: {
  badgeCount: number;
  bellHref: string;
  initial: string;
}) {
  const badge = badgeCount > 9 ? "9+" : String(badgeCount);

  return (
    <header className="mchrome-bar sticky top-0 z-30 border-b md:hidden">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="LaporAja beranda" className="flex min-h-[44px] items-center gap-1.5">
          <span
            aria-hidden="true"
            className="flex items-center rounded-md bg-[#ff0033] px-1.5 py-1"
          >
            <HiPlay className="size-4 text-white" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">LaporAja</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href={bellHref}
            aria-label={
              badgeCount > 0 ? `Notifikasi, ${badgeCount} baru` : "Notifikasi"
            }
            className="relative flex size-11 items-center justify-center rounded-full"
          >
            <HiBell aria-hidden="true" className="size-6" />
            {badgeCount > 0 && (
              <span
                aria-hidden="true"
                className="mchrome-badge absolute top-1 right-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 bg-[#ff0033] px-1 text-[10px] font-semibold text-white"
              >
                {badge}
              </span>
            )}
          </Link>
          <Link
            href="/anda"
            aria-label="Akun Anda"
            className="flex size-11 items-center justify-center rounded-full"
          >
            <span
              aria-hidden="true"
              className="mchrome-avatar flex size-7 items-center justify-center rounded-full text-sm font-semibold"
            >
              {initial}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
