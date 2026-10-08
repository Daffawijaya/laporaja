import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

// Dipanggil Vercel Cron 1x sehari agar project Supabase Free tidak auto-pause
// (pause terjadi setelah ~7 hari tanpa aktivitas API/DB).
// GET /api/cron-keep-alive -> hit ringan ke tabel pengaturan (head-only,
// tanpa mengembalikan baris) supaya tercatat sebagai aktivitas database.
export async function GET(req: Request) {
  // Kunci pengaman opsional: isi CRON_SECRET di Vercel agar hanya cron resmi
  // yang bisa memicu (Vercel mengirim Authorization: Bearer <CRON_SECRET>).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json(
        { ok: false, message: "Tidak diizinkan." },
        { status: 401 },
      );
    }
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("pengaturan")
      .select("*", { count: "exact", head: true });
    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: (e as Error).message },
      { status: 500 },
    );
  }
}
