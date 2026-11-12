# Rencana Bangunan 3D

Aplikasi Android untuk merancang denah bangunan langsung di tampilan 3D. Semua ukuran dalam cm. Data tersimpan di perangkat.

## Cara kerja

- Dinding dibuat dari **titik sudut** yang dihubungkan, jadi bentuknya bebas (segitiga, L, segi banyak, miring), tidak harus persegi.
- Pertemuan antar dinding **otomatis menyatu** (sudut dipotong rapi). Menyentuh bagian tengah dinding lain membuat sambungan T.
- Garis yang digambar adalah **sisi luar** dinding. Tebal tumbuh ke **kanan** arah gambar, sehingga menggambar **searah jarum jam** membuat tebal masuk ke dalam. Tombol **Balik sisi** membalik per dinding.

## Menggambar

- Mode **Gambar**: ketuk lantai untuk titik awal, lalu ketuk titik berikutnya. Titik menempel ke grid (bawaan 5 cm), ke titik lain, dan ke dinding lain.
- Untuk ukuran presisi, ketik **Panjang (cm)** dan **Sudut** lalu tekan **Tambah dinding**. Sudut 0&deg; = timur, 90&deg; = selatan (searah jarum jam). Mode **Belok** memutar dari arah dinding sebelumnya.
- Mode **Pilih**: ketuk dinding untuk mengubah panjang, tebal, dan tinggi; ketuk titik untuk mengubah posisi X/Y; seret titik untuk memindahkannya.
- Tiap dinding punya 2 titik bawah dan 2 titik atas: **Tinggi titik A** dan **Tinggi titik B** bisa berbeda (puncak miring). Di mode Pilih, titik oranye selalu tampil di semua dinding (dengan angka tinggi). Tarik ke atas, bawah, kiri, atau kanan pada bidang dinding; dekatkan dua titik oranye agar menyatu menjadi puncak segitiga. Tombol **Bentuk segitiga** / **Bentuk persegi** dan isian **Geser titik atas A/B** tersedia untuk ukuran presisi.
- **Tambah dinding di atas**: dinding baru berdiri otomatis di puncak dinding yang dipilih (mengikuti puncak miringnya) dan bisa diatur sendiri. Bisa bertingkat. Atau pilih **Di atas dinding** di mode Gambar, ketuk titik oranye atau puncak dinding, lalu gambar dinding baru di ketinggian itu (**Akhiri** untuk kembali ke lantai).
- Dinding berbahan bata tipis: tekstur bata 22 x 7 cm bernuansa lembut, hanya di sisi samping dinding.
- Titik kecil bergaris. Tempel ke titik/dinding lain berjarak dekat dan bisa dimatikan di Pengaturan.
- Tombol **Atas** untuk pandangan dari atas, **Pas** untuk menampilkan seluruh denah, **Urungkan** dan **Ulangi** untuk membatalkan dan mengulang.
- Satu jari memutar kamera; dua jari menggeser, zoom (cubit), dan memutar bangunan searah putaran jari.

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
