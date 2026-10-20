# Sabit Taring Malam

Game aksi platformer Flutter dengan mesin gameplay asli di `game js/game/`.
APK Android menjalankannya melalui `GameActivity` dan WebView lokal, tanpa
server Playabl. Flutter Web memakai modul yang sama di dalam iframe.
Implementasi Flame lama masih dipakai untuk platform desktop/iOS.

## Menjalankan dan membangun

```powershell
flutter pub get
flutter run -d <id-perangkat-android>
flutter build apk --release
```

APK: `build/app/outputs/flutter-apk/app-release.apk`.

Kontrol sentuh: kiri/kanan, turun (merayap sebagai serigala atau turun dari
platform kayu), lompat, serangan, skill, ubah wujud, dan Eclipse saat energi penuh.
Tahan skill untuk memilih target; gunakan menu jeda untuk mengganti skin/area.

## Aset dan animasi

- Gambar: `assets/images/`; frame, anchor, dan animasi: `assets/json/`.
- Manifest game: `game js/assets.json`; salinan Flame: `assets/json/assets.json`.
- Skin terdiri dari tujuh atlas: gerak/serangan/aksi manusia dan serigala,
  serta Eclipse. Seluruh set dimuat sebelum mengganti skin yang aktif.
- Flutter membundel folder `game js` sebagai **`game%20js`**. Android mengenkode
  jalur sebelum membuka `flutter_assets`. URL Flutter Web memakai `game%2520js`
  agar nama file benar setelah server mendekode URL.
- Simulasi berjalan dalam langkah 1/60 detik, mengejar waktu antarframe hingga
  250 ms, dan menghapus akumulasi waktu saat aplikasi disembunyikan.

## Verifikasi

```powershell
flutter analyze
flutter test
npm.cmd --prefix tools ci
node --test tools/runtime.test.mjs
node tools/audit_assets.mjs
node tools/smoke_game.mjs
flutter build web
node tools/smoke_web.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/audit_apk.ps1
```

Pengujian browser membutuhkan Chrome. Tes mencakup gerak, lompat, transformasi,
serangan, frame awal/akhir setiap animasi untuk 10 skin, 11 area, pickup, dan
Eclipse. Audit APK membandingkan isi bundle dengan sumber menggunakan SHA-256.

Untuk tes kontrol sentuh APK debug: buka **Mulai Perjalanan**, cari PID dengan
`adb -s SERIAL shell pidof com.example.taring`, lalu:

```powershell
adb -s SERIAL forward tcp:9223 localabstract:webview_devtools_remote_PID
node tools/smoke_android.mjs
```

Tes Android memakai sesi game terbuka untuk mencoba gerak, multitouch, merayap,
serangan, lemari skin, dan Eclipse. Screenshot: `build/android-gameplay.png` dan
`build/android-eclipse.png`.
