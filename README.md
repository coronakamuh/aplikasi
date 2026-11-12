# Rencana Bangunan 3D

Aplikasi Android untuk merancang denah bangunan langsung di tampilan 3D. Semua ukuran dalam cm. Data tersimpan di perangkat.

## Cara kerja

- Dinding dibuat dari **titik sudut** yang dihubungkan, jadi bentuknya bebas (segitiga, L, segi banyak, miring). Pertemuan antar dinding **otomatis menyatu** dengan potongan diagonal (miter). Menempel ke tengah dinding lain membuat sambungan T.
- Garis yang digambar adalah **sisi luar** dinding. Tebal tumbuh ke **kanan** arah gambar, jadi membuat dinding searah jarum jam menaruh tebal di dalam. Tidak ada tombol balik sisi.

## Memakai

- Tombol **Dinding** menaruh dinding 200 x 200 cm (ubah di Pengaturan). Tanpa dinding terpilih, dinding pertama mengarah ke kanan layar. Dengan dinding terpilih, dinding baru menyambung di ujungnya. Arah diatur dengan **Lurus / Kanan 90 / Kiri 90** atau sudut belok sendiri.
- Ketuk **sisi dinding** untuk memilihnya, lalu ubah Panjang, Tebal, Tinggi. Ukuran hanya tampil di dinding yang dipilih. **Bentuk lanjutan** berisi tinggi tiap ujung, geser puncak, dan tombol segitiga/persegi.
- **Tahan sebentar** titik biru (sudut), titik oranye (puncak), atau dinding terpilih sampai bergetar, baru bisa diseret. Menyeret dinding menggeser seluruh dinding bersama dinding yang tersambung. **Kunci titik** mematikan semua geseran titik.
- **Magnet**: titik menempel sudut ke sudut (hijau) dan lepas dengan geseran kecil. Bisa dimatikan di Pengaturan. Dua titik oranye bisa disatukan menjadi puncak segitiga.
- Titik yang tertutup dinding disembunyikan; putar kamera sampai terlihat.
- **Tambah dinding di atas**: dinding baru berdiri di puncak dinding terpilih, mengikuti bentuk puncaknya.
- Satu jari memutar kamera. Dua jari: cubit untuk zoom, geser, atau putar (bangunan ikut searah jari). Jika satu jari diam, jari itu menjadi poros putaran.
- **Urungkan** dan **Ulangi** ada di pojok kanan bawah peta, **?** untuk panduan, **Atas** dan **Pas** untuk pandangan kamera.
- Pengaturan: ukuran dinding baru, grid, cadangan ke file, contoh rumah kecil, hapus semua.

## Membuat APK

1. Buka tab **Actions** di repository ini
2. Pilih **Buat APK Android**, lalu **Run workflow** (APK juga dibuat otomatis setiap push ke `main`)
3. Setelah hijau, buka run tersebut dan unduh **rencana-bangunan-3d-apk** di bagian Artifacts

## Pengembangan lokal

```
npm install
npm run dev
```

Logika geometri dinding ada di `src/geometry.js` (murni, tanpa DOM).
