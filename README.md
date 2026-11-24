# Hitung Emas XAUUSD

Menampilkan harga XAUUSD live dan menghitung:

```
(harga live − harga jam 11:40 WIB) × 320
contoh: (3700 − 3600) = 100 × 320 = 32.000 (naik)
```

- Acuan = 11:40 WIB **hari ini** bila sekarang sudah lewat jam 11:40 WIB, kalau belum pakai **kemarin**.
- Bila pasar tutup di jam itu (akhir pekan), dipakai harga terakhir sebelumnya.
- Data reload otomatis tiap 5 menit (bisa juga tombol Refresh).

## Kunci & Harga Asli

- **Kunci**: setiap hari bursa pukul 11:40 WIB, hasil dikunci = (harga 11:40 hari itu − harga 11:40 hari bursa sebelumnya) × 320. Sabtu/Minggu/libur dilewati.
- **Harga Asli** = Harga Asli hari bursa sebelumnya + hasil kunci yang dibulatkan ke kelipatan Rp5.000 terdekat.
  Titik awal: Rp2.055.000 (Selasa, 24 Nov 2026) — ubah di `AWAL` pada `src/components/HargaAsli.tsx`.
- Tombol **Koreksi** untuk memperbaiki Harga Asli secara manual. Tersimpan di localStorage browser
  (hanya di perangkat yang dipakai mengoreksi); perhitungan berikutnya melanjutkan dari angka koreksi.
- **Estimasi sekarang** = Harga Asli + hasil live dibulatkan ke Rp5.000.

## Sumber data

| Mode | Live | Acuan 11:40 WIB |
|---|---|---|
| Default (tanpa key) | gold-api.com XAU spot | Yahoo GC=F candle 5m, dikoreksi selisih futures–spot |
| `TWELVEDATA_API_KEY` diisi | Twelve Data XAU/USD | Twelve Data XAU/USD candle 5m |

Pengali (320) ada di `src/lib/emas.ts` (`PENGALI`).

## Jalankan

```bash
npm install
npm run dev
```

## Deploy ke Vercel

Push folder ini ke GitHub lalu import di vercel.com, atau `npx vercel --prod`.
Opsional: tambahkan env `TWELVEDATA_API_KEY` di Project Settings → Environment Variables.
