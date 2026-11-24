"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { HasilEmas } from "@/lib/emas";

/**
 * Harga Asli = harga asli hari bursa sebelumnya + hasil kunci 11:40 dibulatkan ke kelipatan Rp5.000.
 * Titik awal (dan koreksi manual) disimpan di localStorage browser.
 */

const KUNCI_STORAGE = "emas-hitung:harga-asli";
const KELIPATAN = 5000;
// Harga asli awal: Selasa, 24 Nov 2026 (hari kunci 11:40 WIB).
// Mengalahkan simpanan otomatis di browser yang tanggalnya <= ini; koreksi manual yang lebih baru tetap dipakai.
const AWAL: Jangkar = { tanggal: "2026-11-24", harga: 2_055_000, manual: true };

type Jangkar = { tanggal: string; harga: number; manual?: boolean }; // tanggal = YYYY-MM-DD (WIB)

export const bulat5rb = (n: number) => Math.sign(n) * Math.round(Math.abs(n) / KELIPATAN) * KELIPATAN;
const tglKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
const fmtRupiah = (n: number) => "Rp" + Math.abs(n).toLocaleString("id-ID", { maximumFractionDigits: 0 });
const fmtSelisih = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmtRupiah(n);
const fmtHari = (key: string) =>
  new Date(key + "T12:00:00+07:00").toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "short",
  });

// ---- localStorage sebagai external store ----
const EVENT = "harga-asli-berubah";
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}
const bacaRaw = () => localStorage.getItem(KUNCI_STORAGE);
function simpan(j: Jangkar) {
  localStorage.setItem(KUNCI_STORAGE, JSON.stringify(j));
  window.dispatchEvent(new Event(EVENT));
}
function parse(raw: string | null): Jangkar {
  try {
    const j = raw ? JSON.parse(raw) : null;
    if (j && typeof j.tanggal === "string" && Number.isFinite(j.harga)) {
      if (j.tanggal < AWAL.tanggal) return AWAL;
      if (j.tanggal === AWAL.tanggal && !j.manual) return AWAL;
      return j;
    }
  } catch {}
  return AWAL;
}

export default function HargaAsli({ data }: { data: HasilEmas }) {
  const raw = useSyncExternalStore(subscribe, bacaRaw, () => null);
  const jangkar = useMemo(() => parse(raw), [raw]);
  const [edit, setEdit] = useState(false);
  const [input, setInput] = useState("");

  // Rantai: mulai dari jangkar, tambahkan setiap kunci harian setelah tanggal jangkar
  const hitung = useMemo(() => {
    const setelah = data.riwayatKunci.filter((k) => tglKey(k.tanggal) > jangkar.tanggal);
    let harga = jangkar.harga;
    for (const k of setelah) harga += bulat5rb(k.hasil);
    const terakhir = setelah.at(-1);
    const bolong = setelah.length > 0 && tglKey(setelah[0].pembanding) > jangkar.tanggal;
    return {
      harga,
      tanggal: terakhir ? tglKey(terakhir.tanggal) : jangkar.tanggal,
      tambahan: terakhir ? bulat5rb(terakhir.hasil) : null,
      bolong,
    };
  }, [data.riwayatKunci, jangkar]);

  // Simpan hasil rantai sebagai jangkar baru agar tidak bergantung pada data lama
  useEffect(() => {
    if (hitung.tanggal > jangkar.tanggal) simpan({ tanggal: hitung.tanggal, harga: hitung.harga });
  }, [hitung.tanggal, hitung.harga, jangkar.tanggal]);

  const tambahanLive = bulat5rb(data.hasil);
  const estimasi = hitung.harga + tambahanLive;
  const dikoreksi = jangkar.manual && jangkar.tanggal === hitung.tanggal && jangkar !== AWAL;

  function mulaiKoreksi() {
    setInput(hitung.harga.toLocaleString("id-ID"));
    setEdit(true);
  }
  function simpanKoreksi(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(input.replace(/\D/g, ""));
    if (!n) return;
    simpan({ tanggal: hitung.tanggal, harga: n, manual: true });
    setEdit(false);
  }

  const warnaKunci = warna(hitung.tambahan ?? 0);
  const warnaLive = warna(tambahanLive);

  return (
    <section className="rounded-2xl border border-amber-400/40 bg-gradient-to-b from-amber-400/10 to-zinc-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-200/80">Harga Asli</p>
          <p className="mt-0.5 text-sm text-zinc-400">
            {fmtHari(hitung.tanggal)} · {data.jamAcuan} WIB
            {dikoreksi && <span className="ml-2 rounded bg-amber-400/20 px-1.5 py-0.5 text-xs text-amber-200">dikoreksi</span>}
          </p>
        </div>
        {!edit && (
          <button
            onClick={mulaiKoreksi}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Koreksi
          </button>
        )}
      </div>

      {edit ? (
        <form onSubmit={simpanKoreksi} className="mt-3 flex gap-2">
          <div className="flex flex-1 items-center rounded-lg border border-amber-400/50 bg-zinc-950 px-3">
            <span className="text-zinc-500">Rp</span>
            <input
              autoFocus
              inputMode="numeric"
              value={input}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ""));
                setInput(n ? n.toLocaleString("id-ID") : "");
              }}
              className="w-full bg-transparent px-2 py-2 font-mono text-lg tabular-nums text-zinc-100 outline-none"
            />
          </div>
          <button type="submit" className="rounded-lg bg-amber-400 px-3 text-sm font-medium text-zinc-950 hover:bg-amber-300">
            Simpan
          </button>
          <button type="button" onClick={() => setEdit(false)} className="rounded-lg px-2 text-sm text-zinc-400 hover:text-zinc-200">
            Batal
          </button>
        </form>
      ) : (
        <div className="mt-2 flex items-baseline gap-3">
          <span key={hitung.harga} className={`kedip font-mono text-4xl font-bold tabular-nums text-amber-200 ${warnaKunci.kedip}`}>
            {fmtRupiah(hitung.harga)}
          </span>
          {hitung.tambahan !== null && (
            <span className={`text-sm font-medium ${warnaKunci.teks}`}>
              {warnaKunci.panah} {fmtSelisih(hitung.tambahan)}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between rounded-xl bg-zinc-950/60 px-4 py-3">
        <span className="text-xs text-zinc-400">Estimasi sekarang (live)</span>
        <span className="flex items-baseline gap-2">
          <span key={estimasi} className={`kedip font-mono text-lg font-semibold tabular-nums text-zinc-100 ${warnaLive.kedip}`}>
            {fmtRupiah(estimasi)}
          </span>
          <span className={`text-xs ${warnaLive.teks}`}>
            {warnaLive.panah} {fmtSelisih(tambahanLive)}
          </span>
        </span>
      </div>

      {hitung.bolong && (
        <p className="mt-3 text-xs text-amber-300">
          Ada hari yang terlewat di luar jangkauan data. Cek angkanya, lalu Koreksi bila perlu.
        </p>
      )}
    </section>
  );
}

function warna(n: number) {
  if (n > 0) return { teks: "text-emerald-400", panah: "▲", kedip: "kedip-naik" };
  if (n < 0) return { teks: "text-rose-400", panah: "▼", kedip: "kedip-turun" };
  return { teks: "text-zinc-400", panah: "■", kedip: "" };
}
