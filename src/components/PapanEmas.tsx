"use client";

import { useCallback, useEffect, useState } from "react";
import type { HasilEmas } from "@/lib/emas";
import HargaAsli from "./HargaAsli";

const INTERVAL_MS = 5 * 60 * 1000; // reload tiap 5 menit

const fmtUsd = (n: number) =>
  n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAngka = (n: number) => Math.abs(n).toLocaleString("id-ID", { maximumFractionDigits: 0 });
const fmtTanggal = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "short",
  });
const fmtWaktu = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }) + " WIB";

export default function PapanEmas() {
  const [data, setData] = useState<HasilEmas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [berikutnya, setBerikutnya] = useState(0);
  const [sekarang, setSekarang] = useState(0);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const res = await fetch("/api/harga", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setMemuat(false);
      const t = Date.now();
      setSekarang(t);
      setBerikutnya(t + INTERVAL_MS);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(muat, 0); // muat pertama kali setelah mount
    return () => clearTimeout(id);
  }, [muat]);

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setSekarang(t);
      if (berikutnya && t >= berikutnya && !memuat) muat();
    }, 1000);
    return () => clearInterval(id);
  }, [berikutnya, memuat, muat]);

  const sisa = Math.max(0, berikutnya - sekarang);
  const mm = String(Math.floor(sisa / 60000)).padStart(2, "0");
  const ss = String(Math.floor((sisa % 60000) / 1000)).padStart(2, "0");

  const warna =
    data?.arah === "naik" ? "text-emerald-400" : data?.arah === "turun" ? "text-rose-400" : "text-zinc-300";
  const panah = data?.arah === "naik" ? "▲" : data?.arah === "turun" ? "▼" : "■";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-amber-300">Hitung Emas XAUUSD</h1>
        </div>
        <button
          onClick={muat}
          disabled={memuat}
          className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
        >
          {memuat ? "Memuat…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {!data && !error && <div className="rounded-2xl bg-zinc-900 p-10 text-center text-zinc-400">Memuat data…</div>}

      {data && (
        <>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <p className="text-sm uppercase tracking-wide text-zinc-400">Hasil Live</p>
            <p className={`mt-1 font-mono text-5xl font-bold tabular-nums ${warna}`}>
              {data.hasil < 0 ? "−" : data.hasil > 0 ? "+" : ""}Rp{fmtAngka(data.hasil)}
            </p>
            <p className={`mt-2 text-lg font-medium ${warna}`}>
              {panah} {data.arah.toUpperCase()}
            </p>
          </section>

          {data.perkiraan && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              Twelve Data sedang tidak bisa diakses, acuan sementara diambil dari harga futures (perkiraan,
              bisa sedikit beda dari XAUUSD spot).
            </p>
          )}

          {data.kunci && <KartuKunci kunci={data.kunci} jam={data.jamAcuan} />}

          <HargaAsli data={data} />

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">XAUUSD Live</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-200">
                {fmtUsd(data.hargaLive)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{fmtWaktu(data.waktuLive)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                Acuan {data.jamAcuan} WIB
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-zinc-100">
                {fmtUsd(data.hargaAcuan)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{fmtTanggal(data.targetAcuan)} · {data.jamAcuan} WIB</p>
            </div>
          </section>


          <footer className="space-y-1 text-center text-xs text-zinc-500">
            <p>
              Reload otomatis dalam <span className="font-mono text-zinc-300">{mm}:{ss}</span> · diambil{" "}
              {fmtWaktu(data.diambilPada)}
            </p>
            <p>Sumber: {data.sumber}</p>
          </footer>
        </>
      )}

      <p className="mt-auto pt-6 text-center text-xs text-zinc-500">
        © 2026 · development by <span className="text-amber-300">@fyd</span>
      </p>
    </main>
  );
}

const gaya = (arah: HasilEmas["arah"]) =>
  arah === "naik"
    ? { warna: "text-emerald-400", panah: "▲" }
    : arah === "turun"
      ? { warna: "text-rose-400", panah: "▼" }
      : { warna: "text-zinc-300", panah: "■" };

const fmtRp = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}Rp${fmtAngka(n)}`;

function KartuKunci({ kunci, jam }: { kunci: NonNullable<HasilEmas["kunci"]>; jam: string }) {
  const { warna, panah } = gaya(kunci.arah);
  return (
    <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-200/80">
            🔒 Kunci {kunci.hariIni ? "hari ini" : "sebelumnya"}
          </p>
          <p className="mt-0.5 text-sm text-zinc-300">
            {fmtTanggal(kunci.tanggal)} · {jam} WIB
          </p>
        </div>
        <div className="text-right">
          <p className={`font-mono text-3xl font-bold tabular-nums ${warna}`}>{fmtRp(kunci.hasil)}</p>
          <p className={`text-sm font-medium ${warna}`}>
            {panah} {kunci.arah.toUpperCase()}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Dibanding {fmtTanggal(kunci.pembanding)}.
        {!kunci.hariIni && ` Kunci hari ini muncul pukul ${jam} WIB.`}
      </p>
    </section>
  );
}
