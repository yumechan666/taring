import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flame/game.dart';
import 'package:flutter/material.dart';
import 'package:audioplayers/audioplayers.dart';
import '../data/game_data_access.dart';
import '../menu_music.dart';
import 'simulation.dart';

class TaringGame extends FlameGame {
  TaringGame({
    required this.area,
    required this.skin,
    required this.muted,
    required this.onScore,
    required this.onGameOver,
  });
  int area, skin;
  bool muted;
  final ValueChanged<int> onScore, onGameOver;
  final ValueNotifier<int> revision = ValueNotifier(0);
  JourneySimulation? simulation;
  final Map<String, ui.Image> pictures = {};
  final Map<String, Json> sheets = {};

  /// Assets a draw call asked for but could not find (debug audit).
  final Set<String> missing = {};
  late Json manifest, reference;
  double cameraX = 0, cameraY = 11, _hudClock = 0;
  int _lastScore = -1;
  bool _reported = false, _removed = false;
  final MenuMusic music = MenuMusic();
  // Effects play from prepared pools. Loading an mp3 on every hit made hurt,
  // hit and death sounds stall the game when they fired together.
  final Map<String, AudioPool> _pools = {};
  final Set<String> _building = {};
  final Map<String, int> _lastSfx = {};
  static const _hotSounds = [
    'hit',
    'hurt',
    'death',
    'jump',
    'attack',
    'land',
    'enemy_die',
    'deflect',
    'pickup',
    'orb',
    'transform',
    'arrow',
    'hook',
    'pounce',
    'slam',
    'low_hp',
  ];
  bool loading = false;
  String? loadError;
  double get tileSize => math.min(size.y / 11.5, size.x / 9.5);
  JourneySimulation get session => simulation!;

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    reference = gameJson('journey.json');
    manifest = gameJson('assets.json');
    simulation = JourneySimulation(reference, area: area, skin: skin)
      ..sound = playSound;
    await loadArt();
    snapCamera();
    if (!_removed) music.setWanted(!muted);
    unawaited(_warmSounds());
  }

  Future<void> loadArt() async {
    final keys = <String>{
      'SKY_BG',
      'PROPS_OBJECTS',
      'PROPS_WORLD',
      'FX_COMBAT',
      'FX_IMPACT',
      'FX_SPIRIT',
    };
    keys.addAll((session.level['tileKeys'] as List).cast<String>());
    keys.addAll((session.level['layerKeys'] as List).cast<String>());
    keys.addAll(session.enemies.map((e) => e.sheet));
    if (session.boss != null) keys.add(session.boss!.sheet);
    if (area == 0) keys.add('BOSS_WOLF');
    for (final role in [
      'HUMAN_MOVE',
      'HUMAN_COMBAT',
      'HUMAN_ACTION',
      'WOLF_MOVE',
      'WOLF_COMBAT',
      'WOLF_ACTION',
      'ECLIPSE',
    ]) {
      keys.add(skin == 1 ? 'HERO_$role' : 'SKIN${skin}_$role');
    }
    // Limit simultaneous atlas decodes on phones. Commit the complete skin
    // before resuming simulation, so no action can reference a missing sheet.
    for (final key in keys) {
      if (pictures.containsKey(key)) continue;
      final file = (manifest[key]['src'] as String).split('/').last;
      final picture = await images.load(file);
      if (_removed) return;
      pictures[key] = picture;
      if (key != 'SKY_BG' &&
          !key.contains('_LAYER') &&
          !key.startsWith('LAYER_')) {
        final path =
            (manifest[key]['framesSrc'] as String?)?.split('/').last ??
            file.replaceFirst(RegExp(r'\.(webp|png)$'), '.frames.json');
        final data = gameJson(path);
        final names = {
          for (final f in data['frames'] as List) f['name'] as String: f,
        };
        sheets[key] = {
          'names': names,
          'animations': {
            for (final a in data['animations'] as List? ?? [])
              a['name'] as String: [
                for (final f in a['frames'] as List)
                  names[f is String ? f : f['name']],
              ],
          },
        };
      }
    }
    for (final key in pictures.keys.where((k) => !keys.contains(k)).toList()) {
      final file = (manifest[key]['src'] as String).split('/').last;
      pictures.remove(key);
      sheets.remove(key);
      images.clear(file);
    }
  }

  Future<void> change({
    int? nextArea,
    int? nextSkin,
    bool endless = false,
  }) async {
    if (loading) return;
    loading = true;
    loadError = null;
    setPaused(true);
    revision.value++;
    try {
      if (nextArea != null) {
        area = nextArea;
        session.area = area;
        session.endless = endless;
        if (endless) session.endlessSeed = 1 + math.Random().nextInt(1000000);
        session.restart();
        session.paused = true;
        _reported = false;
      }
      if (nextSkin != null) {
        skin = nextSkin;
        session.equip(skin);
      }
      await loadArt();
      snapCamera();
      loading = false;
      setPaused(false);
    } catch (error) {
      loadError = 'Aset gagal dimuat: $error';
      loading = false;
    }
    if (!_removed) revision.value++;
  }

  void setPaused(bool value) {
    if (simulation == null) return;
    session.paused = value;
    session.accumulator = 0;
    session.clearInput();
    music.setWanted(!value && !muted && !session.over && !_removed);
    revision.value++;
  }

  void setMuted(bool value) {
    muted = value;
    music.setWanted(!muted && !session.paused && !session.over);
  }

  void retryCheckpoint() {
    session.respawn();
    _reported = false;
    snapCamera();
    setPaused(false);
  }

  void restart() {
    session.restart();
    _reported = false;
    snapCamera();
    setPaused(false);
  }

  Future<void> _buildPool(String name) async {
    if (_pools.containsKey(name) || !_building.add(name)) return;
    try {
      final pool = await AudioPool.createFromAsset(
        path: 'audio/$name.mp3',
        maxPlayers: 3,
      );
      if (_removed) {
        await pool.dispose();
      } else {
        _pools[name] = pool;
      }
    } catch (error) {
      debugPrint('Game audio $name: $error');
    } finally {
      _building.remove(name);
    }
  }

  /// Prepare the common effects one by one in the background after loading.
  Future<void> _warmSounds() async {
    for (final name in _hotSounds) {
      if (_removed || muted) return;
      await _buildPool(name);
    }
  }

  void playSound(String name) {
    if (muted || _removed) return;
    // Several hits can land in one frame; one voice per sound is enough.
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now - (_lastSfx[name] ?? 0) < 50) return;
    _lastSfx[name] = now;
    final pool = _pools[name];
    if (pool == null) {
      unawaited(_buildPool(name));
      return;
    }
    unawaited(
      pool
          .start(volume: .8)
          .then<void>(
            (_) {},
            onError: (Object error) => debugPrint('Game audio $name: $error'),
          ),
    );
  }

  void snapCamera() {
    if (simulation == null || tileSize <= 0) return;
    final target = cameraTarget();
    cameraX = target.dx;
    cameraY = target.dy;
  }

  Offset cameraTarget() {
    final t = math.max(.01, tileSize),
        hw = size.x / 2 / t,
        hh = size.y / 2 / t,
        p = session.player;
    return Offset(
      clamp(
        p.x + p.facing * session.tweak('cameraLookahead'),
        hw,
        math.max(hw, session.cols - hw),
      ),
      clamp(p.y - .12 * size.y / t, hh - 3, session.rows + 1.2 - hh),
    );
  }

  @override
  void onGameResize(Vector2 size) {
    super.onGameResize(size);
    snapCamera();
  }

  @override
  void update(double dt) {
    super.update(dt);
    if (simulation == null || loading) return;
    session.update(dt);
    if (!session.paused) {
      final target = cameraTarget();
      cameraX += (target.dx - cameraX) * math.min(1, dt * 4.5);
      cameraY += (target.dy - cameraY) * math.min(1, dt * 3.5);
    }
    if (session.score != _lastScore) {
      _lastScore = session.score;
      onScore(session.score);
    }
    if (session.over && !_reported) {
      _reported = true;
      music.setWanted(false);
      onGameOver(session.score);
    }
    _hudClock += dt;
    if (_hudClock >= .08) {
      _hudClock = 0;
      revision.value++;
    }
  }

  @override
  void onRemove() {
    _removed = true;
    music.dispose();
    for (final pool in _pools.values) {
      pool.dispose();
    }
    _pools.clear();
    super.onRemove();
  }

  double sx(double x) => (x - cameraX) * tileSize + size.x / 2;
  double sy(double y) => (y - cameraY) * tileSize + size.y / 2;
  Json? frame(
    String key,
    String animation, {
    double progress = -1,
    double time = 0,
    double fps = 8,
    bool reverse = false,
  }) {
    final list = sheets[key]?['animations'][animation] as List?;
    if (list == null || list.isEmpty) {
      missing.add('anim:$key/$animation');
      return null;
    }
    var i = progress >= 0
        ? math.min(list.length - 1, (progress * list.length).floor())
        : (time * fps).floor() % list.length;
    if (reverse) i = list.length - 1 - i;
    return list[i] as Json;
  }

  ui.Rect rect(Json value) => ui.Rect.fromLTWH(
    number(value['x']),
    number(value['y']),
    number(value['w']),
    number(value['h']),
  );
  void anchored(
    Canvas canvas,
    String key,
    Json? fr,
    double x,
    double y,
    double scale, {
    bool flip = false,
    double alpha = 1,
  }) {
    final image = pictures[key];
    if (image == null) missing.add('pic:$key');
    if (fr == null || image == null || alpha <= 0) return;
    final c = (fr['content'] ?? fr['source']) as Json;
    final anchor =
        fr['anchor'] as Json? ??
        {
          'x': number(c['x']) + number(c['w']) / 2,
          'y': number(c['y']) + number(c['h']),
        };
    _sprite.color = Colors.white.withValues(alpha: clamp(alpha, 0, 1));
    canvas.save();
    canvas.translate(x, y);
    if (flip) canvas.scale(-1, 1);
    canvas.drawImageRect(
      image,
      rect(c),
      Rect.fromLTWH(
        -(number(anchor['x']) - number(c['x'])) * scale,
        -(number(anchor['y']) - number(c['y'])) * scale,
        number(c['w']) * scale,
        number(c['h']) * scale,
      ),
      _sprite,
    );
    canvas.restore();
  }

  /// One reused paint for every sprite: allocating a Paint per tile and
  /// sprite each frame produced a steady stream of garbage.
  final Paint _sprite = Paint()..filterQuality = FilterQuality.low;

  /// Draws an atlas part with its bottom-centre (or, with [center], the point
  /// [cy] of its height) at world position x, y, [height] tiles tall.
  void prop(
    Canvas canvas,
    String key,
    String name,
    double x,
    double y,
    double height, {
    bool center = false,
    double cy = .5,
    double rot = 0,
    bool flip = false,
    double alpha = 1,
  }) {
    final fr = sheets[key]?['names'][name] as Json?, image = pictures[key];
    if (image == null) missing.add('pic:$key');
    if (image != null && fr == null) missing.add('prop:$key/$name');
    if (fr == null || image == null) return;
    final c = (fr['content'] ?? fr['source']) as Json,
        h = height * tileSize,
        w = number(c['w']) * height * tileSize / number(c['h']),
        ay = center ? h * cy : h;
    _sprite.color = Colors.white.withValues(alpha: clamp(alpha, 0, 1));
    if (rot != 0 || flip) {
      canvas.save();
      canvas.translate(sx(x), sy(y));
      if (rot != 0) canvas.rotate(rot);
      if (flip) canvas.scale(-1, 1);
      canvas.drawImageRect(image, rect(c), Rect.fromLTWH(-w / 2, -ay, w, h), _sprite);
      canvas.restore();
    } else {
      canvas.drawImageRect(
        image,
        rect(c),
        Rect.fromLTWH(sx(x) - w / 2, sy(y) - ay, w, h),
        _sprite,
      );
    }
  }

  void gradient(Canvas canvas, Rect bounds, List<Color> colors) {
    if (bounds.height <= 0) return;
    canvas.drawRect(
      bounds,
      Paint()
        ..shader = ui.Gradient.linear(
          bounds.topCenter,
          bounds.bottomCenter,
          colors,
        ),
    );
  }

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    if (simulation == null || pictures['SKY_BG'] == null) return;
    final t = tileSize;
    if (t <= 0) return;
    final s = session, p = s.player;
    canvas.save();
    canvas.clipRect(Offset.zero & Size(size.x, size.y));
    final baseX = cameraX, baseY = cameraY;
    if (s.shake > 0) {
      cameraX += math.sin(s.time * 97) * s.shake * .12;
      cameraY += math.cos(s.time * 83) * s.shake * .12;
    }
    background(canvas);
    // Chasm darkness under the play area.
    final pit = sy(15.5);
    canvas.drawRect(
      Rect.fromLTRB(0, pit, size.x, size.y),
      Paint()
        ..shader = ui.Gradient.linear(Offset(0, pit), Offset(0, sy(18.5)), const [
          Color(0x0005060e),
          Color(0xf205060e),
        ]),
    );
    drawDecor(canvas);
    drawShadows(canvas);
    drawTiles(canvas);
    drawLights(canvas);
    drawObjects(canvas);
    for (final e in s.enemies) {
      drawEnemy(canvas, e);
    }
    if (s.boss?.active == true) drawEnemy(canvas, s.boss!);
    drawLinks(canvas, p);
    drawCompanion(canvas, p);
    drawPlayer(canvas, p);
    if (p.dead) drawDeath(canvas, p.deadTime);
    drawShots(canvas);
    drawEffects(canvas);
    drawTarget(canvas, p);
    // Low drifting foreground fog.
    final fy = sy(14.2);
    canvas.drawRect(
      Rect.fromLTWH(0, fy - t * 1.5, size.x, t * 2.5),
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, fy - t * 1.5),
          Offset(0, fy + t),
          [
            const Color(0x005a6ea0),
            Color.fromRGBO(90, 110, 160, .12 + math.sin(s.time * .7) * .04),
            const Color(0x005a6ea0),
          ],
          const [0, .6, 1],
        ),
    );
    drawOverlays(canvas, p);
    cameraX = baseX;
    cameraY = baseY;
    canvas.restore();
  }

  Paint? _vignette;
  Size? _vignetteSize;

  void drawOverlays(Canvas canvas, Hunter p) {
    final s = session, w = size.x, h = size.y;
    if (_vignette == null || _vignetteSize != Size(w, h)) {
      final far = math.max(w, h) * .75;
      _vignetteSize = Size(w, h);
      _vignette = Paint()
        ..shader = ui.Gradient.radial(
          Offset(w / 2, h / 2),
          far,
          const [Color(0x00050610), Color(0x8c050610)],
          [math.min(w, h) * .35 / far, 1],
        );
    }
    canvas.drawRect(Offset.zero & Size(w, h), _vignette!);
    if (s.hurtFlash > 0) {
      canvas.drawRect(
        Offset.zero & Size(w, h),
        Paint()..color = Color.fromRGBO(160, 20, 30, clamp(s.hurtFlash * .6, 0, 1)),
      );
    }
    if (p.dead) {
      final d = p.deadTime;
      // Blood-red flash, then a red vignette closing in, then the dark.
      if (d < .3) {
        canvas.drawRect(
          Offset.zero & Size(w, h),
          Paint()..color = Color.fromRGBO(255, 60, 60, (1 - d / .3) * .45),
        );
      }
      final close = clamp(d / 1.1, 0, 1);
      final far = math.max(w, h) * .8;
      canvas.drawRect(
        Offset.zero & Size(w, h),
        Paint()
          ..shader = ui.Gradient.radial(
            Offset(sx(s.deathX), sy(s.deathY)),
            far,
            [const Color(0x00500008), Color.fromRGBO(70, 0, 10, .75 * close)],
            [math.max(0, .55 - close * .45), 1],
          ),
      );
      canvas.drawRect(
        Offset.zero & Size(w, h),
        Paint()..color = Color.fromRGBO(4, 4, 10, clamp((d - .45) * 1.3, 0, .8)),
      );
      // "TUMBANG" rises and fades in.
      final k = clamp((d - .2) / .4, 0, 1);
      if (k > 0) {
        final text = TextPainter(
          text: TextSpan(
            text: 'TUMBANG',
            style: TextStyle(
              fontSize: math.min(w, h) * .11,
              fontWeight: FontWeight.w900,
              letterSpacing: math.min(w, h) * .03 * (1 + (1 - k) * .6),
              color: Color.fromRGBO(255, 214, 214, k),
              shadows: [
                Shadow(color: Color.fromRGBO(255, 40, 60, .9 * k), blurRadius: 24),
                Shadow(color: Color.fromRGBO(0, 0, 0, k), blurRadius: 6, offset: const Offset(0, 3)),
              ],
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        text.paint(canvas, Offset((w - text.width) / 2, h * .36 - text.height / 2 + (1 - k) * 18));
        text.dispose();
      }
    }
    if (s.respawnFade > 0) {
      canvas.drawRect(
        Offset.zero & Size(w, h),
        Paint()..color = Color.fromRGBO(4, 4, 10, clamp(s.respawnFade, 0, 1)),
      );
    }
  }

  /// Props in the world: lamps, signs, graves. The mill wheel is drawn with
  /// the shadow platforms instead.
  void drawDecor(Canvas canvas) {
    final t = tileSize;
    for (final d in session.objects('decor')) {
      final kind = d['kind'] as String;
      if (kind == 'mill_wheel') continue;
      final x = sx(number(d['x']));
      if (x < -t * 4 || x > size.x + t * 4) continue;
      final y = number(d['y']);
      final h =
          number(reference['render']['PROP_H'][kind], 1) * number(d['scale'], 1);
      prop(
        canvas,
        'PROPS_WORLD',
        kind,
        number(d['x']),
        y + .05,
        h,
        alpha: kind == 'iron_bars' ? .9 : 1,
      );
      if (kind == 'lamp_post') {
        glow(canvas, x + t * .35, sy(y - 2.1), t * 1.6, const Color(0xffffaa50), .35);
      }
      if (kind == 'guard_lamp') {
        glow(canvas, x - t * .1, sy(y - .5), t * 1.2, const Color(0xffffc86e), .4);
      }
    }
  }

  double _blink(Json altar) {
    final left = number(altar['activeT']);
    return left < 2.5 && (left * 8).floor() % 2 == 0 ? .4 : 1;
  }

  /// Shadow bridges (faint until their altar glows) and the turning wheels.
  void drawShadows(Canvas canvas) {
    final s = session;
    final altars = {for (final a in s.objects('altars')) a['id']: a};
    final pulse = .75 + math.sin(s.time * 4) * .1;
    for (final sh in s.objects('shadows')) {
      final altar = altars[sh['altar']];
      final on = altar != null && number(altar['activeT']) > 0;
      final w = number(sh['w']), n = math.max(1, (w + .5).floor()), seg = w / n;
      final mask = sh['litMask'] as List?;
      for (var i = 0; i < n; i++) {
        var alpha = .1;
        if (on) {
          final lit = mask != null && i < mask.length && mask[i] == true;
          alpha = lit ? .1 + (((s.time * 20).floor() + i) % 3) * .04 : pulse;
          alpha *= _blink(altar);
        }
        prop(
          canvas,
          'PROPS_WORLD',
          'shadow_block',
          number(sh['x']) + seg * (i + .5),
          number(sh['y']) + seg,
          seg,
          alpha: alpha,
        );
      }
    }
    for (final wh in s.objects('wheels')) {
      final altar = altars[wh['altar']];
      final on = altar != null && number(altar['activeT']) > 0;
      final r = number(wh['r']), ang = number(wh['ang']);
      prop(
        canvas,
        'PROPS_WORLD',
        'mill_wheel',
        number(wh['cx']),
        number(wh['cy']),
        r * 2.05,
        center: true,
        cy: .52,
        rot: ang,
        alpha: .95,
      );
      for (var i = 0; i < 4; i++) {
        final a = ang + i * math.pi / 2;
        final px = number(wh['cx']) + math.cos(a) * r;
        final py = number(wh['cy']) + math.sin(a) * r;
        var alpha = .12;
        if (on) {
          alpha = (wh['lit'] as List)[i] == true ? .15 : pulse;
          alpha *= _blink(altar);
        }
        for (var k = 0; k < 2; k++) {
          prop(
            canvas,
            'PROPS_WORLD',
            'shadow_block',
            px - .9 + k * .9 + .45,
            py + .9,
            .9,
            alpha: alpha,
          );
        }
      }
    }
  }

  final Map<String, List<Json?>> _tileFrames = {};

  /// The nine edge variants of a ground sheet, looked up once per sheet.
  Json? tileFrame(String key, int row, int col) {
    final names = sheets[key]?['names'] as Map?;
    if (names == null) return null;
    final cache = _tileFrames.putIfAbsent(key, () {
      const rows = ['', 'top', 'bottom'], cols = ['', 'left', 'right'];
      return [
        for (final r in rows)
          for (final c in cols)
            names[r.isNotEmpty && c.isNotEmpty
                    ? '${r}_$c'
                    : r.isNotEmpty
                    ? r
                    : c.isNotEmpty
                    ? c
                    : 'center']
                as Json?,
      ];
    });
    return cache[row * 3 + col];
  }

  void drawTiles(Canvas canvas) {
    final s = session, t = tileSize;
    final x0 = math.max(0, (cameraX - size.x / 2 / t).floor() - 2);
    final x1 = math.min(s.cols - 1, (cameraX + size.x / 2 / t).ceil() + 2);
    final y0 = math.max(0, (cameraY - size.y / 2 / t).floor() - 1);
    final y1 = math.min(s.rows - 1, (cameraY + size.y / 2 / t).ceil() + 1);
    final themes = s.level['theme'] as List, keys = s.level['tileKeys'] as List;
    int at(int x, int y) => y >= s.rows
        ? 1
        : (x < 0 || x >= s.cols || y < 0 ? 0 : s.tile(x, y));
    bool ground(int x, int y) => at(x, y) == 1;
    _sprite.color = Colors.white;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        final value = at(x, y);
        if (value == 0) continue;
        if (value == 2) {
          prop(canvas, 'PROPS_WORLD', 'wood_plank', x + .5, y + .22, .22);
          continue;
        }
        final X = sx(x.toDouble()), Y = sy(y.toDouble());
        String key;
        Json? fr;
        var shakeX = 0.0;
        if (value == 1) {
          final index = themes[x] as int;
          key = (index < keys.length ? keys[index] : keys[0]) as String;
          final row = !ground(x, y - 1) ? 1 : (!ground(x, y + 1) ? 2 : 0);
          final col = x != 0 && !ground(x - 1, y)
              ? 1
              : (x != s.cols - 1 && !ground(x + 1, y) ? 2 : 0);
          fr = tileFrame(key, row, col);
        } else {
          key = 'PROPS_OBJECTS';
          fr =
              sheets[key]?['names'][value == 3
                      ? 'fragile_floor'
                      : value == 4
                      ? 'cracked_barricade'
                      : 'gate_block']
                  as Json?;
          if (value == 3 && s.crumble.any((c) => c['x'] == x)) {
            shakeX = math.sin(s.time * 80) * t * .05;
          }
        }
        final image = pictures[key];
        if (image == null) missing.add('pic:$key');
        if (image != null && fr == null) missing.add('tile:$key/$value');
        if (fr == null || image == null) continue;
        final src = fr['source'] as Json, c = (fr['content'] ?? src) as Json;
        final k = t / number(src['w']), pad = value == 1 ? .3 : 0.0;
        canvas.drawImageRect(
          image,
          rect(c),
          Rect.fromLTWH(
            X + (number(c['x']) - number(src['x'])) * k + shakeX - pad,
            Y + (number(c['y']) - number(src['y'])) * k - pad,
            number(c['w']) * k + pad * 2,
            number(c['h']) * k + pad * 2,
          ),
          _sprite,
        );
      }
    }
  }

  /// Guard lamps and lantern hunters throw a light cone that erases shadows.
  void drawLights(Canvas canvas) {
    final t = tileSize;
    for (final l in session.lights) {
      final o = Offset(sx(number(l['x'])), sy(number(l['y'])));
      final r = number(l['len']) * t, a = number(l['ang']), half = number(l['half']);
      final lamp = l['kind'] != 'lantern';
      final base = lamp ? const Color(0xffffe8aa) : const Color(0xffffb45a);
      canvas.drawPath(
        Path()
          ..moveTo(o.dx, o.dy)
          ..arcTo(Rect.fromCircle(center: o, radius: r), a - half, half * 2, false)
          ..close(),
        Paint()
          ..blendMode = BlendMode.plus
          ..shader = ui.Gradient.radial(o, r, [
            base.withValues(alpha: .42),
            base.withValues(alpha: 0),
          ]),
      );
      glow(canvas, o.dx, o.dy, t * .7, base, .5);
    }
  }

  void drawObjects(Canvas canvas) {
    final s = session, t = tileSize, p = s.player;
    const blue = Color(0xff96d2ff);
    for (final a in s.objects('altars')) {
      final ax = number(a['x']), ay = number(a['y']), on = number(a['activeT']) > 0;
      final X = sx(ax), Y = sy(ay);
      if (on) {
        glow(canvas, X, Y - t * .7, t * 2.2, blue, .45);
      } else if (p.form == 'wolf' && (p.x - ax).abs() < 5) {
        glow(canvas, X, Y - t * .7, t * 1.4, blue, .2 + math.sin(s.time * 5) * .1);
      }
      prop(canvas, 'PROPS_OBJECTS', on ? 'moon_altar_lit' : 'moon_altar', ax, ay + .04, 1.2);
      if (on) {
        canvas.drawArc(
          Rect.fromCircle(center: Offset(X, Y - t * 1.75), radius: t * .28),
          -math.pi / 2,
          math.pi * 2 * (number(a['activeT']) / math.max(1, s.tweak('shadowDuration'))),
          false,
          Paint()
            ..style = PaintingStyle.stroke
            ..color = const Color(0xe6bee3ff)
            ..strokeWidth = math.max(2, t * .07),
        );
      }
    }
    for (final l in s.objects('levers')) {
      prop(canvas, 'PROPS_OBJECTS', l['on'] == true ? 'lever_on' : 'lever_off', number(l['x']), number(l['y']) + .04, .95);
    }
    for (final r in s.objects('rings')) {
      final rx = number(r['x']), ry = number(r['y']);
      glow(canvas, sx(rx), sy(ry), t * .9, const Color(0xff96c8ff), .25 + math.sin(s.time * 3 + rx) * .08);
      prop(canvas, 'PROPS_OBJECTS', 'moon_ring', rx, ry, 1.15, center: true, cy: .66);
    }
    for (final cp in s.objects('checkpoints')) {
      final cx = number(cp['x']), cy = number(cp['y']), on = cp['on'] == true;
      if (on) glow(canvas, sx(cx) + t * .35, sy(cy) - t * 1.25, t * 1.5, const Color(0xff8cc8ff), .4);
      prop(canvas, 'PROPS_OBJECTS', on ? 'checkpoint_on' : 'checkpoint_off', cx, cy + .04, 2);
    }
    for (final sh in s.objects('shards')) {
      if (sh['taken'] == true) continue;
      final hx = number(sh['x']), hy = number(sh['y']);
      final near = (p.x - hx).abs() < 2.5 && (p.y - hy).abs() < 3;
      final sniffed = p.form == 'wolf' && (p.x - hx).abs() < 10 && (p.y - hy).abs() < 6;
      if (sh['secret'] == true && !near && !sniffed) continue;
      final y = hy - .55 + math.sin(s.time * 3 + hx) * .1;
      glow(canvas, sx(hx), sy(y), t * .8, const Color(0xffaad7ff), .45);
      prop(canvas, 'PROPS_OBJECTS', 'moon_shard', hx, y, .62, center: true);
    }
    // Scent trail to the nearest hidden shard while in wolf form.
    if (p.form == 'wolf' && !p.dead) {
      Json? nearest;
      for (final sh in s.objects('shards')) {
        if (sh['secret'] != true || sh['taken'] == true) continue;
        final d = (number(sh['x']) - p.x).abs();
        if (d >= 14) continue;
        if (nearest == null || d < (number(nearest['x']) - p.x).abs()) nearest = sh;
      }
      if (nearest != null) {
        for (var i = 1; i <= 6; i++) {
          final k = ((i + s.time * 2) % 6) / 6;
          final wx = p.x + (number(nearest['x']) - p.x) * k;
          final wy = p.y - .4 + (number(nearest['y']) - .4 - (p.y - .4)) * k + math.sin(k * 9 + s.time * 3) * .2;
          glow(canvas, sx(wx), sy(wy), t * .25, const Color(0xffffd28c), .35 * (1 - (k - .5).abs()));
        }
      }
    }
    for (final o in s.orbs) {
      final X = sx(number(o['x'])), Y = sy(number(o['y']));
      final age = number(o['t']);
      // Comet tail: fading, shrinking beads along the recent path.
      final trail = o['trail'] as List?;
      if (trail != null && trail.length > 1) {
        for (var i = trail.length - 1; i >= 1; i--) {
          final k = 1 - i / trail.length;
          final pt = trail[i] as List;
          final px = sx(pt[0] as double), py = sy(pt[1] as double);
          glow(canvas, px, py, t * (.18 + .28 * k), const Color(0xff7cc4ff), .55 * k);
          canvas.drawCircle(
            Offset(px, py),
            t * .05 * k + .5,
            Paint()..color = Color.fromRGBO(220, 240, 255, .7 * k),
          );
        }
      }
      final beat = 1 + math.sin(age * 18) * .15;
      glow(canvas, X, Y, t * .75 * beat, const Color(0xff8fd0ff), .85);
      glow(canvas, X, Y, t * .3, const Color(0xffffffff), .6);
      // Two sparks orbiting the core.
      for (var i = 0; i < 2; i++) {
        final a = age * 9 + i * math.pi;
        glow(canvas, X + math.cos(a) * t * .26, Y + math.sin(a) * t * .14, t * .1, const Color(0xffd8f0ff), .9);
      }
      canvas.drawCircle(Offset(X, Y), t * .1 * beat, Paint()..color = const Color(0xfff2faff));
    }
  }

  void drawCompanion(Canvas canvas, Hunter p) {
    if (session.buffs['spirit'] != true || p.dead) return;
    final t = tileSize, time = session.time;
    final X = sx(p.x - p.facing * 1.4);
    final Y = sy(p.y - 1.1 + math.sin(time * 3) * .15);
    glow(canvas, X, Y - t * .4, t, const Color(0xff8ce6ff), .35);
    anchored(
      canvas,
      'FX_SPIRIT',
      frame('FX_SPIRIT', 'spirit_wolf', time: time, fps: 12),
      X,
      Y,
      t * 1.1 / 218,
      flip: p.facing < 0,
      alpha: .75,
    );
  }

  /// The death burst: two shockwaves, moon shards flung out under gravity,
  /// and the hunter's spirit rising from where they fell. [d] is seconds
  /// since death; everything is a pure function of it, so it never stutters.
  void drawDeath(Canvas canvas, double d) {
    final s = session, t = tileSize;
    final ox = s.deathX, oy = s.deathY;
    final X = sx(ox), Y = sy(oy);
    for (var w = 0; w < 2; w++) {
      final k = (d - w * .12) / .55;
      if (k <= 0 || k >= 1) continue;
      canvas.drawCircle(
        Offset(X, Y),
        t * (.4 + k * 3.2),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = t * .18 * (1 - k) + 1
          ..color = (w == 0 ? const Color(0xffff4a5a) : const Color(0xffffe0e0))
              .withValues(alpha: (1 - k) * .85),
      );
    }
    glow(canvas, X, Y, t * (2.4 - d), const Color(0xffff3848), clamp(.9 - d * .9, 0, 1));
    // Shards: fixed angles and speeds per index, so the burst is stable.
    const count = 22;
    for (var i = 0; i < count; i++) {
      final seed = math.sin(i * 12.9898) * 43758.5453;
      final r = seed - seed.floorToDouble();
      final a = i * math.pi * 2 / count + r * .5;
      final v = 3 + r * 5.5;
      final px = ox + math.cos(a) * v * d;
      final py = oy + math.sin(a) * v * d - 2 * d + 7 * d * d;
      final life = clamp(1 - d / (.7 + r * .5), 0, 1);
      if (life <= 0) continue;
      final color = i.isEven ? const Color(0xffff5a6a) : const Color(0xffcfe6ff);
      glow(canvas, sx(px), sy(py), t * .3 * life + 1, color, .8 * life);
      canvas.save();
      canvas.translate(sx(px), sy(py));
      canvas.rotate(a + d * 10);
      final size = t * (.09 + r * .08) * life;
      canvas.drawPath(
        Path()
          ..moveTo(0, -size * 1.6)
          ..lineTo(size, 0)
          ..lineTo(0, size * 1.6)
          ..lineTo(-size, 0)
          ..close(),
        Paint()..color = Color.lerp(color, Colors.white, .5)!.withValues(alpha: life),
      );
      canvas.restore();
    }
    // Spirit wisp rising and swaying.
    if (d > .15) {
      final k = clamp((d - .15) / .95, 0, 1);
      final wx = sx(ox + math.sin(d * 6) * .25), wy = sy(oy - k * 2.6);
      glow(canvas, wx, wy, t * (.9 - k * .3), const Color(0xffa8d8ff), .7 * (1 - k));
      glow(canvas, wx, wy, t * .25, const Color(0xffffffff), .8 * (1 - k));
    }
  }

  void drawPlayer(Canvas canvas, Hunter p) {
    final t = tileSize, s = session;
    final defs = reference['render']['HERO'] as Json,
        def = defs[p.animation] as List? ?? defs['human.idle'] as List;
    final role = def[0] as String,
        key = skin == 1 ? 'HERO_$role' : 'SKIN${skin}_$role';
    final X = sx(p.x), Y = sy(p.y) + t * .04;
    glow(canvas, X, Y - p.h * t * .55, t * 1.3, const Color(0xff96b4ff), .16);
    if (p.eclipse > 0) {
      glow(canvas, X, Y - t * 1.3, t * 2.4, const Color(0xff96c8ff), .35 + math.sin(s.time * 6) * .08);
    }
    if (s.orbPulse > 0) {
      glow(canvas, X, Y - p.h * t * .5, t * (1.2 + (.35 - s.orbPulse) * 3), const Color(0xff8fd0ff), s.orbPulse * 2);
    }
    final blink = p.invulnerable > 0 && !p.dead && (p.invulnerable * 14).floor() % 2 == 0;
    if (p.dead) {
      // The body darkens and fades as the spirit leaves it.
      final fade = clamp(1 - p.deadTime / 1.1, 0, 1);
      anchored(
        canvas,
        key,
        frame(key, def[1], time: p.animTime, fps: p.fps, progress: p.animProgress),
        X,
        Y,
        number(reference['render']['ROLE_UNIT'][role]) * t,
        flip: p.facing < 0,
        alpha: fade,
      );
      return;
    }
    anchored(
      canvas,
      key,
      frame(
        key,
        def[1],
        time: p.animTime,
        fps: p.fps,
        progress: p.animProgress,
        reverse: def.length > 2 && def[2] == true,
      ),
      X,
      Y,
      number(reference['render']['ROLE_UNIT'][role]) * t,
      flip: p.facing < 0,
      alpha: blink ? .45 : 1,
    );
  }

  void drawShots(Canvas canvas) {
    final t = tileSize;
    for (final shot in session.shots) {
      final kind = shot['kind'] as String;
      final wx = number(shot['x']), wy = number(shot['y']);
      final x = sx(wx), y = sy(wy);
      final vx = number(shot['vx']), vy = number(shot['vy']);
      switch (kind) {
        case 'arrow':
          final a = math.atan2(vy, vx);
          prop(canvas, 'PROPS_OBJECTS', 'arrow', wx, wy, .2, center: true, flip: vx > 0, rot: vx > 0 ? a : a - math.pi);
          if (shot['friendly'] == true) glow(canvas, x, y, t * .4, const Color(0xffbee6ff), .5);
        case 'thread':
          canvas.drawLine(
            Offset(x, y),
            Offset(x - vx * t * .05, y - vy * t * .05),
            Paint()
              ..color = const Color(0xf2cd96ff)
              ..strokeWidth = 3
              ..strokeCap = StrokeCap.round,
          );
          glow(canvas, x, y, t * .35, const Color(0xffc88cff), .7);
        case 'spirit':
          glow(canvas, x, y, t * 1.4, const Color(0xff8cd2ff), .4);
          anchored(
            canvas,
            'FX_SPIRIT',
            frame('FX_SPIRIT', 'spirit_wolf', time: number(shot['t']), fps: 14),
            x,
            y + t * .6,
            1.6 * t / 218,
            flip: vx < 0,
            alpha: .9,
          );
        case 'fire' || 'orb' || 'drop':
          final color = kind == 'fire'
              ? const Color(0xffff8232)
              : (shot['color'] is String
                    ? Color(int.parse((shot['color'] as String).substring(1), radix: 16) | 0xff000000)
                    : Colors.white);
          if (kind == 'drop' && number(shot['wait']) > 0) {
            glow(canvas, x, sy(14) - t * .1, t * .6, color, .35);
            break;
          }
          glow(canvas, x, y, t * .55, color, .9);
          canvas.drawCircle(Offset(x, y), t * .12, Paint()..color = const Color(0xfffff8ec));
        case 'wave':
          final list = sheets['FX_SPIRIT']?['animations']['ground_wave'] as List?;
          if (list == null || list.isEmpty) break;
          final fr = list[math.min(list.length - 1, 1 + ((number(shot['t']) * 10).floor() % 3))] as Json;
          glow(canvas, x, y - t * .4, t * .9, const Color(0xffc83c50), .4);
          anchored(canvas, 'FX_SPIRIT', fr, x, y, 1.1 * t / 230, flip: vx < 0);
      }
    }
  }

  /// Hit sparks, dust and bursts, plus the moon mark that stays on enemies.
  void drawEffects(Canvas canvas) {
    final t = tileSize, s = session;
    void centered(String sheet, Json fr, double x, double y, double k, {bool ground = false, double alpha = 1}) {
      final image = pictures[sheet];
      if (image == null) {
        missing.add('pic:$sheet');
        return;
      }
      final c = (fr['content'] ?? fr['source']) as Json;
      final w = number(c['w']) * k, h = number(c['h']) * k;
      _sprite.color = Colors.white.withValues(alpha: clamp(alpha, 0, 1));
      canvas.drawImageRect(image, rect(c), Rect.fromLTWH(x - w / 2, ground ? y - h : y - h / 2, w, h), _sprite);
    }

    for (final e in s.effects) {
      final name = e['name'] as String;
      final sheet = reference['render']['FX_SHEET'][name] as String?;
      final list = sheet == null ? null : sheets[sheet]?['animations'][name] as List?;
      if (list == null || list.isEmpty) continue;
      final i = math.min(list.length - 1, (number(e['t']) / number(e['dur'], .35) * list.length).floor());
      centered(sheet!, list[i] as Json, sx(number(e['x'])), sy(number(e['y'])), 1.8 * t / 320 * number(e['scale'], 1), ground: name == 'ground_wave' || name == 'dust');
    }
    final marks = sheets['FX_COMBAT']?['animations']['moon_mark'] as List?;
    if (marks != null && marks.length > 4) {
      for (final e in s.enemies) {
        if (e.dead || e.marked <= 0) continue;
        centered('FX_COMBAT', marks[3 + (s.time * 6).floor() % 2] as Json, sx(e.x), sy(e.y - e.h - .55), 1.8 * t / 320 * .45, alpha: math.min(1, e.marked));
      }
    }
  }

  void drawTarget(Canvas canvas, Hunter p) {
    final s = session, t = tileSize;
    if (p.dead || p.targetId == null || p.form == 'eclipse' || p.swing != null) return;
    final target = s.targets().where((tg) => tg['id'] == p.targetId).firstOrNull;
    if (target == null) return;
    final X = sx(number(target['x'])), Y = sy(number(target['y']));
    final aiming = p.aiming;
    final r = t * (aiming ? .75 : .55) * (1 + math.sin(s.time * 6) * .06);
    final color = p.form == 'human' ? const Color(0xf2aad7ff) : const Color(0xf2ffc878);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..color = color
      ..strokeWidth = math.max(2, t * (aiming ? .08 : .05));
    for (var i = 0; i < 3; i++) {
      final a = s.time * 2 + i * math.pi * 2 / 3;
      canvas.drawArc(Rect.fromCircle(center: Offset(X, Y), radius: r), a, 1.2, false, paint);
    }
    if (aiming) {
      final from = Offset(sx(p.x), sy(p.y - p.h * .7)), to = Offset(X, Y);
      final length = (to - from).distance;
      if (length > 1) {
        final dir = (to - from) / length;
        paint.color = color.withValues(alpha: .7);
        for (var d = 0.0; d < length; d += 12) {
          canvas.drawLine(from + dir * d, from + dir * math.min(d + 6, length), paint);
        }
      }
    }
  }

  /// Additive radial glow, the original's pre-rendered "lighter" sprite.
  void glow(Canvas canvas, double x, double y, double r, Color color, double alpha) {
    if (alpha <= 0 || r <= 0) return;
    final center = Offset(x, y);
    canvas.drawCircle(
      center,
      r,
      Paint()
        ..blendMode = BlendMode.plus
        ..shader = ui.Gradient.radial(center, r, [
          color.withValues(alpha: clamp(alpha, 0, 1)),
          color.withValues(alpha: 0),
        ]),
    );
  }

  /// A hooked line: glowing core, real chain links that alternate face-on and
  /// edge-on like a true chain, and the hook head at the far end.
  void chain(Canvas canvas, double x0, double y0, double x1, double y1) {
    final t = tileSize;
    final image = pictures['PROPS_OBJECTS'];
    final link = sheets['PROPS_OBJECTS']?['names']['chain_link'] as Json?;
    final head = sheets['PROPS_OBJECTS']?['names']['hook_head'] as Json?;
    final len = math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
    if (len < 1) return;
    final ang = math.atan2(y1 - y0, x1 - x0);
    canvas.drawLine(
      Offset(x0, y0),
      Offset(x1, y1),
      Paint()
        ..blendMode = BlendMode.plus
        ..color = const Color(0x558fc9ff)
        ..strokeWidth = t * .16
        ..strokeCap = StrokeCap.round
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, t * .08),
    );
    if (image == null || link == null || head == null) {
      canvas.drawLine(
        Offset(x0, y0),
        Offset(x1, y1),
        Paint()
          ..color = const Color(0xffc8d6ef)
          ..strokeWidth = 2,
      );
      return;
    }
    final lc = (link['content'] ?? link['source']) as Json;
    final hc = (head['content'] ?? head['source']) as Json;
    final segW = t * .55, k = segW / number(lc['w']);
    final paint = Paint()..filterQuality = FilterQuality.low;
    canvas.save();
    canvas.translate(x0, y0);
    canvas.rotate(ang);
    var i = 0;
    for (var d = 0.0; d < len - segW * .3; d += segW * .9, i++) {
      final h = number(lc['h']) * k * (i.isEven ? 1.0 : .62);
      canvas.drawImageRect(
        image,
        rect(lc),
        Rect.fromLTWH(d, -h / 2, math.min(segW, len - d), h),
        paint,
      );
    }
    final hk = t * .5 / number(hc['h']);
    final hw = number(hc['w']) * hk, hh = number(hc['h']) * hk;
    canvas.drawImageRect(
      image,
      rect(hc),
      Rect.fromLTWH(len - hw * .6, -hh / 2, hw, hh),
      paint,
    );
    canvas.restore();
    glow(canvas, x1, y1, t * .5, const Color(0xff9fd3ff), .55);
  }

  /// Moon Hook in flight, the ring swing, and the tailor's thread.
  void drawLinks(Canvas canvas, Hunter p) {
    final t = tileSize;
    final hx = sx(p.x + p.facing * .25), hy = sy(p.y - p.h * .85);
    final hook = p.hook;
    if (hook != null) {
      final k = clamp(number(hook['t']) / .16, 0, 1);
      final tx = sx(number(hook['x'])), ty = sy(number(hook['y']));
      chain(canvas, hx, hy, hx + (tx - hx) * k, hy + (ty - hy) * k);
      glow(canvas, hx, hy, t * .45, const Color(0xffbfe3ff), .5 * (1 - k));
    }
    final swing = p.swing;
    if (swing != null) {
      final rx = sx(number(swing['x'])), ry = sy(number(swing['y']));
      final pulse = .5 + math.sin(session.time * 14) * .12;
      glow(canvas, rx, ry, t * 1.1, const Color(0xff96c8ff), pulse);
      chain(canvas, sx(p.x), sy(p.y - p.h * .9), rx, ry);
      glow(canvas, sx(p.x), sy(p.y - p.h * .9), t * .4, const Color(0xffbfe3ff), .35);
    }
    final thread = p.thread;
    if (thread != null) {
      final e = session.enemies.where((e) => e.id == thread['id']).firstOrNull;
      if (e != null) {
        final x0 = sx(e.x), y0 = sy(e.y - 1), x1 = sx(p.x), y1 = sy(p.y - .1);
        final path = Path()..moveTo(x0, y0);
        for (var i = 1; i <= 16; i++) {
          final k = i / 16;
          path.lineTo(
            x0 + (x1 - x0) * k,
            y0 +
                (y1 - y0) * k +
                math.sin(k * 12 + session.time * 10) *
                    t *
                    .08 *
                    math.sin(k * math.pi),
          );
        }
        canvas.drawPath(
          path,
          Paint()
            ..style = PaintingStyle.stroke
            ..color = const Color(0xe6cd96ff)
            ..strokeWidth = math.max(2, t * .05),
        );
        glow(canvas, x1, y1, t * .6, const Color(0xffc88cff), .5);
      }
    }
  }

  String? _tintSource;
  Paint? _tintPaint;

  void background(Canvas canvas) {
    final sky = pictures['SKY_BG']!, w = size.x, h = size.y, t = tileSize;
    final scale = math.max(w / sky.width, h / sky.height) * 1.08,
        sw = sky.width * scale,
        sh = sky.height * scale;
    canvas.drawImageRect(
      sky,
      Rect.fromLTWH(0, 0, sky.width.toDouble(), sky.height.toDouble()),
      Rect.fromLTWH(
        (w - sw) / 2 - (cameraX * .4) % 20,
        (h - sh) / 2 - (cameraY - 9) * .6,
        sw,
        sh,
      ),
      Paint()..filterQuality = FilterQuality.low,
    );
    final tint = session.level['tint'] as String?;
    if (tint != null) {
      if (_tintSource != tint) {
        final values = RegExp(
          r'[\d.]+',
        ).allMatches(tint).map((m) => double.parse(m.group(0)!)).toList();
        _tintSource = tint;
        _tintPaint = Paint()
          ..color = Color.fromRGBO(
            values[0].toInt(),
            values[1].toInt(),
            values[2].toInt(),
            values[3],
          );
      }
      canvas.drawRect(Offset.zero & Size(w, h), _tintPaint!);
    }
    final weights = <int, int>{};
    var total = 0;
    for (var x = cameraX.floor() - 6; x <= cameraX.floor() + 6; x++) {
      if (x < 0 || x >= session.cols) continue;
      final index = session.level['theme'][x] as int;
      weights[index] = (weights[index] ?? 0) + 1;
      total++;
    }
    void layer(double factor, double frac, double bottom, double opacity) {
      for (final entry in weights.entries) {
        final key = session.level['layerKeys'][entry.key] as String,
            img = pictures[key];
        if (img == null) {
          missing.add('pic:$key');
          continue;
        }
        final lh = h * frac, lw = img.width * lh / img.height;
        final offset =
            -((cameraX + number(session.level['drift']) * session.time) *
                    t *
                    factor) %
                (lw * 2) -
            lw * 2;
        final paint = Paint()
          ..filterQuality = FilterQuality.low
          ..color = Colors.white.withValues(
            alpha: opacity * entry.value / total,
          );
        for (var x = offset; x < w; x += lw * 2) {
          final src = Rect.fromLTWH(
            0,
            0,
            img.width.toDouble(),
            img.height.toDouble(),
          );
          canvas.drawImageRect(
            img,
            src,
            Rect.fromLTWH(x, bottom - lh, lw, lh),
            paint,
          );
          canvas.save();
          canvas.translate(x + lw * 2, 0);
          canvas.scale(-1, 1);
          canvas.drawImageRect(
            img,
            src,
            Rect.fromLTWH(0, bottom - lh, lw, lh),
            paint,
          );
          canvas.restore();
        }
      }
    }

    final far = h * .8 * .6 + (sy(14) + t * .5) * .4;
    layer(.12, .38, far, .5);
    gradient(canvas, Rect.fromLTRB(0, far - h * .2, w, far + 10), const [
      Color(0x00465a8c),
      Color(0x59465a8c),
    ]);
    final near = h * .92 * .4 + (sy(14) + t * 2.2) * .6;
    layer(.3, .5, near, .9);
    if (near < h) {
      canvas.drawRect(
        Rect.fromLTWH(0, near - 2, w, h - near + 2),
        Paint()..color = const Color(0xff0b0f1e),
      );
    }
  }

  void drawEnemy(Canvas canvas, Enemy e) {
    if (sx(e.x) < -tileSize * 3 ||
        sx(e.x) > size.x + tileSize * 3 ||
        e.deathTime > 1.4) {
      return;
    }
    final t = tileSize;
    double unit;
    if (e.boss) {
      unit =
          (e.type == 'human'
              ? 1.95 / 327
              : e.type == 'wolf'
              ? 1.5 / 258
              : 3.2 / 379) *
          number(e.definition['scale'], 1);
    } else {
      unit =
          number(reference['render']['UNIT']['ENEMY_${e.type.toUpperCase()}']) *
          number(e.definition['scale'], 1);
    }
    final fr =
        frame(
          e.sheet,
          e.animation,
          time: e.animTime,
          progress: e.animProgress,
          fps: e.animFps,
        ) ??
        frame(
          e.sheet,
          e.boss
              ? (e.type == 'human'
                    ? 'human_idle'
                    : e.type == 'wolf'
                    ? 'wolf_idle'
                    : 'idle')
              : 'idle',
          time: e.animTime,
        );
    final X = sx(e.x), Y = sy(e.y);
    final alpha =
        (e.dead ? clamp(1 - math.max(0, e.deathTime - .5) / .6, 0, 1) : 1) *
        e.alpha;
    if (alpha <= .02) return;
    final time = session.time, mid = Y - e.h * t * .5;
    if (e.boss) {
      glow(canvas, X, mid, t * (e.type == 'human' || e.type == 'wolf' ? 2 : 2.4), const Color(0xffc8283c), .24 * alpha);
    }
    if (e.burn > 0) glow(canvas, X, mid, t * 1.1, const Color(0xffff7828), .35 + (math.sin(time * 40) + 1) * .075);
    if (e.frozen > 0) glow(canvas, X, mid, t * 1.2, const Color(0xff8cdcff), .55);
    if (e.marked > 0) glow(canvas, X, mid, t * 1.1, const Color(0xff8cc8ff), .35);
    final p = session.player;
    if (e.type == 'mimic' && p.form == 'wolf' && (p.x - e.x).abs() < 6) {
      glow(canvas, X, Y - t * .4, t * 1.2, const Color(0xffff503c), .4);
    }
    anchored(
      canvas,
      e.sheet,
      fr,
      X,
      Y + t * .04,
      unit * t,
      flip: e.boss ? e.facing < 0 : e.facing > 0,
      alpha: alpha,
    );
    if (e.frozen > 0 && fr != null && pictures[e.sheet] != null) {
      // Icy sheen: the same frame drawn again, additively.
      canvas.saveLayer(null, Paint()..blendMode = BlendMode.plus);
      anchored(canvas, e.sheet, fr, X, Y + t * .04, unit * t, flip: e.boss ? e.facing < 0 : e.facing > 0, alpha: .35 * alpha);
      canvas.restore();
    }
    if (e.type == 'knight' && e.shield && e.cracked) {
      final list = sheets['FX_COMBAT']?['animations']['armor_crack'] as List?;
      final image = pictures['FX_COMBAT'];
      if (list != null && list.length > 3 && image != null) {
        final c = ((list[3] as Json)['content'] ?? (list[3] as Json)['source']) as Json;
        final kk = .9 * t / number(c['h']);
        _sprite.color = Colors.white.withValues(alpha: .85);
        final w = number(c['w']) * kk, h = number(c['h']) * kk;
        canvas.drawImageRect(
          image,
          rect(c),
          Rect.fromLTWH(X + e.facing * t * .45 - w / 2, Y - t * 1.05 - h / 2, w, h),
          _sprite,
        );
      }
    }
    if (e.boss && e.stun > 0) {
      for (var i = 0; i < 3; i++) {
        final a = time * 4 + i * math.pi * 2 / 3;
        glow(canvas, X + math.cos(a) * t * .55, Y - e.h * t - t * .3 + math.sin(a) * t * .15, t * .22, const Color(0xffffeeb4), .9);
      }
    }
    if (!e.dead && e.hp < e.maxHp) {
      final bounds = Rect.fromLTWH(
        sx(e.x) - t * .45,
        sy(e.y - e.h - .5),
        t * .9,
        4,
      );
      canvas.drawRect(bounds, Paint()..color = Colors.black54);
      canvas.drawRect(
        Rect.fromLTWH(
          bounds.left,
          bounds.top,
          bounds.width * e.hp / e.maxHp,
          4,
        ),
        Paint()..color = const Color(0xffc23a3a),
      );
    }
  }
}
