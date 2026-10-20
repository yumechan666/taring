import 'dart:convert';
import 'dart:math' as math;

import 'package:flame/components.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'menu_music.dart';
import 'original_game.dart';
import 'skin_preview.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  _lockLandscapeFullscreen();
  runApp(const SabitTaringMalamApp());
}

/// The whole app, menu included, is landscape and fullscreen. Android and iOS
/// also declare this in their manifests; this covers desktop and the Flame path.
void _lockLandscapeFullscreen() {
  SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
}

class SabitTaringMalamApp extends StatelessWidget {
  const SabitTaringMalamApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Sabit Taring Malam',
        theme: ThemeData.dark(useMaterial3: true),
        home: const TaringShell(),
      );
}

class MyApp extends SabitTaringMalamApp {
  const MyApp({super.key});
}

class TaringShell extends StatefulWidget {
  const TaringShell({super.key});

  @override
  State<TaringShell> createState() => _TaringShellState();
}

class _TaringShellState extends State<TaringShell> with WidgetsBindingObserver {
  static const _saveKey = 'sabit_taring_malam_save';
  static const _nativeGame = MethodChannel('taring/game');
  final MenuMusic _music = MenuMusic();
  bool _openingGame = false;
  bool _playing = false;
  bool _tutorialVisible = false;
  // True when the tutorial was opened by "Mulai Perjalanan" and should start the run once closed.
  bool _tutorialStartsRun = false;
  bool _muted = false;
  int _bestScore = 0;
  int _selectedSkin = 0;
  int _selectedTheme = 0;
  TaringGame? _game;

  static const _skins = [
    ('Pemburu Malam', 'hero_human_move-transparent.webp'),
    ('Kabut Perak', 'skin2_human_move-transparent.webp'),
    ('Taring Bara', 'skin3_human_move-transparent.webp'),
    ('Bayang Gagak', 'skin4_human_move-transparent.webp'),
    ('Duri Mawar', 'skin5_human_move-transparent.webp'),
    ('Es Utara', 'skin6_human_move-transparent.webp'),
    ('Petir Badai', 'skin7_human_move-transparent.webp'),
    ('Darah Bulan', 'skin8_human_move-transparent.webp'),
    ('Roh Leluhur', 'skin9_human_move-transparent.webp'),
    ('Gerhana Abadi', 'skin10_human_move-transparent.webp'),
  ];
  static const _themes = [
    ('Desa Bulan', 'village_layer-transparent.webp'),
    ('Hutan Kabut', 'forest_layer-transparent.webp'),
    ('Kereta Pemburu', 'layer_a1-transparent.webp'),
    ('Rawa Lentera', 'layer_a2-transparent.webp'),
    ('Menara Rusa', 'layer_a3-transparent.webp'),
    ('Makam Salju', 'layer_a4-transparent.webp'),
    ('Pasar Topeng', 'layer_a5-transparent.webp'),
    ('Tambang Kristal', 'layer_a6-transparent.webp'),
    ('Biara Lonceng', 'layer_a7-transparent.webp'),
    ('Pelabuhan Kabut', 'layer_a8-transparent.webp'),
    ('Hutan Abu', 'layer_a9-transparent.webp'),
    ('Istana Bulan', 'layer_a10-transparent.webp'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadSave();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _music.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _music.setForeground(state == AppLifecycleState.resumed);
  }

  Future<void> _loadSave() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_saveKey);
    if (raw != null) {
      final save = jsonDecode(raw) as Map<String, dynamic>;
      if (mounted) {
        setState(() {
          _bestScore = (save['bestScore'] as num?)?.toInt() ?? 0;
          _muted = save['muted'] as bool? ?? false;
          _selectedSkin = (save['skin'] as num?)?.toInt() ?? 0;
          _selectedTheme = (save['theme'] as num?)?.toInt() ?? 0;
          _selectedSkin = _selectedSkin.clamp(0, _skins.length - 1);
          _selectedTheme = _selectedTheme.clamp(0, _themes.length - 1);
        });
      }
    }
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_saveKey, jsonEncode({
      'version': 1,
      'bestScore': _bestScore,
      'muted': _muted,
      'skin': _selectedSkin,
      'theme': _selectedTheme,
    }));
  }

  /// Every new run opens the tutorial first. It can be skipped, and it does not
  /// depend on whether it was seen before.
  void _beginRun() {
    if (_openingGame) return;
    setState(() {
      _tutorialVisible = true;
      _tutorialStartsRun = true;
    });
  }

  void _closeTutorial() {
    final startRun = _tutorialStartsRun;
    setState(() {
      _tutorialVisible = false;
      _tutorialStartsRun = false;
    });
    if (startRun) _startGame();
  }

  Future<void> _startGame() async {
    if (_openingGame) return;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      setState(() => _openingGame = true);
      // The game plays its own music; stop the menu music. Opening the game must
      // never wait on audio, so this is not awaited.
      _music.setWanted(false);
      try {
        final raw = await _nativeGame.invokeMethod<String>('openGame', {
          'skin': _selectedSkin + 1,
          'area': _selectedTheme <= 1 ? 0 : _selectedTheme - 1,
          'muted': _muted,
        });
        if (!mounted) return;
        if (raw != null) {
          final result = jsonDecode(raw) as Map<String, dynamic>;
          setState(() {
            _bestScore = math.max(_bestScore, (result['bestScore'] as num?)?.toInt() ?? 0);
            _muted = result['muted'] as bool? ?? _muted;
            _selectedSkin = ((result['skin'] as num?)?.toInt() ?? _selectedSkin + 1) - 1;
            _selectedSkin = _selectedSkin.clamp(0, _skins.length - 1);
          });
          await _save();
        }
      } on PlatformException catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Game gagal dibuka: ${error.message}')),
          );
        }
      } finally {
        if (mounted) setState(() => _openingGame = false);
      }
      return;
    }
    if (kIsWeb) {
      enterGameFullscreen(); // must run inside the tap that started the game
      setState(() => _playing = true);
      return;
    }
    _lockLandscapeFullscreen();
    setState(() {
      _playing = true;
      _game = TaringGame(
        muted: _muted,
        skinFile: _skins[_selectedSkin].$2,
        themeFile: _themes[_selectedTheme].$2,
        tileKey: _selectedTheme == 0 ? 'TILES_VILLAGE' : _selectedTheme == 1 ? 'TILES_FOREST' : 'TILES_A${_selectedTheme - 1}',
        onGameOver: (score) {
          if (score > _bestScore) setState(() => _bestScore = score);
          _save();
        },
        onScore: (score) {
          if (score > _bestScore) {
            setState(() => _bestScore = score);
            _save();
          }
        },
      );
    });
  }

  void _returnToMenu() {
    _lockLandscapeFullscreen();
    setState(() => _playing = false);
  }

  void _resetProgress() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reset progress?'),
        content: const Text('Semua skor terbaik akan dihapus.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Reset')),
        ],
      ),
    );
    if (ok == true && mounted) {
      if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
        await _nativeGame.invokeMethod<void>('resetGameProgress');
      }
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_saveKey);
      if (!mounted) return;
      setState(() => _bestScore = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Menu music plays only at the menu: not muted, not in a run, not while the
    // game is opening. The state is compared first so rebuilds stay cheap.
    final wantMusic = !_muted && !_playing && !_openingGame;
    if (wantMusic != _music.wanted) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _music.setWanted(wantMusic));
    }
    return Scaffold(
      body: Listener(
        // Browsers only allow audio after a gesture, so the first tap starts it.
        onPointerDown: (_) => _music.nudge(),
        child: SafeArea(
          child: _playing ? _buildGame() : _buildMenu(),
        ),
      ),
    );
  }

  static const _gold = Color(0xffffd27d);

  Widget _buildMenu() => DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xff05070f), Color(0xff141a31), Color(0xff28182c)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Stack(
          children: [
            Positioned.fill(child: Image.asset('assets/images/sky_bg.webp', fit: BoxFit.cover, opacity: const AlwaysStoppedAnimation(.28))),
            const Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(radius: 1.05, colors: [Color(0x00000000), Color(0xcc03040a)], stops: [.5, 1]),
                ),
              ),
            ),
            LayoutBuilder(builder: (context, box) {
              final wide = box.maxWidth > 720 && box.maxWidth > box.maxHeight;
              final header = _menuHeader(compact: wide && box.maxHeight < 480);
              final content = wide
                  ? Row(children: [
                      Expanded(flex: 5, child: Column(mainAxisSize: MainAxisSize.min, children: [header, SizedBox(height: box.maxHeight < 480 ? 14 : 20), _menuActions()])),
                      const SizedBox(width: 28),
                      Expanded(flex: 6, child: _selectionPanel()),
                    ])
                  : Column(mainAxisSize: MainAxisSize.min, children: [
                      header,
                      const SizedBox(height: 20),
                      _selectionPanel(),
                      const SizedBox(height: 20),
                      _menuActions(),
                    ]);
              return Center(
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(20, wide ? 20 : 60, 20, 24),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: wide ? 1000 : 520),
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: 1),
                      duration: const Duration(milliseconds: 520),
                      curve: Curves.easeOutCubic,
                      builder: (context, t, child) => Opacity(opacity: t, child: Transform.translate(offset: Offset(0, 18 * (1 - t)), child: child)),
                      child: content,
                    ),
                  ),
                ),
              );
            }),
            Positioned(top: 12, right: 12, child: IconButton.filledTonal(onPressed: () { setState(() => _muted = !_muted); _save(); }, icon: Icon(_muted ? Icons.volume_off : Icons.volume_up))),
            if (_tutorialVisible) _tutorialOverlay(),
          ],
        ),
      );

  Widget _menuHeader({bool compact = false}) {
    final logo = compact ? 64.0 : 120.0;
    Widget rule() => Container(
          width: 44,
          height: 1.5,
          decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0x00ffd27d), _gold, Color(0x00ffd27d)])),
        );
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: logo + (compact ? 20 : 44),
        height: logo + (compact ? 20 : 44),
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [Color(0x55ffd27d), Color(0x1affd27d), Color(0x00ffd27d)], stops: [0, .6, 1]),
        ),
        child: Image.asset('assets/images/logo.png', width: logo, height: logo, fit: BoxFit.contain),
      ),
      ShaderMask(
        shaderCallback: (rect) => const LinearGradient(
          colors: [Color(0xfffff1c9), Color(0xffffc46b), Color(0xffd98a3a)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ).createShader(rect),
        child: Text(
          'SABIT TARING MALAM',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: compact ? 22 : 28,
            fontWeight: FontWeight.w900,
            letterSpacing: 3,
            color: Colors.white,
            shadows: const [Shadow(color: Color(0x99000000), blurRadius: 14, offset: Offset(0, 3))],
          ),
        ),
      ),
      SizedBox(height: compact ? 4 : 8),
      Row(mainAxisSize: MainAxisSize.min, children: [
        rule(),
        const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Icon(Icons.nightlight_round, size: 14, color: _gold)),
        rule(),
      ]),
      SizedBox(height: compact ? 8 : 12),
      _bestScorePill(),
    ]);
  }

  Widget _bestScorePill() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: const Color(0x66000000),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0x55ffd27d)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.emoji_events_rounded, size: 18, color: _gold),
          const SizedBox(width: 8),
          Text('Skor terbaik: $_bestScore', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        ]),
      );

  Widget _menuActions() => Column(mainAxisSize: MainAxisSize.min, children: [
        _playButton(),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: _menuButton('Tutorial', Icons.menu_book_rounded, () => setState(() => _tutorialVisible = true))),
          const SizedBox(width: 12),
          Expanded(child: _menuButton('Reset', Icons.restart_alt_rounded, _resetProgress)),
        ]),
      ]);

  Widget _playButton() {
    final enabled = !_openingGame;
    return Container(
      height: 64,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          colors: enabled ? const [Color(0xffd2484f), Color(0xff8e2238)] : const [Color(0xff5a2a33), Color(0xff3c1c26)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        border: Border.all(color: const Color(0xccffd27d), width: 1.5),
        boxShadow: enabled ? const [BoxShadow(color: Color(0x66d2484f), blurRadius: 22, offset: Offset(0, 6))] : const [],
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: enabled ? _beginRun : null,
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(enabled ? Icons.play_arrow_rounded : Icons.hourglass_top_rounded, size: 30, color: Colors.white),
            const SizedBox(width: 10),
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(enabled ? 'Mulai Perjalanan' : 'Membuka game…', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: .6, color: Colors.white)),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _menuButton(String label, IconData icon, VoidCallback? onPressed) => SizedBox(
        height: 50,
        child: OutlinedButton.icon(
          onPressed: onPressed,
          icon: Icon(icon, size: 20),
          label: Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.white,
            backgroundColor: const Color(0x99161c33),
            side: const BorderSide(color: Color(0x33ffffff)),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
      );

  Widget _selectionPanel() => Container(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
        decoration: BoxDecoration(
          color: const Color(0x8c0b0f1e),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0x22ffffff)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          _sectionLabel(Icons.landscape_rounded, 'PILIH TEMA', _themes[_selectedTheme].$1),
          const SizedBox(height: 8),
          SizedBox(height: 76, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: _themes.length, separatorBuilder: (context, index) => const SizedBox(width: 8), itemBuilder: (context, index) => _choiceChip(
                selected: _selectedTheme == index,
                onTap: () { setState(() => _selectedTheme = index); _save(); },
                leading: ClipRRect(borderRadius: BorderRadius.circular(9), child: Image.asset('assets/images/${_themes[index].$2}', width: 52, height: 60, fit: BoxFit.cover)),
                label: _themes[index].$1,
              ))),
          const SizedBox(height: 14),
          _sectionLabel(Icons.person_rounded, 'PILIH SKIN', _skins[_selectedSkin].$1),
          const SizedBox(height: 8),
          SizedBox(height: 100, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: _skins.length, separatorBuilder: (context, index) => const SizedBox(width: 8), itemBuilder: (context, index) => _choiceChip(
                selected: _selectedSkin == index,
                onTap: () { setState(() => _selectedSkin = index); _save(); },
                leading: SkinPreview(file: _skins[index].$2),
                label: _skins[index].$1,
              ))),
        ]),
      );

  Widget _sectionLabel(IconData icon, String label, String value) => Row(children: [
        Icon(icon, size: 16, color: _gold),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(color: Colors.white.withValues(alpha: .75), fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 1.4)),
        const SizedBox(width: 12),
        Expanded(child: Text(value, textAlign: TextAlign.end, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: _gold, fontSize: 12, fontWeight: FontWeight.w700))),
      ]);

  Widget _choiceChip({required bool selected, required VoidCallback onTap, required Widget leading, required String label}) => GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          width: 150,
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            color: selected ? const Color(0xff2c2130) : const Color(0x66000000),
            border: Border.all(color: selected ? _gold : Colors.white24, width: selected ? 2 : 1),
            boxShadow: selected ? const [BoxShadow(color: Color(0x55ffd27d), blurRadius: 14)] : const [],
          ),
          child: Row(children: [
            leading,
            const SizedBox(width: 7),
            Expanded(child: Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, fontWeight: selected ? FontWeight.w800 : FontWeight.w500, color: selected ? Colors.white : Colors.white70))),
          ]),
        ),
      );

  static const _tutorialTips = [
    (Icons.gamepad_rounded, 'Joystick', 'Geser ke kiri atau kanan untuk bergerak. Satu jempol cukup.'),
    (Icons.south_rounded, 'Turun', 'Tarik joystick ke bawah: merayap sebagai serigala atau turun dari platform kayu.'),
    (Icons.north_rounded, 'Lompat', 'Lewati jurang dan rintangan.'),
    (Icons.flash_on_rounded, 'Serang', 'Sabit saat manusia, cakar saat serigala.'),
    (Icons.my_location_rounded, 'Skill', 'Tahan untuk memilih target.'),
    (Icons.pets_rounded, 'Ubah wujud', 'Berganti antara manusia dan serigala.'),
    (Icons.nightlight_round, 'Eclipse', 'Aktif saat energi bulan penuh.'),
    (Icons.pause_rounded, 'Jeda', 'Ganti skin, area, atau kembali ke menu.'),
  ];

  /// Shown before every run and from the menu. "Lewati" always closes it, and
  /// closing it after "Mulai Perjalanan" starts the run.
  Widget _tutorialOverlay() => Positioned.fill(
        child: Container(
          color: const Color(0xe6030409),
          child: SafeArea(
            child: Stack(children: [
              Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: ConstrainedBox(
                  // Wide enough for three tip columns on landscape phones.
                  constraints: const BoxConstraints(maxWidth: 920),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xff1c2340), Color(0xff0d1022)], begin: Alignment.topCenter, end: Alignment.bottomCenter),
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: const Color(0x66ffd27d), width: 1.5),
                      boxShadow: const [BoxShadow(color: Color(0x99000000), blurRadius: 30, offset: Offset(0, 12))],
                    ),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.nightlight_round, size: 26, color: _gold),
                        SizedBox(width: 10),
                        Flexible(child: Text('Cara Bermain', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 1))),
                      ]),
                      const SizedBox(height: 6),
                      Text('Kumpulkan pecahan bulan, kalahkan boss, dan bertahan hidup.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: .7))),
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        alignment: WrapAlignment.center,
                        children: [for (final tip in _tutorialTips) _tutorialTip(tip.$1, tip.$2, tip.$3)],
                      ),
                      const SizedBox(height: 18),
                      SizedBox(
                        width: 280,
                        height: 50,
                        child: FilledButton.icon(
                          onPressed: _closeTutorial,
                          icon: Icon(_tutorialStartsRun ? Icons.play_arrow_rounded : Icons.check_rounded),
                          label: Text(_tutorialStartsRun ? 'Mengerti, mulai bermain' : 'Mengerti', style: const TextStyle(fontWeight: FontWeight.w800)),
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xffb83a48),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ]),
                  ),
                ),
              ),
              ),
              // Pinned so skipping never needs scrolling on short landscape screens.
              Positioned(
                top: 8,
                right: 8,
                child: TextButton.icon(
                  onPressed: _closeTutorial,
                  icon: const Icon(Icons.skip_next_rounded),
                  label: const Text('Lewati', style: TextStyle(fontWeight: FontWeight.w800)),
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    backgroundColor: const Color(0x66000000),
                    side: const BorderSide(color: Color(0x33ffffff)),
                    shape: const StadiumBorder(),
                  ),
                ),
              ),
            ]),
          ),
        ),
      );

  Widget _tutorialTip(IconData icon, String title, String body) => Container(
        constraints: const BoxConstraints(maxWidth: 240),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: const Color(0x55000000),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0x1fffffff)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(shape: BoxShape.circle, color: const Color(0xff262d4a), border: Border.all(color: const Color(0x66ffd27d))),
            child: Icon(icon, size: 20, color: _gold),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(body, style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: .72))),
            ]),
          ),
        ]),
      );

  Widget _buildGame() {
    if (kIsWeb) {
      return OriginalGame(
        skin: _selectedSkin + 1,
        area: _selectedTheme <= 1 ? 0 : _selectedTheme - 1,
        muted: _muted,
        onClose: (result) {
          setState(() {
            _bestScore = math.max(_bestScore, (result['bestScore'] as num?)?.toInt() ?? 0);
            _muted = result['muted'] as bool? ?? _muted;
            _selectedSkin = (((result['skin'] as num?)?.toInt() ?? _selectedSkin + 1) - 1).clamp(0, _skins.length - 1);
            _playing = false;
          });
          leaveGameFullscreen();
          _save();
        },
      );
    }
    final game = _game!;
    return Stack(children: [
      GameWidget(game: game),
      Positioned(top: 12, left: 12, child: _hudPill('SKOR ${game.score}')),
      Positioned(top: 8, right: 8, child: Row(children: [
        IconButton.filledTonal(onPressed: () { setState(() => _muted = !_muted); game.muted = _muted; _save(); }, icon: Icon(_muted ? Icons.volume_off : Icons.volume_up)),
        IconButton.filledTonal(onPressed: () => setState(() => _tutorialVisible = true), icon: const Icon(Icons.help_outline)),
        IconButton.filledTonal(onPressed: _returnToMenu, icon: const Icon(Icons.home_outlined)),
      ])),
      Positioned(bottom: 20, left: 20, child: Row(children: [
        _gameButton(Icons.arrow_back, () => game.move(-1)),
        const SizedBox(width: 10),
        _gameButton(Icons.arrow_forward, () => game.move(1)),
        const SizedBox(width: 10),
        _gameButton(Icons.flash_on, game.attack),
        const SizedBox(width: 10),
        _gameButton(Icons.pets, game.transform),
      ])),
      Positioned(bottom: 20, right: 20, child: _gameButton(Icons.keyboard_double_arrow_up, game.jump, large: true)),
      if (_tutorialVisible) _tutorialOverlay(),
    ]);
  }

  Widget _hudPill(String text) => DecoratedBox(decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(16)), child: Padding(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8), child: Text(text, style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xffffd27d)))));
  Widget _gameButton(IconData icon, VoidCallback action, {bool large = false}) => SizedBox(
        width: large ? 72 : 58,
        height: large ? 72 : 58,
        child: Material(
          color: const Color(0xdd10142a),
          shape: CircleBorder(side: BorderSide(color: const Color(0xff8a94bd).withValues(alpha: .55), width: 2)),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: action,
            child: Icon(icon, size: large ? 34 : 28, color: const Color(0xffcfe4ff)),
          ),
        ),
      );
}

class TaringGame extends FlameGame {
  TaringGame({required this.onScore, required this.onGameOver, required this.muted, required this.skinFile, required this.themeFile, required this.tileKey});
  final ValueChanged<int> onScore;
  final ValueChanged<int> onGameOver;
  final String skinFile;
  final String themeFile;
  final String tileKey;
  bool muted;
  int score = 0;
  int hp = 5;
  bool isOver = false;
  bool wolfForm = false;
  double _worldX = 0;
  double _spawnClock = 0;
  double _attackClock = 0;
  double _hitCooldown = 0;
  double _shardClock = 3;
  int _nextBossScore = 40;
  late final TextComponent _scoreText;
  late final TextComponent _hpText;
  final List<_MovingTarget> _targets = [];
  final List<_WorldPickup> _pickups = [];
  final List<SpriteComponent> _terrainTiles = [];
  SpriteAnimationComponent? _hero;
  SpriteComponent? _sky;
  SpriteComponent? _village;
  double _vx = 0;
  double _vy = 0;
  bool _grounded = true;

  @override
  Future<void> onLoad() async {
    await _loadAssetRegistry();
    final sky = await loadSprite('sky_bg.webp');
    _sky = SpriteComponent(sprite: sky, priority: -20);
    add(_sky!);
    final village = await loadSprite(themeFile);
    _village = SpriteComponent(sprite: village, priority: -10);
    add(_village!);

    final tileData = await loadFrameData(tileKey);
    final tileFrame = (tileData['frames'] as List).cast<Map<String, dynamic>>().firstWhere((f) => f['name'] == 'top');
    final tileSource = tileFrame['source'] as Map<String, dynamic>;
    final tileImage = await images.load(_assetPaths[tileKey]!.split('/').last);
    final terrainSprite = Sprite(tileImage, srcPosition: Vector2((tileSource['x'] as num).toDouble(), (tileSource['y'] as num).toDouble()), srcSize: Vector2((tileSource['w'] as num).toDouble(), (tileSource['h'] as num).toDouble()));
    for (var i = 0; i < 24; i++) {
      final tile = SpriteComponent(sprite: terrainSprite, size: Vector2(88, 72), priority: 0);
      _terrainTiles.add(tile);
      add(tile);
    }

    final heroKey = _keyForFile(skinFile);
    final animation = await _loadAnimation(heroKey, 'idle');
    _hero = SpriteAnimationComponent(animation: animation, anchor: Anchor.bottomCenter, priority: 2, size: Vector2(170, 190));
    add(_hero!);
    _placeHero(size);

    _scoreText = TextComponent(text: 'SHARDS 0', position: Vector2(18, 48), priority: 20, textRenderer: TextPaint(style: const TextStyle(color: Color(0xffffd27d), fontSize: 18, fontWeight: FontWeight.bold)));
    _hpText = TextComponent(text: '❤ ❤ ❤ ❤ ❤', position: Vector2(18, 72), priority: 20, textRenderer: TextPaint(style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)));
    addAll([_scoreText, _hpText]);
    _spawnEnemy();
    _spawnPickup();
  }

  final Map<String, String> _assetPaths = {};
  final Map<String, Map<String, dynamic>> _frameData = {};
  final Map<String, Sprite> _spriteCache = {};

  Future<void> _loadAssetRegistry() async {
    final raw = await rootBundle.loadString('assets/json/assets.json');
    final manifest = jsonDecode(raw) as Map<String, dynamic>;
    for (final entry in manifest.entries) {
      _assetPaths[entry.key] = (entry.value as Map<String, dynamic>)['src'] as String;
    }
  }

  /// All manifest assets are addressable by their game JS keys, with frame
  /// metadata cached alongside each image. Components request only what they use.
  Future<Map<String, dynamic>> loadFrameData(String key) async {
    if (_frameData.containsKey(key)) return _frameData[key]!;
    final imagePath = _assetPaths[key];
    if (imagePath == null) throw StateError('Asset key not found: $key');
    final framePath = imagePath.replaceFirst(RegExp(r'\.(webp|png)$'), '.frames.json').split('/').last;
    final data = jsonDecode(await rootBundle.loadString('assets/json/$framePath')) as Map<String, dynamic>;
    _frameData[key] = data;
    return data;
  }

  Future<Sprite> loadAssetSprite(String key) async {
    final cached = _spriteCache[key];
    if (cached != null) return cached;
    final path = _assetPaths[key];
    if (path == null) throw StateError('Asset key not found: $key');
    final sprite = await loadSprite(path.split('/').last);
    _spriteCache[key] = sprite;
    return sprite;
  }

  String _keyForFile(String file) => _assetPaths.entries.firstWhere((entry) => entry.value.endsWith('/$file'), orElse: () => throw StateError('No manifest asset for $file')).key;

  Future<SpriteAnimation> _loadAnimation(String key, String animationName) async {
    final data = await loadFrameData(key);
    final availableAnimations = (data['animations'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final animation = availableAnimations.where((a) => a['name'] == animationName).firstOrNull ?? availableAnimations.firstOrNull;
    final animationFrames = animation?['frames'] as List?;
    final frameEntries = (data['frames'] as List).cast<Map<String, dynamic>>();
    final chosenFrames = animationFrames?.cast<Map<String, dynamic>>() ?? frameEntries.where((f) => (f['name'] as String).startsWith('${animationName}_')).toList();
    final path = _assetPaths[key]!.split('/').last;
    final image = await images.load(path);
    final sprites = chosenFrames.map((frame) {
      final source = frame['source'] as Map<String, dynamic>;
      return Sprite(image, srcPosition: Vector2((source['x'] as num).toDouble(), (source['y'] as num).toDouble()), srcSize: Vector2((source['w'] as num).toDouble(), (source['h'] as num).toDouble()));
    }).toList();
    if (sprites.isEmpty) throw StateError('No $animationName frames in $key');
    return SpriteAnimation.spriteList(sprites, stepTime: .12);
  }

  @override
  void onGameResize(Vector2 size) {
    super.onGameResize(size);
    _sky?.size = size;
    _village?.position = Vector2(0, size.y * .32);
    _village?.size = Vector2(size.x, size.y * .68);
    _placeHero(size);
    if (isLoaded) {
      _scoreText.position = Vector2(18, 48);
      _hpText.position = Vector2(18, 72);
    }
  }

  void _placeHero(Vector2 viewport) {
    final hero = _hero;
    if (hero != null) hero.position = Vector2(viewport.x * .35, viewport.y * .86);
    for (var i = 0; i < _terrainTiles.length; i++) {
      final tile = _terrainTiles[i];
      tile.position = Vector2(i * tile.size.x, viewport.y * .86);
    }
  }

  @override
  void update(double dt) {
    super.update(dt);
    if (isOver) return;
    _worldX += 120 * dt;
    _spawnClock += dt;
    _attackClock = math.max(0, _attackClock - dt);
    _hitCooldown = math.max(0, _hitCooldown - dt);
    _shardClock -= dt;
    if (_spawnClock > 2.7) {
      _spawnClock = 0;
      _spawnEnemy();
    }
    if (score >= _nextBossScore) {
      _spawnBoss();
      _nextBossScore += 40;
    }
    if (_shardClock <= 0) {
      _shardClock = 4.5;
      _spawnPickup();
    }
    _village?.x = -(_worldX * .10) % math.max(1, size.x);
    for (var i = 0; i < _terrainTiles.length; i++) {
      _terrainTiles[i].x = i * _terrainTiles[i].size.x - (_worldX % _terrainTiles[i].size.x);
    }
    _vx *= math.pow(.001, dt).toDouble();
    final hero = _hero;
    if (hero == null) return;
    hero.x = (hero.x + _vx * dt).clamp(50, math.max(51, size.x - 50)).toDouble();
    if (!_grounded) {
      _vy += 1100 * dt;
      hero.y += _vy * dt;
      if (hero.y >= size.y * .86) {
        hero.y = size.y * .86;
        _vy = 0;
        _grounded = true;
      }
    }
    for (final target in [..._targets]) {
      target.sprite.x -= (120 + target.speed) * dt;
      if ((_hero!.x - target.sprite.x).abs() < 72 && (_hero!.y - target.sprite.y).abs() < 90 && _hitCooldown <= 0) {
        hp--;
        _hitCooldown = 1.0;
        _showImpact();
        _hpText.text = '❤ ' * hp + '♡ ' * (5 - hp);
        if (hp <= 0) {
          isOver = true;
          onGameOver(score);
          add(TextComponent(text: 'PERMAINAN BERAKHIR', anchor: Anchor.center, position: size / 2, priority: 30, textRenderer: TextPaint(style: const TextStyle(color: Color(0xffffd27d), fontSize: 28, fontWeight: FontWeight.bold))));
        }
      }
      if (target.sprite.x < -100) {
        target.sprite.removeFromParent();
        _targets.remove(target);
      }
    }
    for (final pickup in [..._pickups]) {
      pickup.sprite.x -= 120 * dt;
      if ((_hero!.x - pickup.sprite.x).abs() < 64 && (_hero!.y - pickup.sprite.y).abs() < 88) {
        pickup.sprite.removeFromParent();
        _pickups.remove(pickup);
        score += 10;
        _scoreText.text = 'SHARDS $score';
        onScore(score);
      } else if (pickup.sprite.x < -80) {
        pickup.sprite.removeFromParent();
        _pickups.remove(pickup);
      }
    }
  }

  void move(double direction) {
    if (isOver) return;
    _vx = direction * 420;
  }

  void jump() {
    if (isOver) return;
    if (_grounded) {
      _grounded = false;
      _vy = -600;
    }
  }

  Future<void> transform() async {
    if (isOver) return;
    wolfForm = !wolfForm;
    final id = _skinId;
    final key = wolfForm ? (id == 1 ? 'HERO_WOLF_MOVE' : 'SKIN${id}_WOLF_MOVE') : _keyForFile(skinFile);
    _hero?.animation = await _loadAnimation(key, 'idle');
    _hero?.size = wolfForm ? Vector2(180, 130) : Vector2(170, 190);
    try {
      final spirit = await _loadAnimation('FX_SPIRIT', 'spirit_wolf');
      final effect = SpriteAnimationComponent(animation: spirit, position: Vector2(_hero!.x, _hero!.y - 70), size: Vector2(120, 100), priority: 8);
      add(effect);
      Future<void>.delayed(const Duration(milliseconds: 600), effect.removeFromParent);
    } catch (_) {}
  }

  void attack() {
    if (isOver || _attackClock > 0) return;
    _attackClock = .45;
    _showSlash();
    for (final target in [..._targets]) {
      if ((target.sprite.x - _hero!.x).abs() < 190) {
        target.hp--;
        if (target.hp <= 0) {
          target.sprite.removeFromParent();
          _targets.remove(target);
          score += 5;
          _scoreText.text = 'SHARDS $score';
          onScore(score);
        }
      }
    }
    final combatKey = wolfForm
        ? (_skinId == 1 ? 'HERO_WOLF_COMBAT' : 'SKIN${_skinId}_WOLF_COMBAT')
        : (_skinId == 1 ? 'HERO_HUMAN_COMBAT' : 'SKIN${_skinId}_HUMAN_COMBAT');
    _playAction(combatKey, wolfForm ? 'claw' : 'slash1');
  }

  int get _skinId => skinFile.startsWith('skin') ? int.tryParse(skinFile.substring(4, skinFile.indexOf('_'))) ?? 1 : 1;

  Future<void> _playAction(String key, String action) async {
    try {
      final hero = _hero;
      if (hero == null) return;
      hero.animation = await _loadAnimation(key, action);
      await Future<void>.delayed(const Duration(milliseconds: 420));
      if (!isOver && _hero != null) {
        final moveKey = wolfForm
            ? (_skinId == 1 ? 'HERO_WOLF_MOVE' : 'SKIN${_skinId}_WOLF_MOVE')
            : _keyForFile(skinFile);
        _hero!.animation = await _loadAnimation(moveKey, 'idle');
      }
    } catch (_) {}
  }

  Future<void> _showSlash() async {
    try {
      final animation = await _loadAnimation('FX_COMBAT', 'slash');
      final effect = SpriteAnimationComponent(animation: animation, position: Vector2(_hero!.x + 50, _hero!.y - 80), size: Vector2(115, 95), priority: 8);
      add(effect);
      Future<void>.delayed(const Duration(milliseconds: 420), effect.removeFromParent);
    } catch (_) {
      // Keep the attack responsive if an optional visual effect is unavailable.
    }
  }

  Future<void> _showImpact() async {
    try {
      final animation = await _loadAnimation('FX_IMPACT', 'hit_spark');
      final effect = SpriteAnimationComponent(animation: animation, position: Vector2(_hero!.x + 25, _hero!.y - 65), size: Vector2(72, 72), priority: 9);
      add(effect);
      Future<void>.delayed(const Duration(milliseconds: 400), effect.removeFromParent);
    } catch (_) {}
  }

  void _spawnEnemy() async {
    if (size.x <= 0 || isOver) return;
    final keys = _assetPaths.keys.where((key) => key.startsWith('ENEMY_') || key.startsWith('MON_')).toList();
    final key = keys[math.Random().nextInt(keys.length)];
    final animationKey = key;
    if (isOver) return;
    final height = (key == 'ENEMY_CROW' || key == 'MON_BAT') ? size.y * .53 : size.y * .85;
    final animation = await _loadAnimation(animationKey, 'idle');
    final comp = SpriteAnimationComponent(animation: animation, position: Vector2(size.x + 60, height), size: Vector2(110, 110), anchor: Anchor.bottomCenter, priority: 3);
    add(comp);
    _targets.add(_MovingTarget(comp, (40 + math.Random().nextInt(80)).toDouble(), 1 + math.Random().nextInt(2)));
  }

  Future<void> _spawnBoss() async {
    if (size.x <= 0 || isOver) return;
    final area = tileKey.startsWith('TILES_A') ? int.tryParse(tileKey.substring(7)) ?? 1 : 1;
    final bossKey = 'BOSS_A${area.clamp(1, 10)}';
    final animation = await _loadAnimation(bossKey, 'idle');
    if (isOver) return;
    final boss = SpriteAnimationComponent(animation: animation, position: Vector2(size.x + 100, size.y * .86), size: Vector2(220, 220), anchor: Anchor.bottomCenter, priority: 5);
    add(boss);
    _targets.add(_MovingTarget(boss, 20, 8, isBoss: true));
  }

  Future<void> _spawnPickup() async {
    if (size.x <= 0) return;
    final sheet = await images.load('props_objects-transparent.webp');
    final data = await loadFrameData('PROPS_OBJECTS');
    final source = (data['frames'] as List).cast<Map<String, dynamic>>().firstWhere((f) => f['name'] == 'moon_shard')['source'] as Map<String, dynamic>;
    final sprite = SpriteComponent(
      sprite: Sprite(sheet, srcPosition: Vector2((source['x'] as num).toDouble(), (source['y'] as num).toDouble()), srcSize: Vector2((source['w'] as num).toDouble(), (source['h'] as num).toDouble())),
      position: Vector2(size.x + 30, size.y * (.62 + math.Random().nextDouble() * .17)),
      size: Vector2(34, 34), priority: 4,
    );
    add(sprite);
    _pickups.add(_WorldPickup(sprite));
  }
}

class _MovingTarget {
  _MovingTarget(this.sprite, this.speed, this.hp, {this.isBoss = false});
  final PositionComponent sprite;
  final double speed;
  final bool isBoss;
  int hp;
}

class _WorldPickup {
  _WorldPickup(this.sprite);
  final SpriteComponent sprite;
}
