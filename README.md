# Sabit Taring Malam

Game aksi platformer yang dibuat dengan Flutter dan Flame. Gameplay, simulasi,
rendering, dan kontrol ditulis di Dart dan berjalan melalui runtime Flutter pada
semua platform.

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

- Gambar dan audio: `assets/images/` dan `assets/audio/`.
- Frame, anchor, animasi, data level, dan manifest tersimpan sebagai nilai Dart
  di `lib/data/game_data.dart`.
- Skin terdiri dari tujuh atlas: gerak/serangan/aksi manusia dan serigala,
  serta Eclipse. Seluruh set dimuat sebelum mengganti skin yang aktif.
- Simulasi berjalan dalam langkah 1/60 detik, mengejar waktu antarframe hingga
  250 ms, dan menghapus akumulasi waktu saat aplikasi disembunyikan.

## Verifikasi

```powershell
flutter analyze
flutter test
flutter build apk --release
powershell -NoProfile -ExecutionPolicy Bypass -File tools/audit_apk.ps1
```

Tes Flutter mencakup simulasi, aset, semua area, skin, dan gameplay.
Audit APK membandingkan aset Flutter yang dibundel dengan sumber menggunakan
SHA-256.
