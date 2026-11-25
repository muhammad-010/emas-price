import { cacheLife } from "next/cache";

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
  // Hasil naik/turun yang dikunci pada 11:40 WIB:
  // (harga 11:40 hari acuan − harga 11:40 hari bursa sebelumnya) × PENGALI
  kunci: (Kunci & { arah: "naik" | "turun" | "tetap"; hariIni: boolean }) | null;
  // Semua kunci harian yang tersedia di data (urut lama -> baru), untuk menghitung Harga Asli berantai
  riwayatKunci: Kunci[];
  selisihPoin: number;
  hasil: number; // selisihPoin * PENGALI
  arah: "naik" | "turun" | "tetap";
  pengali: number;
  sumber: string;
  perkiraan: boolean;
  diambilPada: string;
};

export type Kunci = {
  tanggal: string; // ISO 11:40 WIB hari yang dikunci
  pembanding: string; // ISO 11:40 WIB hari bursa sebelumnya
  hasil: number;
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

const SEHARI_MS = 24 * 60 * 60 * 1000;

/**
 * Harga 11:40 WIB pada hari bursa terakhir yang <= mulai.
 * Sabtu & Minggu (WIB) selalu dilewati — Twelve Data tetap mengirim harga di akhir pekan
 * walau pasar XAUUSD tutup. Hari tanpa data di jam itu (libur) juga dilewati.
 */
function hargaHariBursa(candles: Candle[], mulai: number) {
  for (let k = 0; k < 7; k++) {
    const target = mulai - k * SEHARI_MS;
    const hariWib = new Date(target + WIB_OFFSET_MS).getUTCDay();
    if (hariWib === 0 || hariWib === 6) continue;
    const h = hargaPadaWaktu(candles, target);
    if (h && h.t >= target - 30 * 60 * 1000) return { ...h, target };
  }
  return null;
}

const arahDari = (n: number) => (n > 0 ? "naik" : n < 0 ? "turun" : "tetap") as "naik" | "turun" | "tetap";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; emas-hitung/1.0)" };

async function ambilJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { ...UA, ...init?.headers } });
  if (!res.ok) throw new Error(`${new URL(url).host} membalas HTTP ${res.status}`);
  return res.json();
}

// Twelve Data hanya dipakai untuk candle (harga 11:40 WIB & kunci harian); harga live tetap dari gold-api.com.
// Key bisa ditimpa lewat env TWELVEDATA_API_KEY.
const TWELVEDATA_KEY = process.env.TWELVEDATA_API_KEY || "9ccabb5be2f24fb990524e2b5dc789a1";

// Candle 5 menit ~7 hari ke belakang: cukup untuk acuan, kunci, dan riwayat yang melewati akhir pekan
const JUMLAH_CANDLE = 2000;

type Live = { harga: number; waktu: number };

async function ambilLive(): Promise<Live> {
  const spot = await ambilJson("https://api.gold-api.com/price/XAU");
  const harga = Number(spot.price);
  if (!Number.isFinite(harga)) throw new Error("Harga live tidak valid");
  return { harga, waktu: Date.parse(spot.updatedAt) || Date.now() };
}

/**
 * Candle XAU/USD spot dari Twelve Data — target: 1 kredit per hari.
 * Satu panggilan sudah berisi harga 11:40 hari ini + riwayat beberapa hari ke belakang.
 * Di-cache per tanggal acuan (`targetIso`): disimpan sampai tanggal acuan berganti,
 * tidak pernah disegarkan ulang di tengah hari.
 */
async function candleTwelveData(targetIso: string): Promise<Candle[]> {
  "use cache: remote";
  const seri = await ambilJson(
    `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=5min&outputsize=${JUMLAH_CANDLE}&timezone=UTC&apikey=${TWELVEDATA_KEY}`
  );
  if (seri.status === "error") throw new Error(`Twelve Data: ${seri.message}`);
  const candles: Candle[] = (seri.values ?? [])
    .map((v: { datetime: string; open: string; close: string }) => ({
      t: Date.parse(v.datetime.replace(" ", "T") + "Z"),
      open: Number(v.open),
      close: Number(v.close),
    }))
    .sort((x: Candle, y: Candle) => x.t - y.t);

  // Data untuk satu tanggal acuan tidak berubah -> simpan lama; besok kuncinya sudah beda
  cacheLife({ stale: 3600, revalidate: 3 * 86400, expire: 7 * 86400 });
  return candles;
}

/** Cadangan bila Twelve Data gagal: Yahoo GC=F futures (perkiraan, bisa beda dari spot). */
async function candleYahoo(): Promise<Candle[]> {
  const yahoo = await ambilJson("https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=5m&range=5d");
  const r = yahoo?.chart?.result?.[0];
  if (!r) throw new Error("Yahoo Finance tidak mengembalikan data GC=F");
  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  return ts
    .map((t, i) => ({ t: t * 1000, open: q.open?.[i], close: q.close?.[i] }))
    .filter((c) => typeof c.open === "number" && typeof c.close === "number");
}

// Lapisan memori per proses server: tetap hemat walau cache Next dilewati
// (mis. refresh browser saat `next dev`).
const memori = new Map<string, Candle[]>();
const JEDA_AMBIL_MS = 5 * 60 * 1000; // ambil data hari baru mulai 11:45, saat candle 11:40 sudah lengkap

async function ambilCandle(target: number) {
  // Sebelum 11:45 tetap pakai data tanggal acuan sebelumnya -> tidak ada pengambilan ulang
  const siap = Date.now() >= target + JEDA_AMBIL_MS;
  const kunciCache = new Date(siap ? target : target - SEHARI_MS).toISOString();
  try {
    let candles = memori.get(kunciCache);
    if (!candles) {
      candles = await candleTwelveData(kunciCache);
      memori.clear();
      memori.set(kunciCache, candles);
    }
    return { candles, perkiraan: false };
  } catch (e) {
    console.error("Twelve Data gagal, pakai Yahoo:", e);
    return { candles: await candleYahoo(), perkiraan: true };
  }
}

export async function hitungEmas(): Promise<HasilEmas> {
  const { target, hariIni } = targetJamAcuan();
  const [live, seri] = await Promise.all([ambilLive(), ambilCandle(target)]);
  const data = {
    hargaLive: live.harga,
    waktuLive: live.waktu,
    candles: seri.candles,
    perkiraan: seri.perkiraan,
    sumber: seri.perkiraan
      ? "gold-api.com (live) + Yahoo GC=F futures (acuan, perkiraan — Twelve Data gagal)"
      : "gold-api.com (live) + Twelve Data XAU/USD (acuan 11:40)",
  };
  const acuan = hargaHariBursa(data.candles, target);
  if (!acuan) throw new Error(`Data harga jam ${LABEL_ACUAN} WIB tidak ditemukan`);

  const hargaAcuan = round2(acuan.harga);
  const hargaLive = round2(data.hargaLive);
  const selisihPoin = round2(hargaLive - hargaAcuan);
  const hasil = Math.round(selisihPoin * PENGALI);

  // Kunci: dua harga dari seri yang sama, jadi koreksi basis saling meniadakan -> nilainya stabil
  const hariBursa = [acuan];
  while (hariBursa.length < 10) {
    const p = hargaHariBursa(data.candles, hariBursa.at(-1)!.target - SEHARI_MS);
    if (!p) break;
    hariBursa.push(p);
  }
  const riwayatKunci: Kunci[] = [];
  for (let i = hariBursa.length - 2; i >= 0; i--) {
    riwayatKunci.push({
      tanggal: new Date(hariBursa[i].target).toISOString(),
      pembanding: new Date(hariBursa[i + 1].target).toISOString(),
      hasil: Math.round(round2(hariBursa[i].harga - hariBursa[i + 1].harga) * PENGALI),
    });
  }
  const terakhir = riwayatKunci.at(-1);
  const kunci = terakhir
    ? { ...terakhir, arah: arahDari(terakhir.hasil), hariIni: hariIni && acuan.target === target }
    : null;

  return {
    hargaLive,
    waktuLive: new Date(data.waktuLive).toISOString(),
    hargaAcuan,
    waktuAcuan: new Date(acuan.t).toISOString(),
    targetAcuan: new Date(acuan.target).toISOString(),
    acuanHariIni: hariIni && acuan.target === target,
    jamAcuan: LABEL_ACUAN,
    kunci,
    riwayatKunci,
    selisihPoin,
    hasil,
    arah: arahDari(selisihPoin),
    pengali: PENGALI,
    sumber: data.sumber,
    perkiraan: data.perkiraan,
    diambilPada: new Date().toISOString(),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
