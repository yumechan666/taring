import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flame/game.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../skin_preview.dart';
import 'game_icons.dart';
import 'simulation.dart';
import 'taring_game.dart';

class JourneyScreen extends StatefulWidget {
  const JourneyScreen({
    super.key,
    required this.game,
    required this.onExit,
    required this.onSettings,
  });
  final TaringGame game;
  final VoidCallback onExit;
  final void Function(int skin, int area, bool muted) onSettings;
  @override
  State<JourneyScreen> createState() => _JourneyScreenState();
}

class _JourneyScreenState extends State<JourneyScreen>
    with WidgetsBindingObserver {
  final FocusNode focus = FocusNode();
  String panel = '';
  TaringGame get game => widget.game;
  static final keys = {
    LogicalKeyboardKey.arrowLeft: 'left',
    LogicalKeyboardKey.keyA: 'left',
    LogicalKeyboardKey.arrowRight: 'right',
    LogicalKeyboardKey.keyD: 'right',
    LogicalKeyboardKey.arrowDown: 'down',
    LogicalKeyboardKey.keyS: 'down',
    LogicalKeyboardKey.arrowUp: 'up',
    LogicalKeyboardKey.keyW: 'up',
    LogicalKeyboardKey.space: 'jump',
    LogicalKeyboardKey.keyZ: 'jump',
    LogicalKeyboardKey.keyJ: 'attack',
    LogicalKeyboardKey.keyX: 'attack',
    LogicalKeyboardKey.enter: 'attack',
    LogicalKeyboardKey.keyK: 'skill',
    LogicalKeyboardKey.keyC: 'skill',
    LogicalKeyboardKey.keyL: 'transform',
    LogicalKeyboardKey.keyV: 'transform',
    LogicalKeyboardKey.shiftLeft: 'transform',
    LogicalKeyboardKey.shiftRight: 'transform',
    LogicalKeyboardKey.keyU: 'ulti',
    LogicalKeyboardKey.keyB: 'ulti',
  };
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) focus.requestFocus();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    focus.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed && game.simulation != null) {
      game.setPaused(true);
    }
  }

  void pause() {
    if (game.simulation != null && !game.loading) {
      setState(() => panel = '');
      game.setPaused(!game.session.paused);
    }
  }

  KeyEventResult onKey(FocusNode node, KeyEvent event) {
    if (event is KeyRepeatEvent) return KeyEventResult.handled;
    if (event.logicalKey == LogicalKeyboardKey.escape ||
        event.logicalKey == LogicalKeyboardKey.keyP) {
      if (event is KeyDownEvent) pause();
      return KeyEventResult.handled;
    }
    final action = keys[event.logicalKey];
    if (action == null) return KeyEventResult.ignored;
    if (event is KeyDownEvent) {
      game.simulation?.press(action);
    } else if (event is KeyUpEvent) {
      game.simulation?.release(action);
    }
    return KeyEventResult.handled;
  }

  void settings() => widget.onSettings(game.skin, game.area, game.muted);
  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop) pause();
    },
    child: Focus(
      focusNode: focus,
      autofocus: true,
      onKeyEvent: onKey,
      onFocusChange: (focused) {
        if (!focused) game.simulation?.clearInput();
      },
      child: Listener(
        onPointerDown: (_) => focus.requestFocus(),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Positioned.fill(
              child: RepaintBoundary(
                child: GameWidget<TaringGame>(
                  game: game,
                  loadingBuilder: (_) => const ColoredBox(
                    color: Color(0xff10131c),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircularProgressIndicator(),
                          SizedBox(height: 16),
                          Text('Bulan terbit…'),
                        ],
                      ),
                    ),
                  ),
                  errorBuilder: (_, error) => Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('Game gagal dimuat: $error'),
                        TextButton(
                          onPressed: widget.onExit,
                          child: const Text('Kembali ke menu'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            ValueListenableBuilder<int>(
              valueListenable: game.revision,
              builder: (_, value, child) {
                final s = game.simulation;
                if (s == null || !game.isLoaded) return const SizedBox.shrink();
                return LayoutBuilder(
                  builder: (_, box) {
                    final unit = math.min(box.maxWidth, box.maxHeight),
                        button = (unit * .13).clamp(38.0, 62.0);
                    final p = s.player;
                    return Stack(
                      children: [
                        Positioned(
                          top: 12,
                          left: 14,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  for (var i = 0; i < p.maxHp; i++)
                                    Icon(
                                      i < p.hp
                                          ? Icons.favorite
                                          : Icons.favorite_border,
                                      size: (unit * .046).clamp(16, 26),
                                      color: i < p.hp
                                          ? const Color(0xffe76471)
                                          : const Color(0xff6a6174),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 5),
                              SizedBox(
                                width: (unit * .34).clamp(110, 200),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.dark_mode,
                                      size: 24,
                                      color: Color(0xffbfdcff),
                                    ),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: LinearProgressIndicator(
                                        value: p.eclipse > 0
                                            ? p.eclipse /
                                                  (s.tweak('ultiDuration') *
                                                      number(
                                                        s.buffs['eclipseMult'],
                                                        1,
                                                      ))
                                            : p.ulti / 100,
                                        minHeight: 8,
                                        color: const Color(0xff8fc1ff),
                                        backgroundColor: const Color(
                                          0xcc101428,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        Positioned(
                          top: 10,
                          right: 12,
                          child: Row(
                            children: [
                              _badge('✧ ${s.shards}'),
                              const SizedBox(width: 10),
                              IconButton.filledTonal(
                                tooltip: 'Jeda (P / Esc)',
                                onPressed: pause,
                                icon: const Icon(Icons.pause),
                              ),
                            ],
                          ),
                        ),
                        if (s.boss?.active == true && s.boss?.dead == false)
                          Positioned(
                            top: 14,
                            left: box.maxWidth * .3,
                            right: box.maxWidth * .3,
                            child: Column(
                              children: [
                                Text(
                                  s.areaDefinition['boss'],
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(fontSize: 11),
                                ),
                                const SizedBox(height: 4),
                                LinearProgressIndicator(
                                  value: s.boss!.hp / s.boss!.maxHp,
                                  color: const Color(0xffc23a3a),
                                  backgroundColor: Colors.black54,
                                ),
                              ],
                            ),
                          ),
                        if (s.combo > 1)
                          Positioned(
                            top: 75,
                            right: 20,
                            child: Text(
                              '${s.combo} combo',
                              style: const TextStyle(
                                color: Color(0xffffd27d),
                                fontWeight: FontWeight.bold,
                                fontSize: 23,
                              ),
                            ),
                          ),
                        if (s.toastTime > 0)
                          Positioned(
                            top: box.maxHeight * .21,
                            left: box.maxWidth * .15,
                            right: box.maxWidth * .15,
                            child: IgnorePointer(
                              child: Center(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.black54,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    s.toast,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: Color(0xffe8e5dc),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        if (!s.paused && !s.over && !game.loading) ...[
                          Positioned(
                            left: 20,
                            bottom: 16,
                            child: MoonStick(size: button * 2.7, simulation: s),
                          ),
                          Positioned(
                            right: 20,
                            bottom: 16,
                            child: SizedBox(
                              width: button * 3.5,
                              height: button * 2.5,
                              child: Stack(
                                children: [
                                  Positioned(
                                    left: 0,
                                    top: 0,
                                    child: control(
                                      'skill',
                                      'Skill',
                                      'K',
                                      p.form == 'human'
                                          ? 'hook'
                                          : p.form == 'wolf'
                                          ? (s
                                                    .objects('altars')
                                                    .any(
                                                      (a) =>
                                                          (number(a['x']) - p.x)
                                                                  .abs() <
                                                              1.1 &&
                                                          (number(a['y']) - p.y)
                                                                  .abs() <
                                                              .7,
                                                    )
                                                ? 'howl'
                                                : 'pounce')
                                          : 'slam',
                                      button,
                                      color: const Color(0xff8ee7e3),
                                    ),
                                  ),
                                  Positioned(
                                    left: button * 1.2,
                                    top: 0,
                                    child: control(
                                      'transform',
                                      'Ubah wujud',
                                      'L',
                                      p.form == 'human' ? 'wolf' : 'hood',
                                      button,
                                      color: const Color(0xffd5b2ff),
                                    ),
                                  ),
                                  Positioned(
                                    left: button * 2.4,
                                    top: 0,
                                    child: control(
                                      'ulti',
                                      'Ulti Eclipse',
                                      'U',
                                      'eclipse',
                                      button,
                                      enabled: p.ulti >= 100,
                                      ready: p.ulti >= 100,
                                      progress: p.eclipse > 0
                                          ? p.eclipse /
                                                (s.tweak('ultiDuration') *
                                                    number(
                                                      s.buffs['eclipseMult'],
                                                      1,
                                                    ))
                                          : p.ulti / 100,
                                      color: const Color(0xffffd27d),
                                    ),
                                  ),
                                  Positioned(
                                    left: button * 1.1,
                                    bottom: 0,
                                    child: control(
                                      'attack',
                                      'Attack',
                                      'J',
                                      p.form == 'human' ? 'sickle' : 'claw',
                                      button * 1.18,
                                      color: const Color(0xffffb7a8),
                                    ),
                                  ),
                                  Positioned(
                                    right: 0,
                                    bottom: 0,
                                    child: control(
                                      'jump',
                                      'Lompat',
                                      'SPACE',
                                      'jump',
                                      button * 1.12,
                                      color: const Color(0xff9cddff),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                        if (s.paused || s.over || game.loading)
                          Positioned.fill(
                            child: ColoredBox(
                              color: const Color(0xb8050710),
                              child: Center(
                                child: ConstrainedBox(
                                  constraints: const BoxConstraints(
                                    maxWidth: 480,
                                  ),
                                  child: SingleChildScrollView(
                                    padding: const EdgeInsets.all(18),
                                    child: overlay(s),
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    ),
  );
  Widget _badge(String value) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
    decoration: BoxDecoration(
      color: const Color(0xcc101428),
      borderRadius: BorderRadius.circular(9),
      border: Border.all(color: const Color(0x667d98ba)),
    ),
    child: Text(
      value,
      style: const TextStyle(
        color: Color(0xffffd27d),
        fontWeight: FontWeight.bold,
      ),
    ),
  );
  Widget control(
    String action,
    String label,
    String shortcut,
    String iconName,
    double size, {
    Color color = const Color(0xffcfe4ff),
    bool enabled = true,
    double? progress,
    bool ready = false,
  }) => HoldControl(
    key: ValueKey(action),
    label: label,
    shortcut: shortcut,
    iconName: iconName,
    size: size,
    color: color,
    enabled: enabled,
    progress: progress,
    ready: ready,
    onDown: () => game.session.press(action),
    onUp: () => game.session.release(action),
  );
  Widget menuButton(String text, VoidCallback action) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: SizedBox(
      width: double.infinity,
      child: _tile(text, Icons.chevron_right_rounded, action),
    ),
  );
  Widget overlay(JourneySimulation s) {
    if (game.loading) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 12),
          Text('Bulan terbit…'),
        ],
      );
    }
    if (game.loadError != null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(game.loadError!),
          menuButton('Coba lagi', () => game.change()),
          menuButton('Menu utama', widget.onExit),
        ],
      );
    }
    if (panel == 'map') {
      return _panel(const Color(0xff9fd0ff), [
        _crest(const Color(0xff9fd0ff), 'eclipse'),
        const SizedBox(height: 10),
        const Text(
          'PETA PERJALANAN',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            letterSpacing: 2.5,
          ),
        ),
        const SizedBox(height: 6),
        for (final a in s.reference['areas'] as List)
          menuButton(a['name'], () async {
            setState(() => panel = '');
            await game.change(nextArea: a['id']);
            settings();
          }),
        menuButton('Kembali', () => setState(() => panel = '')),
        const SizedBox(height: 8),
      ]);
    }
    if (panel == 'skins') {
      return _panel(const Color(0xffd5b2ff), [
        _crest(const Color(0xffd5b2ff), 'hood'),
        const SizedBox(height: 10),
        const Text(
          'LEMARI SKIN',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            letterSpacing: 2.5,
          ),
        ),
        const SizedBox(height: 6),
        for (final skin in s.reference['skins'] as List)
          Card(
            child: ListTile(
              leading: SkinPreview(
                file: skin['id'] == 1
                    ? 'hero_human_move-transparent.webp'
                    : 'skin${skin['id']}_human_move-transparent.webp',
              ),
              title: Text(skin['name']),
              subtitle: Text(
                (skin['buffs'] as List).join(' • '),
                style: const TextStyle(fontSize: 11),
              ),
              trailing: Icon(
                skin['id'] == game.skin
                    ? Icons.check_circle
                    : Icons.chevron_right,
              ),
              onTap: () async {
                setState(() => panel = '');
                await game.change(nextSkin: skin['id']);
                settings();
              },
            ),
          ),
        menuButton('Kembali', () => setState(() => panel = '')),
        const SizedBox(height: 8),
      ]);
    }
    final dead = s.player.dead;
    final accent = s.won
        ? const Color(0xffffd27d)
        : dead
        ? const Color(0xffff8a8a)
        : const Color(0xff9fd0ff);
    final tiles = <Widget>[
      _tile(
        'Peta Perjalanan',
        Icons.map_outlined,
        () => setState(() => panel = 'map'),
      ),
      _tile(
        'Lemari Skin',
        Icons.checkroom_outlined,
        () => setState(() => panel = 'skins'),
      ),
      if (!s.won)
        _tile('Dari checkpoint', Icons.flag_outlined, game.retryCheckpoint),
      _tile('Mulai dari awal', Icons.restart_alt, game.restart),
      _tile('Tanpa Akhir', Icons.all_inclusive, () async {
        await game.change(nextArea: 0, endless: true);
        settings();
      }),
      _tile(
        game.muted ? 'Suara mati' : 'Suara nyala',
        game.muted ? Icons.volume_off_outlined : Icons.volume_up_outlined,
        () {
          game.setMuted(!game.muted);
          settings();
          setState(() {});
        },
      ),
    ];
    return _panel(accent, [
      _crest(accent, dead ? 'wolf' : 'eclipse'),
      const SizedBox(height: 12),
      ShaderMask(
        shaderCallback: (r) => LinearGradient(
          colors: [Colors.white, accent],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ).createShader(r),
        child: Text(
          (s.won
                  ? 'Bulan Terbebas'
                  : dead
                  ? 'Perjalanan Terhenti'
                  : 'Jeda')
              .toUpperCase(),
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            letterSpacing: 3,
            color: Colors.white,
          ),
        ),
      ),
      const SizedBox(height: 4),
      Text(
        s.endless ? 'Perjalanan Tanpa Akhir' : '${s.areaDefinition['name']}',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 12,
          letterSpacing: 1.2,
          color: Colors.white.withValues(alpha: .6),
        ),
      ),
      const SizedBox(height: 14),
      Wrap(
        alignment: WrapAlignment.center,
        spacing: 8,
        runSpacing: 8,
        children: [
          _chip(Icons.star_rounded, 'Skor', '${s.score}', accent),
          _chip(Icons.shield_moon_outlined, 'Musuh', '${s.kills}', accent),
          _chip(Icons.diamond_outlined, 'Pecahan', '${s.shards}', accent),
          if (s.over) ...[
            _chip(Icons.bolt, 'Combo', '${s.bestCombo}', accent),
            _chip(Icons.timer_outlined, 'Waktu', '${s.time.floor()}s', accent),
          ],
        ],
      ),
      const SizedBox(height: 16),
      if (!s.over)
        _primary(
          'Lanjut',
          Icons.play_arrow_rounded,
          () => game.setPaused(false),
        ),
      if (s.won && game.area < 10)
        _primary('Area berikutnya', Icons.arrow_forward_rounded, () async {
          await game.change(nextArea: game.area + 1);
          settings();
        }),
      const SizedBox(height: 10),
      for (var i = 0; i < tiles.length; i += 2)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            children: [
              Expanded(child: tiles[i]),
              const SizedBox(width: 8),
              Expanded(
                child: i + 1 < tiles.length ? tiles[i + 1] : const SizedBox(),
              ),
            ],
          ),
        ),
      TextButton.icon(
        onPressed: widget.onExit,
        icon: const Icon(Icons.home_outlined, size: 18),
        label: const Text('Menu utama'),
        style: TextButton.styleFrom(
          foregroundColor: Colors.white.withValues(alpha: .65),
        ),
      ),
    ]);
  }

  /// Glass card that eases in. Shared by the pause, map and wardrobe screens.
  Widget _panel(Color accent, List<Widget> children) =>
      TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
        builder: (_, v, child) => Opacity(
          opacity: v,
          child: Transform.translate(
            offset: Offset(0, (1 - v) * 14),
            child: Transform.scale(scale: .95 + .05 * v, child: child),
          ),
        ),
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xf51a2748), Color(0xf70a0f20)],
            ),
            border: Border.all(
              color: accent.withValues(alpha: .45),
              width: 1.4,
            ),
            boxShadow: [
              BoxShadow(
                color: accent.withValues(alpha: .2),
                blurRadius: 44,
                spreadRadius: 2,
              ),
              BoxShadow(
                color: Colors.black.withValues(alpha: .6),
                blurRadius: 30,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: children),
        ),
      );

  /// A glowing medallion with a moon-line icon at the top of a panel.
  Widget _crest(Color accent, String icon) => Container(
    width: 64,
    height: 64,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      gradient: RadialGradient(
        center: const Alignment(-.3, -.4),
        colors: [accent.withValues(alpha: .35), const Color(0xff0b1022)],
      ),
      border: Border.all(color: accent.withValues(alpha: .8), width: 1.6),
      boxShadow: [
        BoxShadow(color: accent.withValues(alpha: .45), blurRadius: 26),
      ],
    ),
    child: Center(
      child: MoonIcon(
        icon,
        size: 30,
        color: Color.lerp(accent, Colors.white, .5)!,
      ),
    ),
  );

  Widget _chip(IconData icon, String label, String value, Color accent) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: .06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withValues(alpha: .1)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: accent),
            const SizedBox(width: 6),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: .8,
                    color: Colors.white.withValues(alpha: .55),
                    height: 1,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    height: 1,
                  ),
                ),
              ],
            ),
          ],
        ),
      );

  /// The main call to action: a lit gold button.
  Widget _primary(String label, IconData icon, VoidCallback onTap) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          height: 52,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: const LinearGradient(
              colors: [Color(0xffffe39a), Color(0xffe9a23a)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
            boxShadow: const [
              BoxShadow(color: Color(0x66ffc34d), blurRadius: 20),
              BoxShadow(
                color: Color(0x88000000),
                blurRadius: 8,
                offset: Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: const Color(0xff2a1a05), size: 26),
              const SizedBox(width: 8),
              Text(
                label.toUpperCase(),
                style: const TextStyle(
                  color: Color(0xff2a1a05),
                  fontWeight: FontWeight.w900,
                  letterSpacing: 2,
                  fontSize: 15,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );

  /// A glass tile with an icon, used for the secondary actions.
  Widget _tile(String label, IconData icon, VoidCallback onTap) => Material(
    color: Colors.transparent,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Ink(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: Colors.white.withValues(alpha: .06),
          border: Border.all(color: const Color(0x338fc1ff)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 20, color: const Color(0xffa9cdf5)),
            const SizedBox(width: 9),
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: Color(0xffe6efff),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// A round touch button: glass disc, glowing gradient rim, optional charge
/// ring (Eclipse energy), a breathing glow when ready, and a ripple on press.
class HoldControl extends StatefulWidget {
  const HoldControl({
    super.key,
    required this.label,
    required this.shortcut,
    required this.iconName,
    required this.size,
    required this.color,
    required this.onDown,
    required this.onUp,
    this.enabled = true,
    this.progress,
    this.ready = false,
  });
  final String label, shortcut, iconName;
  final double size;
  final Color color;
  final VoidCallback onDown, onUp;
  final bool enabled, ready;

  /// 0..1 charge ring around the button; null draws no ring.
  final double? progress;
  @override
  State<HoldControl> createState() => _HoldControlState();
}

class _HoldControlState extends State<HoldControl>
    with TickerProviderStateMixin {
  final Set<int> pointers = {};
  late final AnimationController pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );
  late final AnimationController ripple = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );

  @override
  void initState() {
    super.initState();
    _syncPulse();
  }

  @override
  void didUpdateWidget(HoldControl old) {
    super.didUpdateWidget(old);
    _syncPulse();
  }

  void _syncPulse() {
    if (widget.ready && widget.enabled) {
      if (!pulse.isAnimating) pulse.repeat(reverse: true);
    } else if (pulse.isAnimating) {
      pulse.stop();
    }
  }

  void up(int pointer) {
    if (pointers.remove(pointer) && pointers.isEmpty) {
      widget.onUp();
      setState(() {});
    }
  }

  @override
  void dispose() {
    if (pointers.isNotEmpty) widget.onUp();
    pulse.dispose();
    ripple.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pressed = pointers.isNotEmpty, size = widget.size;
    return Semantics(
      label: '${widget.label} (${widget.shortcut})',
      button: true,
      enabled: widget.enabled,
      child: ExcludeSemantics(
        child: Listener(
          behavior: HitTestBehavior.opaque,
          onPointerDown: (e) {
            if (!widget.enabled) return;
            if (pointers.add(e.pointer) && pointers.length == 1) {
              widget.onDown();
              ripple.forward(from: 0);
            }
            setState(() {});
          },
          onPointerUp: (e) => up(e.pointer),
          onPointerCancel: (e) => up(e.pointer),
          child: AnimatedScale(
            scale: pressed ? .92 : 1,
            duration: const Duration(milliseconds: 90),
            curve: Curves.easeOutCubic,
            child: AnimatedBuilder(
              animation: Listenable.merge([pulse, ripple]),
              builder: (context, _) => CustomPaint(
                size: Size.square(size),
                painter: _ButtonPainter(
                  color: widget.color,
                  enabled: widget.enabled,
                  pressed: pressed,
                  progress: widget.progress,
                  ready: widget.ready && widget.enabled,
                  pulse: pulse.value,
                  ripple: ripple.isAnimating ? ripple.value : 1,
                ),
                child: SizedBox.square(
                  dimension: size,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Stack(
                        alignment: Alignment.center,
                        children: [
                          if (widget.enabled)
                            ImageFiltered(
                              imageFilter: ui.ImageFilter.blur(
                                sigmaX: size * .05,
                                sigmaY: size * .05,
                              ),
                              child: MoonIcon(
                                widget.iconName,
                                size: size * .4,
                                color: widget.color.withValues(
                                  alpha: pressed ? 1 : .75,
                                ),
                              ),
                            ),
                          MoonIcon(
                            widget.iconName,
                            size: size * .4,
                            color: widget.enabled
                                ? Color.lerp(widget.color, Colors.white, .35)!
                                : widget.color.withValues(alpha: .3),
                          ),
                        ],
                      ),
                      SizedBox(height: size * .02),
                      Text(
                        widget.shortcut,
                        maxLines: 1,
                        style: TextStyle(
                          color: Colors.white.withValues(
                            alpha: widget.enabled ? .78 : .3,
                          ),
                          fontSize: (size * .15).clamp(7.0, 10.0),
                          fontWeight: FontWeight.w900,
                          letterSpacing: .8,
                          height: 1,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ButtonPainter extends CustomPainter {
  _ButtonPainter({
    required this.color,
    required this.enabled,
    required this.pressed,
    required this.progress,
    required this.ready,
    required this.pulse,
    required this.ripple,
  });
  final Color color;
  final bool enabled, pressed, ready;
  final double? progress;
  final double pulse, ripple;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero), r = size.width / 2;
    final disc = r * .9;
    // Soft drop shadow, then a coloured halo that breathes when ready.
    canvas.drawCircle(
      c + Offset(0, r * .08),
      disc,
      Paint()
        ..color = const Color(0x99000000)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, r * .22),
    );
    if (enabled) {
      final halo = pressed ? .55 : (ready ? .22 + pulse * .38 : .14);
      canvas.drawCircle(
        c,
        disc * (1 + (ready ? pulse * .08 : 0)),
        Paint()
          ..color = color.withValues(alpha: halo)
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, r * .3),
      );
    }
    // Glass body.
    final rect = Rect.fromCircle(center: c, radius: disc);
    canvas.drawCircle(
      c,
      disc,
      Paint()
        ..shader = ui.Gradient.radial(
          c + Offset(-disc * .35, -disc * .45),
          disc * 1.5,
          enabled
              ? [
                  Color.lerp(
                    const Color(0xff2b4268),
                    color,
                    pressed ? .5 : .12,
                  )!,
                  const Color(0xff101a30),
                  const Color(0xff060a14),
                ]
              : const [Color(0xff2a303c), Color(0xff161b26), Color(0xff0b0e16)],
          const [0, .55, 1],
        ),
    );
    // Specular highlight on the upper-left, like polished glass.
    canvas.drawOval(
      Rect.fromCenter(
        center: c + Offset(-disc * .18, -disc * .52),
        width: disc * 1.0,
        height: disc * .5,
      ),
      Paint()
        ..shader = ui.Gradient.linear(
          c + Offset(0, -disc * .8),
          c + Offset(0, -disc * .25),
          [
            Colors.white.withValues(alpha: enabled ? .2 : .06),
            Colors.transparent,
          ],
        ),
    );
    // Inner hairline ring.
    canvas.drawCircle(
      c,
      disc * .8,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = Colors.white.withValues(alpha: .08),
    );
    // Bright gradient rim: light from the top-left, ember at the bottom-right.
    canvas.drawCircle(
      c,
      disc,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = pressed ? 3 : 2.2
        ..shader = SweepGradient(
          transform: const GradientRotation(-math.pi * .75),
          colors: enabled
              ? [
                  Color.lerp(color, Colors.white, .7)!,
                  color.withValues(alpha: .85),
                  color.withValues(alpha: .2),
                  color.withValues(alpha: .55),
                  Color.lerp(color, Colors.white, .7)!,
                ]
              : const [
                  Color(0x44ffffff),
                  Color(0x22ffffff),
                  Color(0x11ffffff),
                  Color(0x22ffffff),
                  Color(0x44ffffff),
                ],
        ).createShader(rect),
    );
    // Charge ring (Eclipse energy), outside the rim.
    if (progress != null) {
      final ring = Rect.fromCircle(center: c, radius: r * .97);
      final fraction = progress!.clamp(0.0, 1.0);
      canvas.drawArc(
        ring,
        0,
        math.pi * 2,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = r * .07
          ..color = Colors.white.withValues(alpha: .1),
      );
      if (fraction > 0) {
        canvas.drawArc(
          ring,
          -math.pi / 2,
          math.pi * 2 * fraction,
          false,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = r * .12
            ..color = color.withValues(alpha: .35)
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, r * .06),
        );
        canvas.drawArc(
          ring,
          -math.pi / 2,
          math.pi * 2 * fraction,
          false,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = r * .07
            ..strokeCap = StrokeCap.round
            ..color = Color.lerp(color, Colors.white, ready ? .35 : 0)!,
        );
      }
    }
    // Press ripple expanding past the rim.
    if (ripple < 1) {
      canvas.drawCircle(
        c,
        disc * (1 + ripple * .35),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5 * (1 - ripple)
          ..color = color.withValues(alpha: (1 - ripple) * .8),
      );
    }
  }

  @override
  bool shouldRepaint(_ButtonPainter old) =>
      old.color != color ||
      old.enabled != enabled ||
      old.pressed != pressed ||
      old.progress != progress ||
      old.ready != ready ||
      old.pulse != pulse ||
      old.ripple != ripple;
}

class MoonStick extends StatefulWidget {
  const MoonStick({super.key, required this.size, required this.simulation});
  final double size;
  final JourneySimulation simulation;
  @override
  State<MoonStick> createState() => _MoonStickState();
}

class _MoonStickState extends State<MoonStick> {
  int? pointer;
  Offset knob = Offset.zero;
  void move(Offset position) {
    final delta = position - Offset(widget.size / 2, widget.size / 2),
        r = widget.size * .3;
    knob = delta.distance > r ? delta / delta.distance * r : delta;
    final flags = {
      'left': delta.dx < -widget.size * .12,
      'right': delta.dx > widget.size * .12,
      'down': delta.dy > widget.size * .2,
      'up': delta.dy < -widget.size * .2,
    };
    for (final f in flags.entries) {
      if (f.value) {
        widget.simulation.press(f.key);
      } else {
        widget.simulation.release(f.key);
      }
    }
    setState(() {});
  }

  void reset() {
    pointer = null;
    knob = Offset.zero;
    for (final k in ['left', 'right', 'down', 'up']) {
      widget.simulation.release(k);
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    for (final k in ['left', 'right', 'down', 'up']) {
      widget.simulation.release(k);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Joystick',
    child: Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (e) {
        if (pointer == null) {
          pointer = e.pointer;
          move(e.localPosition);
        }
      },
      onPointerMove: (e) {
        if (pointer == e.pointer) move(e.localPosition);
      },
      onPointerUp: (e) {
        if (pointer == e.pointer) reset();
      },
      onPointerCancel: (e) {
        if (pointer == e.pointer) reset();
      },
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const RadialGradient(
            center: Alignment(-.38, -.42),
            radius: 1.25,
            colors: [Color(0xdd30496d), Color(0xee10182a), Color(0xf0060b17)],
            stops: [0, .55, 1],
          ),
          border: Border.all(color: const Color(0x998fc1ff), width: 2),
          boxShadow: const [
            BoxShadow(
              color: Color(0x77000000),
              blurRadius: 18,
              offset: Offset(0, 6),
            ),
            BoxShadow(
              color: Color(0x338fc1ff),
              blurRadius: 16,
              spreadRadius: 1,
            ),
          ],
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.all(widget.size * .12),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0x338fc1ff)),
                  ),
                ),
              ),
            ),
            for (final arrow in [
              ('left', const Alignment(-.76, 0), knob.dx < -widget.size * .06),
              ('right', const Alignment(.76, 0), knob.dx > widget.size * .06),
              ('jump', const Alignment(0, -.76), knob.dy < -widget.size * .09),
              ('down', const Alignment(0, .76), knob.dy > widget.size * .09),
            ])
              Align(
                alignment: arrow.$2,
                child: AnimatedOpacity(
                  opacity: arrow.$3 ? 1 : .55,
                  duration: const Duration(milliseconds: 80),
                  child: MoonIcon(
                    arrow.$1,
                    size: widget.size * (arrow.$3 ? .15 : .12),
                    color: arrow.$3
                        ? const Color(0xffffffff)
                        : const Color(0xffa9c6ef),
                  ),
                ),
              ),
            Transform.translate(
              offset: knob,
              child: Container(
                width: widget.size * .44,
                height: widget.size * .44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const RadialGradient(
                    center: Alignment(-.4, -.5),
                    radius: 1.1,
                    colors: [
                      Color(0xffa8c8f2),
                      Color(0xff3c5a86),
                      Color(0xff111a2d),
                    ],
                    stops: [0, .55, 1],
                  ),
                  border: Border.all(
                    color: pointer == null
                        ? const Color(0xffc4e0ff)
                        : const Color(0xffffffff),
                    width: 2,
                  ),
                  boxShadow: [
                    const BoxShadow(
                      color: Color(0x99000000),
                      blurRadius: 10,
                      offset: Offset(0, 4),
                    ),
                    BoxShadow(
                      color: Color(pointer == null ? 0x558fc1ff : 0xaa8fc1ff),
                      blurRadius: pointer == null ? 12 : 22,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
