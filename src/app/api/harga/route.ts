import { connection } from "next/server";
import { hitungEmas } from "@/lib/emas";

export async function GET() {
  await connection(); // selalu dijalankan saat request (bukan di-prerender)
  try {
    const data = await hitungEmas();
    return Response.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" },
    });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "Gagal mengambil data";
    return Response.json({ error: pesan }, { status: 502 });
  }
}
