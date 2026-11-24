// Logika pengambilan harga XAUUSD dan perhitungan selisih terhadap harga jam 11:40 WIB.

export const PENGALI = 320;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // WIB = UTC+7
const JAM_ACUAN_WIB = 11;
const MENIT_ACUAN_WIB = 40;
export const LABEL_ACUAN = `${JAM_ACUAN_WIB}:${String(MENIT_ACUAN_WIB).padStart(2, "0")}`;
const CANDLE_MS = 5 * 60 * 1000; // candle 5 menit

export type HasilEmas = {
  hargaLive: number;
  waktuLive: string; // ISO
  hargaAcuan: number;
  waktuAcuan: string; // ISO, waktu candle acuan sebenarnya
  targetAcuan: string; // ISO, 11:40 WIB yang dituju (hari ini / kemarin)
  acuanHariIni: boolean;
  jamAcuan: string; // "11:40"
  selisihPoin: number;
  hasil: number; // selisihPoin * PENGALI
  arah: "naik" | "turun" | "tetap";
  pengali: number;
  sumber: string;
  catatan?: string;
  diambilPada: string;
};

type Candle = { t: number; open: number; close: number }; // t = epoch ms (awal candle)

/** 11:40 WIB terakhir yang sudah lewat: hari ini bila sekarang >= 11:40 WIB, kalau belum ya kemarin. */
export function targetJamAcuan(sekarang = Date.now()): { target: number; hariIni: boolean } {
  const wib = new Date(sekarang + WIB_OFFSET_MS);
  const targetHariIni =
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate(), JAM_ACUAN_WIB, MENIT_ACUAN_WIB) - WIB_OFFSET_MS;
  if (sekarang >= targetHariIni) return { target: targetHariIni, hariIni: true };
  return { target: targetHariIni - 24 * 60 * 60 * 1000, hariIni: false };
}

/**
 * Harga pada waktu target: candle yang mulai tepat di target -> pakai open-nya.
 * Kalau tidak ada (pasar tutup / data bolong) -> close candle terakhir sebelum target.
 */
function hargaPadaWaktu(candles: Candle[], target: number): { harga: number; t: number } | null {
  const sebelum = candles.filter((c) => c.t <= target).sort((a, b) => a.t - b.t);
  const c = sebelum.at(-1);
  if (!c) return null;
  if (c.t === target) return { harga: c.open, t: c.t };
  return { harga: c.close, t: c.t + CANDLE_MS };
}

const UA = { "User-Agent": "Mozilla/5.0 (compatible; emas-hitung/1.0)" };

async function ambilJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { ...UA, ...init?.headers } });
  if (!res.ok) throw new Error(`${new URL(url).host} membalas HTTP ${res.status}`);
  return res.json();
}

// ---------- Sumber 1: Twelve Data (XAU/USD spot murni, butuh API key gratis) ----------

async function dariTwelveData(apiKey: string) {
  const base = "https://api.twelvedata.com";
  const [harga, seri] = await Promise.all([
    ambilJson(`${base}/price?symbol=XAU/USD&apikey=${apiKey}`),
    ambilJson(
      `${base}/time_series?symbol=XAU/USD&interval=5min&outputsize=800&timezone=UTC&apikey=${apiKey}`
    ),
  ]);
  if (harga.status === "error" || seri.status === "error") {
    throw new Error(`Twelve Data: ${harga.message ?? seri.message}`);
  }
  const candles: Candle[] = (seri.values ?? []).map(
    (v: { datetime: string; open: string; close: string }) => ({
      t: Date.parse(v.datetime.replace(" ", "T") + "Z"),
      open: Number(v.open),
      close: Number(v.close),
    })
  );
  return {
    hargaLive: Number(harga.price),
    waktuLive: Date.now(),
    candles,
    koreksiBasis: 0,
    sumber: "Twelve Data XAU/USD (spot)",
  };
}

// ---------- Sumber 2 (default, tanpa key): gold-api.com spot + Yahoo GC=F intraday ----------

async function dariGoldApiYahoo() {
  const [spot, yahoo] = await Promise.all([
    ambilJson("https://api.gold-api.com/price/XAU"),
    ambilJson("https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=5m&range=5d"),
  ]);
  const r = yahoo?.chart?.result?.[0];
  if (!r) throw new Error("Yahoo Finance tidak mengembalikan data GC=F");
  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const candles: Candle[] = ts
    .map((t, i) => ({ t: t * 1000, open: q.open?.[i], close: q.close?.[i] }))
    .filter((c) => typeof c.open === "number" && typeof c.close === "number");

  const hargaSpot = Number(spot.price);
  const futuresSekarang = Number(r.meta?.regularMarketPrice ?? candles.at(-1)?.close);
  if (!Number.isFinite(hargaSpot) || !Number.isFinite(futuresSekarang)) {
    throw new Error("Harga live tidak valid");
  }
  return {
    hargaLive: hargaSpot,
    waktuLive: Date.parse(spot.updatedAt) || Date.now(),
    candles,
    // GC=F (futures) lebih mahal beberapa dolar dari spot; acuan dikoreksi dengan selisih ini
    koreksiBasis: futuresSekarang - hargaSpot,
    sumber: "gold-api.com (spot live) + Yahoo GC=F 5m (acuan, dikoreksi basis)",
  };
}

export async function hitungEmas(): Promise<HasilEmas> {
  const key = process.env.TWELVEDATA_API_KEY;
  const data = key ? await dariTwelveData(key) : await dariGoldApiYahoo();

  const { target, hariIni } = targetJamAcuan();
  const acuan = hargaPadaWaktu(data.candles, target);
  if (!acuan) throw new Error(`Data harga jam ${LABEL_ACUAN} WIB tidak ditemukan`);

  const hargaAcuan = round2(acuan.harga - data.koreksiBasis);
  const hargaLive = round2(data.hargaLive);
  const selisihPoin = round2(hargaLive - hargaAcuan);
  const hasil = Math.round(selisihPoin * PENGALI);

  let catatan: string | undefined;
  if (acuan.t < target - 60 * 60 * 1000) {
    catatan = `Pasar tutup saat jam ${LABEL_ACUAN} WIB, dipakai harga terakhir sebelum jam tersebut.`;
  }

  return {
    hargaLive,
    waktuLive: new Date(data.waktuLive).toISOString(),
    hargaAcuan,
    waktuAcuan: new Date(Math.min(acuan.t, target)).toISOString(),
    targetAcuan: new Date(target).toISOString(),
    acuanHariIni: hariIni,
    jamAcuan: LABEL_ACUAN,
    selisihPoin,
    hasil,
    arah: selisihPoin > 0 ? "naik" : selisihPoin < 0 ? "turun" : "tetap",
    pengali: PENGALI,
    sumber: data.sumber,
    catatan,
    diambilPada: new Date().toISOString(),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
