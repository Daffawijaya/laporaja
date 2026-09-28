import Image from "next/image";
import Link from "next/link";
import { HiBell } from "react-icons/hi2";

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
        <Link href="/" aria-label="LaporAja beranda" className="flex min-h-[44px] items-center">
          {/* Versi terang/gelap ditukar lewat kelas dark supaya konsisten dengan
              sidebar desktop dan bebas kedipan hidrasi. */}
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
