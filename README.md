# Hitung Emas XAUUSD

Menampilkan harga XAUUSD live dan menghitung:

```
(harga live − harga jam 11:40 WIB) × 320
contoh: (3700 − 3600) = 100 × 320 = 32.000 (naik)
```

- Acuan = 11:40 WIB **hari ini** bila sekarang sudah lewat jam 11:40 WIB, kalau belum pakai **kemarin**.
- Bila pasar tutup di jam itu (akhir pekan), dipakai harga terakhir sebelumnya.
- Data reload otomatis tiap 5 menit (bisa juga tombol Refresh).

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
