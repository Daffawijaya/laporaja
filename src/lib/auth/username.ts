export const AUTH_EMAIL_DOMAIN = "laporaja.internal";
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error(
      "Username harus 3-32 karakter: huruf kecil, angka, titik, underscore, atau strip."
    );
  }
  return normalized;
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username.trim().toLowerCase());
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

export function emailToUsername(email: string): string | null {
  const suffix = `@${AUTH_EMAIL_DOMAIN}`;
  if (!email.toLowerCase().endsWith(suffix)) return null;
  return email.slice(0, -suffix.length).toLowerCase();
}
