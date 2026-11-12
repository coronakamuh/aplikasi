# Rencana Bangunan 3D

Aplikasi Android untuk merancang denah bangunan: gambar dinding di tampilan 2D, lalu lihat hasilnya dalam 3D yang bisa diputar dan di-zoom.

## Fitur

- Gambar dinding dengan ketukan (titik demi titik), otomatis menempel ke grid 25 cm dan ke ujung dinding lain
- Semua ukuran dalam cm: panjang tiap dinding tampil di denah, total panjang tampil di header
- Geser dan cubit untuk zoom di denah
- Hapus dinding, urungkan, kosongkan
- Atur tinggi dan tebal dinding
- Tampilan 3D (putar, geser, zoom)
- Data tersimpan otomatis di perangkat

## Membuat APK

1. Buka tab **Actions** di repository ini
2. Pilih **Buat APK Android**, lalu **Run workflow** (APK juga dibuat otomatis setiap push ke `main`)
3. Setelah hijau, buka run tersebut dan unduh **rencana-bangunan-3d-apk** di bagian Artifacts

## Pengembangan lokal

```
npm install
npm run dev
```
