import Image from "next/image";
import Link from "next/link";

import { ProfileMenu } from "@/components/auth/profile-menu";

// Topbar mobile ala YouTube: logo kiri, avatar kanan. Background disamakan
// dengan navbar desktop (gradasi + blur, bukan flat abu).
// Hanya tampil di mobile, desktop memakai sidebar kaca kiri.
export function MobileTopbar({ initial }: { initial: string }) {
  return (
    <header className="sticky top-0 z-30 md:hidden">
      <div
        aria-hidden="true"
        className="mnavbar-blur pointer-events-none absolute inset-0"
      />
      <div className="relative flex items-center justify-between gap-3 px-4 pt-4 pb-4">
        <Link href="/" aria-label="Laporaja beranda" className="flex min-h-[44px] items-center">
          {/* Versi terang/gelap ditukar lewat kelas dark supaya konsisten dengan
              sidebar desktop dan bebas kedipan hidrasi. */}
          <Image
            src="/logolight.png"
            alt="Laporaja"
            width={1697}
            height={372}
            priority
            className="h-5 w-auto dark:hidden"
          />
          <Image
            src="/logodark.png"
            alt=""
            aria-hidden="true"
            width={1697}
            height={372}
            priority
            className="hidden h-5 w-auto dark:block"
          />
        </Link>

        <div className="flex items-center gap-1">
          <ProfileMenu
            initial={initial}
            buttonClassName="flex size-11 items-center justify-center rounded-full"
            avatarClassName="mchrome-avatar flex size-9 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
          />
        </div>
      </div>
    </header>
  );
}
