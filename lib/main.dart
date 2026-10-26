import 'dart:convert';

import 'game/taring_game.dart';
import 'game/game_screen.dart';
import 'package:flutter/material.dart';

import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'menu_music.dart';

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

  final MenuMusic _music = MenuMusic();
  final bool _openingGame = false;
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
    await prefs.setString(
      _saveKey,
      jsonEncode({
        'version': 1,
        'bestScore': _bestScore,
        'muted': _muted,
        'skin': _selectedSkin,
        'theme': _selectedTheme,
      }),
    );
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
    _lockLandscapeFullscreen();
    setState(() {
      _playing = true;
      _game = TaringGame(
        muted: _muted,
        skin: _selectedSkin + 1,
        area: _selectedTheme <= 1 ? 0 : _selectedTheme - 1,
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
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Reset'),
          ),
        ],
      ),
    );
    if (ok == true && mounted) {
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
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _music.setWanted(wantMusic),
      );
    }
    return Scaffold(
      body: Listener(
        // Browsers only allow audio after a gesture, so the first tap starts it.
        onPointerDown: (_) => _music.nudge(),
        child: SafeArea(child: _playing ? _buildGame() : _buildMenu()),
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
        Positioned.fill(
          child: Image.asset(
            'assets/images/sky_bg.webp',
            fit: BoxFit.cover,
            opacity: const AlwaysStoppedAnimation(.28),
          ),
        ),
        const Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                radius: 1.05,
                colors: [Color(0x00000000), Color(0xcc03040a)],
                stops: [.5, 1],
              ),
            ),
          ),
        ),
        LayoutBuilder(
          builder: (context, box) {
            final wide = box.maxWidth > 720 && box.maxWidth > box.maxHeight;
            final header = _menuHeader(compact: wide && box.maxHeight < 480);
            final content = wide
                ? Row(
                    children: [
                      Expanded(
                        flex: 5,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            header,
                            SizedBox(height: box.maxHeight < 480 ? 14 : 20),
                            _menuActions(),
                          ],
                        ),
                      ),
                      const SizedBox(width: 28),
                      Expanded(flex: 6, child: _selectionPanel()),
                    ],
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      header,
                      const SizedBox(height: 20),
                      _selectionPanel(),
                      const SizedBox(height: 20),
                      _menuActions(),
                    ],
                  );
            return Center(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(20, wide ? 20 : 60, 20, 24),
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: wide ? 1000 : 520),
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: 1),
                    duration: const Duration(milliseconds: 520),
                    curve: Curves.easeOutCubic,
                    builder: (context, t, child) => Opacity(
                      opacity: t,
                      child: Transform.translate(
                        offset: Offset(0, 18 * (1 - t)),
                        child: child,
                      ),
                    ),
                    child: content,
                  ),
                ),
              ),
            );
          },
        ),
        Positioned(
          top: 12,
          right: 12,
          child: IconButton.filledTonal(
            onPressed: () {
              setState(() => _muted = !_muted);
              _save();
            },
            icon: Icon(_muted ? Icons.volume_off : Icons.volume_up),
          ),
        ),
        if (_tutorialVisible) _tutorialOverlay(),
      ],
    ),
  );

  Widget _menuHeader({bool compact = false}) {
    final logo = compact ? 64.0 : 120.0;
    Widget rule() => Container(
      width: 44,
      height: 1.5,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0x00ffd27d), _gold, Color(0x00ffd27d)],
        ),
      ),
    );
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: logo + (compact ? 20 : 44),
          height: logo + (compact ? 20 : 44),
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [Color(0x55ffd27d), Color(0x1affd27d), Color(0x00ffd27d)],
              stops: [0, .6, 1],
            ),
          ),
          child: Image.asset(
            'assets/images/logo.png',
            width: logo,
            height: logo,
            fit: BoxFit.contain,
          ),
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
              shadows: const [
                Shadow(
                  color: Color(0x99000000),
                  blurRadius: 14,
                  offset: Offset(0, 3),
                ),
              ],
            ),
          ),
        ),
        SizedBox(height: compact ? 4 : 8),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            rule(),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Icon(Icons.nightlight_round, size: 14, color: _gold),
            ),
            rule(),
          ],
        ),
        SizedBox(height: compact ? 8 : 12),
        _bestScorePill(),
      ],
    );
  }

  Widget _bestScorePill() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
    decoration: BoxDecoration(
      color: const Color(0x66000000),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: const Color(0x55ffd27d)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.emoji_events_rounded, size: 18, color: _gold),
        const SizedBox(width: 8),
        Text(
          'Skor terbaik: $_bestScore',
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    ),
  );

  Widget _menuActions() => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      _playButton(),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: _menuButton(
              'Tutorial',
              Icons.menu_book_rounded,
              () => setState(() => _tutorialVisible = true),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _menuButton(
              'Reset',
              Icons.restart_alt_rounded,
              _resetProgress,
            ),
          ),
        ],
      ),
    ],
  );

  Widget _playButton() {
    final enabled = !_openingGame;
    return Container(
      height: 64,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          colors: enabled
              ? const [Color(0xffd2484f), Color(0xff8e2238)]
              : const [Color(0xff5a2a33), Color(0xff3c1c26)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        border: Border.all(color: const Color(0xccffd27d), width: 1.5),
        boxShadow: enabled
            ? const [
                BoxShadow(
                  color: Color(0x66d2484f),
                  blurRadius: 22,
                  offset: Offset(0, 6),
                ),
              ]
            : const [],
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: enabled ? _beginRun : null,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                enabled
                    ? Icons.play_arrow_rounded
                    : Icons.hourglass_top_rounded,
                size: 30,
                color: Colors.white,
              ),
              const SizedBox(width: 10),
              Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    enabled ? 'Mulai Perjalanan' : 'Membuka game…',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      letterSpacing: .6,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _menuButton(String label, IconData icon, VoidCallback? onPressed) =>
      SizedBox(
        height: 50,
        child: OutlinedButton.icon(
          onPressed: onPressed,
          icon: Icon(icon, size: 20),
          label: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.white,
            backgroundColor: const Color(0x99161c33),
            side: const BorderSide(color: Color(0x33ffffff)),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
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
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        _sectionLabel(
          Icons.landscape_rounded,
          'PILIH TEMA',
          _themes[_selectedTheme].$1,
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 76,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _themes.length,
            separatorBuilder: (context, index) => const SizedBox(width: 8),
            itemBuilder: (context, index) => _choiceChip(
              selected: _selectedTheme == index,
              onTap: () {
                setState(() => _selectedTheme = index);
                _save();
              },
              leading: ClipRRect(
                borderRadius: BorderRadius.circular(9),
                child: Image.asset(
                  'assets/images/${_themes[index].$2}',
                  width: 52,
                  height: 60,
                  fit: BoxFit.cover,
                ),
              ),
              label: _themes[index].$1,
            ),
          ),
        ),
        const SizedBox(height: 14),
        _sectionLabel(
          Icons.person_rounded,
          'PILIH SKIN',
          _skins[_selectedSkin].$1,
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 100,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _skins.length,
            separatorBuilder: (context, index) => const SizedBox(width: 8),
            itemBuilder: (context, index) => _choiceChip(
              selected: _selectedSkin == index,
              onTap: () {
                setState(() => _selectedSkin = index);
                _save();
              },
              leading: SkinPreview(file: _skins[index].$2),
              label: _skins[index].$1,
            ),
          ),
        ),
      ],
    ),
  );

  Widget _sectionLabel(IconData icon, String label, String value) => Row(
    children: [
      Icon(icon, size: 16, color: _gold),
      const SizedBox(width: 6),
      Text(
        label,
        style: TextStyle(
          color: Colors.white.withValues(alpha: .75),
          fontSize: 12,
          fontWeight: FontWeight.w800,
          letterSpacing: 1.4,
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Text(
          value,
          textAlign: TextAlign.end,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: _gold,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    ],
  );

  Widget _choiceChip({
    required bool selected,
    required VoidCallback onTap,
    required Widget leading,
    required String label,
  }) => GestureDetector(
    onTap: onTap,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      width: 150,
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: selected ? const Color(0xff2c2130) : const Color(0x66000000),
        border: Border.all(
          color: selected ? _gold : Colors.white24,
          width: selected ? 2 : 1,
        ),
        boxShadow: selected
            ? const [BoxShadow(color: Color(0x55ffd27d), blurRadius: 14)]
            : const [],
      ),
      child: Row(
        children: [
          leading,
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
                color: selected ? Colors.white : Colors.white70,
              ),
            ),
          ),
        ],
      ),
    ),
  );

  static const _tutorialTips = [
    (
      Icons.gamepad_rounded,
      'Joystick',
      'Sentuh joystick, atau bergerak dengan A/D dan tombol panah.',
    ),
    (
      Icons.south_rounded,
      'Turun',
      'Tarik ke bawah atau tekan S: merayap sebagai serigala atau turun dari platform.',
    ),
    (Icons.north_rounded, 'Lompat', 'Lewati jurang dan rintangan. Space / Z.'),
    (
      Icons.flash_on_rounded,
      'Serang',
      'Sabit saat manusia, cakar saat serigala. J / X / Enter.',
    ),
    (Icons.my_location_rounded, 'Skill', 'Tahan untuk memilih target. K / C.'),
    (
      Icons.pets_rounded,
      'Ubah wujud',
      'Berganti antara manusia dan serigala. L / V / Shift.',
    ),
    (
      Icons.nightlight_round,
      'Eclipse',
      'Aktif saat energi bulan penuh. U / B.',
    ),
    (
      Icons.pause_rounded,
      'Jeda',
      'P / Esc. Ganti skin, area, atau kembali ke menu.',
    ),
  ];

  /// Shown before every run and from the menu. "Lewati" always closes it, and
  /// closing it after "Mulai Perjalanan" starts the run.
  Widget _tutorialOverlay() => Positioned.fill(
    child: Container(
      color: const Color(0xe6030409),
      child: SafeArea(
        child: Stack(
          children: [
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: ConstrainedBox(
                  // Wide enough for three tip columns on landscape phones.
                  constraints: const BoxConstraints(maxWidth: 920),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xff1c2340), Color(0xff0d1022)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(
                        color: const Color(0x66ffd27d),
                        width: 1.5,
                      ),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x99000000),
                          blurRadius: 30,
                          offset: Offset(0, 12),
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.nightlight_round,
                              size: 26,
                              color: _gold,
                            ),
                            SizedBox(width: 10),
                            Flexible(
                              child: Text(
                                'Cara Bermain',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Kumpulkan pecahan bulan, kalahkan boss, dan bertahan hidup.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: .7),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          alignment: WrapAlignment.center,
                          children: [
                            for (final tip in _tutorialTips)
                              _tutorialTip(tip.$1, tip.$2, tip.$3),
                          ],
                        ),
                        const SizedBox(height: 18),
                        SizedBox(
                          width: 280,
                          height: 50,
                          child: FilledButton.icon(
                            onPressed: _closeTutorial,
                            icon: Icon(
                              _tutorialStartsRun
                                  ? Icons.play_arrow_rounded
                                  : Icons.check_rounded,
                            ),
                            label: Text(
                              _tutorialStartsRun
                                  ? 'Mengerti, mulai bermain'
                                  : 'Mengerti',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xffb83a48),
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
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
                label: const Text(
                  'Lewati',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white,
                  backgroundColor: const Color(0x66000000),
                  side: const BorderSide(color: Color(0x33ffffff)),
                  shape: const StadiumBorder(),
                ),
              ),
            ),
          ],
        ),
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
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xff262d4a),
            border: Border.all(color: const Color(0x66ffd27d)),
          ),
          child: Icon(icon, size: 20, color: _gold),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(
                body,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.white.withValues(alpha: .72),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _buildGame() => JourneyScreen(
    game: _game!,
    onExit: _returnToMenu,
    onSettings: (skin, area, muted) {
      setState(() {
        _selectedSkin = skin - 1;
        _selectedTheme = area == 0 ? 0 : area + 1;
        _muted = muted;
      });
      _save();
    },
  );
}
