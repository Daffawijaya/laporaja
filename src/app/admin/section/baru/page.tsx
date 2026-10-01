import { redirect } from "next/navigation";

// Form buat pindah ke halaman Section (tombol Tambah di bawah tumpukan).
export default async function SectionBaruPage() {
  redirect("/admin/section#tambah");
}
