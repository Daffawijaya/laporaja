// Penanganan galat yang ramah pengguna. Tidak ada istilah teknis yang
// ditampilkan ke layar.

export class SessionExpiredError extends Error {
  constructor() {
    super("Sesi Anda berakhir. Silakan masuk lagi.");
    this.name = "SessionExpiredError";
  }
}

// Sesi kadaluarsa dari Supabase bisa muncul sebagai status 401, kode PGRST301,
// atau pesan JWT. Semuanya dipetakan ke satu perilaku: kembali ke halaman masuk.
export function isSessionError(error: unknown): boolean {
  if (!error) return false;
  const value = error as { status?: number; code?: string; message?: string };
  if (value.status === 401) return true;
  if (value.code === "PGRST301") return true;
  const message = (value.message ?? "").toLowerCase();
  return (
    message.includes("jwt") ||
    message.includes("token") ||
    message.includes("not authenticated") ||
    message.includes("invalid claim") ||
    message.includes("session")
  );
}

// Melempar galat yang sudah ramah. Galat sesi dibedakan agar pemanggil dapat
// mengarahkan pengguna ke halaman masuk.
export function failWith(error: unknown, friendly: string): never {
  if (isSessionError(error)) throw new SessionExpiredError();
  throw new Error(friendly);
}

// Dipakai di Server Component: galat query diteruskan ke batas galat halaman
// dengan pesan yang ramah, bukan dibiarkan tampil sebagai data kosong.
export function assertOk(error: unknown, friendly: string): void {
  if (error) throw new Error(friendly);
}
