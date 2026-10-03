import Image from "next/image";
import Link from "next/link";

import { ProfileMenu } from "@/components/auth/profile-menu";

// Topbar mobile ala YouTube: logo kiri, avatar kanan.
// Hanya tampil di mobile, desktop memakai sidebar kaca kiri.
export function MobileTopbar({ initial }: { initial: string }) {
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
          <ProfileMenu
            initial={initial}
            buttonClassName="flex size-11 items-center justify-center rounded-full"
            avatarClassName="mchrome-avatar flex size-7 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
          />
        </div>
      </div>
    </header>
  );
}
