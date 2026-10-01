import { redirect } from "next/navigation";

// Form buat pindah ke halaman Section (tambah lewat rel di kanan kartu).
export default async function SectionBaruPage() {
  redirect("/admin/section");
}
