import 'dart:math' as math;

part 'enemy_ai.dart';
part 'boss_ai.dart';
part 'level_builder.dart';

typedef Json = Map<String, dynamic>;
dynamic _copyData(dynamic value) {
  if (value is Map) {
    return value.map((key, item) => MapEntry(key as String, _copyData(item)));
  }
  if (value is List) return value.map(_copyData).toList();
  return value;
}

double number(dynamic value, [double fallback = 0]) =>
    (value as num?)?.toDouble() ?? fallback;
double clamp(double v, double a, double b) => v.clamp(a, b).toDouble();
int direction(double v) => v < 0 ? -1 : 1;

class Actor {
  Actor(this.x, this.y, {this.w = .62, this.h = 1.5});
  double x, y, w, h, vx = 0, vy = 0;
  bool grounded = false, ceiling = false;
  int facing = 1, wall = 0, groundTile = 0;
  String? platform;
  bool overlaps(double cx, double cy, double width, double height) =>
      x - w / 2 < cx + width / 2 &&
      x + w / 2 > cx - width / 2 &&
      y - h < cy + height / 2 &&
      y > cy - height / 2;
}

class ActionState {
  ActionState(this.name, this.duration, {this.step = 0});
  final String name;
  final double duration;
  final int step;
  double time = 0;
  bool queued = false, done = false;
  final Set<String> hits = {};
  double get progress => time / duration;
}

class Hunter extends Actor {
  Hunter(super.x, super.y, this.maxHp) : hp = maxHp, safeX = x, safeY = y;
  int hp, maxHp, comboStep = 0;
  String form = 'human', baseForm = 'human', animation = 'human.idle';
  double invulnerable = 0,
      ulti = 0,
      eclipse = 0,
      coyote = 0,
      jumpBuffer = 0,
      drop = 0,
      comboTime = 0,
      comboEnd = 0,
      cooldown = 0,
      animTime = 0,
      animProgress = -1,
      fps = 6,
      safeX,
      safeY,
      skillHold = 0,
      grabCooldown = 0;
  bool airJumped = false, airBoost = false, reviveUsed = false, aiming = false;
  ActionState? action;
  Json? swing, hang, hook, thread;
  double slowTime = 0;
  double deadTime = 0;
  String? targetId;
  bool get dead => hp <= 0;
  void setForm(String value) {
    form = value;
    final dimensions = switch (value) {
      'wolf' => (1.05, .8),
      'eclipse' => (1.0, 2.1),
      _ => (.62, 1.5),
    };
    w = dimensions.$1;
    h = dimensions.$2;
  }
}

class Enemy extends Actor {
  Enemy(
    super.x,
    super.y, {
    required this.id,
    required this.type,
    required this.sheet,
    required this.hp,
    required this.maxHp,
    required this.definition,
    required this.fly,
    required super.w,
    required super.h,
    this.boss = false,
  });
  final String id, type;
  String sheet;
  final Json definition;
  final bool fly, boss;
  double hp,
      maxHp,
      timer = 0,
      cooldown = 1.6,
      stun = 0,
      marked = 0,
      burn = 0,
      frozen = 0,
      deathTime = 0,
      specialCooldown = 5,
      animTime = 0;
  String animation = 'idle';
  String state = 'idle', form = 'human';
  final Json memory = {};
  double animProgress = -1, animFps = 8, alpha = 1;
  bool shield = false, cracked = false, lantern = false, active = true;
  int specialIndex = 0;
  double homeX = 0, homeY = 0;
  bool get dead => hp <= 0;
}

class JourneySimulation {
  JourneySimulation(this.reference, {this.area = 0, this.skin = 1}) {
    restart();
  }
  final Json reference;
  int area, skin, score = 0, shards = 0, kills = 0, combo = 0, bestCombo = 0;
  late Json level;
  late Hunter player;
  final List<Enemy> enemies = [];
  Enemy? boss;
  final List<Json> platforms = [],
      lights = [],
      effects = [],
      shots = [],
      crumble = [],
      orbs = [];
  final Set<String> held = {}, events = {};
  double time = 0, comboTimer = 0, accumulator = 0, companionTimer = 0;

  /// Screen effects read by the renderer (hit flash, shake, fade-in on respawn).
  double hurtFlash = 0, shake = 0, respawnFade = .8;

  /// Glow on the hunter right after an energy orb is absorbed.
  double orbPulse = 0;

  /// Where the hunter fell, for the death burst.
  double deathX = 0, deathY = 0;
  bool paused = false, won = false, arenaLocked = false;
  bool endless = false;
  int endlessSeed = 1;
  double distance = 0;
  String toast = '';
  double toastTime = 0;
  final math.Random random = math.Random();
  final List<Json> formLog = [];
  Json? noise;
  late double checkpointX, checkpointY;
  void Function(String)? sound;
  Json get buffs => (reference['skins'] as List)[skin - 1]['b'] as Json;
  Json get areaDefinition => (reference['areas'] as List)[area] as Json;
  double tweak(String key) => number(reference['tweaks'][key]);
  int get cols => level['cols'] as int;
  int get rows => level['rows'] as int;
  List<Json> objects(String key) => (level[key] as List).cast<Json>();
  List<int> get tiles => (level['tiles'] as List).cast<int>();
  bool get over => won || (endless && player.dead && player.deadTime > 1.1);

  void restart() {
    level = endless
        ? buildEndless(endlessSeed)
        : _copyData(reference['levels'][area]) as Json;
    distance = 0;
    checkpointX = number(level['start']['x']);
    checkpointY = number(level['start']['y']);
    score = shards = kills = combo = bestCombo = 0;
    time = accumulator = comboTimer = companionTimer = 0;
    hurtFlash = shake = 0;
    respawnFade = .8;
    won = paused = arenaLocked = false;
    enemies.clear();
    platforms.clear();
    shots.clear();
    effects.clear();
    crumble.clear();
    orbs.clear();
    formLog.clear();
    formLog.add({'t': -10.0, 'form': 'human'});
    noise = null;
    respawn();
    for (final spec in objects('enemies')) {
      enemies.add(makeEnemy(spec, 'e${enemies.length}'));
    }
    final spec = level['boss'] as Json?;
    boss = null;
    if (spec != null) {
      final def =
          areaDefinition['bossDef'] as Json? ??
          <String, dynamic>{
            'hp': tweak('bossHealth'),
            'rig': 'human',
            'scale': 1.0,
            'speed': 5.0,
            'range': 2.4,
            'specials': ['charge', 'waves', 'summon'],
          };
      final rig = def['rig'];
      boss =
          Enemy(
              number(spec['x']),
              number(spec['y']),
              id: 'boss',
              type: rig,
              sheet: area == 0 ? 'BOSS_HUMAN' : def['sheet'],
              hp: number(def['hp']),
              maxHp: number(def['hp']),
              definition: def,
              fly: false,
              w: rig == 'wolf' ? 1.8 : .9,
              h: rig == 'wolf' ? 1.4 : 2.2,
              boss: true,
            )
            ..state = 'intro'
            ..active = false
            ..facing = -1;
    }
    message(areaDefinition['name'] as String);
  }

  Enemy makeEnemy(Json spec, String id) {
    final variant = (reference['variants'] as Json)[spec['type']] as Json?;
    final type = (variant?['base'] ?? spec['type']) as String;
    final stats = reference['enemyStats'][type] as Json;
    final hp =
        (number(variant?['hp'] ?? stats['hp']) *
                number(level['hpMul'], 1) *
                number(spec['hpMul'], 1) *
                2)
            .round() /
        2;
    final e =
        Enemy(
            number(spec['x']),
            number(spec['y']),
            id: id,
            type: type,
            sheet: variant?['sheet'] ?? 'ENEMY_${type.toUpperCase()}',
            hp: hp,
            maxHp: hp,
            definition: variant ?? {},
            fly: stats['fly'] == true,
            w: number(variant?['w'] ?? stats['w']),
            h: number(variant?['h'] ?? stats['h']),
          )
          ..facing = -1
          ..shield = spec['type'] == 'knight'
          ..lantern = type == 'lantern' && variant?['noLight'] != true;
    for (var i = 0; i < 24 && !e.fly && boxSolid(e.x, e.y, e.w, e.h); i++) {
      e.y -= 1;
    }
    e.homeX = e.x;
    e.homeY = e.y;
    e.memory['range'] = spec['range'] ?? 3;
    e.memory['variant'] = variant == null ? null : spec['type'];
    e.memory['split'] = spec['split'] == true;
    e.timer = random.nextDouble() * 3;
    e.cooldown = 1 + random.nextDouble() * 1.5;
    return e;
  }

  void equip(int value) {
    final oldMax = player.maxHp;
    skin = value.clamp(1, 10);
    player.maxHp = tweak('maxHearts').toInt() + (buffs['extraHeart'] as int);
    player.hp = math.min(
      player.maxHp,
      player.hp + math.max(0, player.maxHp - oldMax),
    );
    if (buffs['startUlti'] == true) player.ulti = 100;
  }

  void respawn() {
    final oldUlti = time > 0 ? player.ulti : 0.0;
    player = Hunter(
      checkpointX,
      checkpointY,
      tweak('maxHearts').toInt() + (buffs['extraHeart'] as int),
    );
    player.ulti = buffs['startUlti'] == true ? 100 : oldUlti;
    player.invulnerable = 1.3;
    respawnFade = 1;
    hurtFlash = 0;
    message('Bangkit di bawah bulan');
    paused = false;
    shots.clear();
    combo = 0;
    accumulator = 0;
    clearInput();
    // Arena deaths must reopen the entrance so the checkpoint remains playable.
    if (arenaLocked && boss?.dead == false) {
      final gate = (level['arena']['gateX'] as num).toInt();
      for (var y = 0; y < 14; y++) {
        setTile(gate, y, 0);
      }
      arenaLocked = false;
      boss!.active = false;
      boss!.hp = boss!.maxHp;
      boss!.x = number(level['boss']['x']);
      boss!.y = number(level['boss']['y']);
      boss!.state = 'intro';
      boss!.timer = 0;
      boss!.memory.clear();
      boss!.stun = 0;
      enemies.removeWhere((e) => e.x >= number(level['arena']['x0']) - 1);
    }
  }

  void message(String value) {
    toast = value;
    toastTime = 3.2;
  }

  void clearInput() {
    held.clear();
    events.clear();
    player.skillHold = 0;
    player.aiming = false;
  }

  void press(String key) {
    if (paused || over || player.dead) return;
    if (held.add(key)) {
      events.add(key);
      if (key == 'up') events.add('jump');
    }
  }

  void release(String key) {
    if (held.remove(key) && key == 'skill' && !paused && !over) {
      events.add('skillUp');
    }
  }

  int tile(int x, int y) => x < 0 || x >= cols
      ? 1
      : y < 0 || y >= rows
      ? 0
      : level['tiles'][y * cols + x] as int;
  bool solid(int x, int y) => const [1, 3, 4, 5].contains(tile(x, y));
  void setTile(int x, int y, int value) {
    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      level['tiles'][y * cols + x] = value;
    }
  }

  bool boxSolid(double x, double y, double w, double h) {
    for (var ty = (y - h + .01).floor(); ty <= (y - .01).floor(); ty++) {
      for (
        var tx = (x - w / 2 + .01).floor();
        tx <= (x + w / 2 - .01).floor();
        tx++
      ) {
        if (solid(tx, ty)) return true;
      }
    }
    return false;
  }

  /// Same tile units, substeps and one-way platform rules as the reference.
  void moveActor(
    Actor e,
    double dt, {
    bool drop = false,
    bool noPlatforms = false,
  }) {
    final wasGround = e.grounded;
    if (!noPlatforms && wasGround && e.platform != null) {
      for (final p in platforms) {
        if (p['id'] == e.platform) {
          e.x += number(p['dx']);
          e.y += number(p['dy']);
        }
      }
    }
    e.grounded = false;
    e.wall = 0;
    e.ceiling = false;
    e.groundTile = 0;
    e.platform = null;
    final steps = math.max(
      1,
      (math.max((e.vx * dt).abs(), (e.vy * dt).abs()) / .35).ceil(),
    );
    final step = dt / steps;
    for (var i = 0; i < steps; i++) {
      var nx = e.x + e.vx * step;
      if (e.vx != 0) {
        final dir = direction(e.vx),
            tx = (nx + direction(e.vx) * e.w / 2).floor();
        for (var y = (e.y - e.h + .04).floor(); y <= (e.y - .04).floor(); y++) {
          if (solid(tx, y)) {
            nx = dir > 0 ? tx - e.w / 2 - .001 : tx + 1 + e.w / 2 + .001;
            e.vx = 0;
            e.wall = dir;
            break;
          }
        }
      }
      e.x = nx;
      var ny = e.y + e.vy * step;
      final l = e.x - e.w / 2 + .04, r = e.x + e.w / 2 - .04;
      if (e.vy >= 0) {
        final row = ny.floor();
        if (e.y <= row + .0001 && ny >= row) {
          for (var x = l.floor(); x <= r.floor(); x++) {
            if (solid(x, row) || (tile(x, row) == 2 && !drop)) {
              ny = row.toDouble();
              e.vy = 0;
              e.grounded = true;
              e.groundTile = tile(x, row);
              break;
            }
          }
        }
        if (!noPlatforms && !e.grounded && !drop) {
          for (final p in platforms) {
            if (r < number(p['x']) || l > number(p['x']) + number(p['w'])) {
              continue;
            }
            if (e.y <= number(p['y']) + .06 && ny >= number(p['y'])) {
              ny = number(p['y']);
              e.vy = 0;
              e.grounded = true;
              e.platform = p['id'] as String;
              break;
            }
          }
        }
      } else {
        final head = (ny - e.h).floor();
        if (head < (e.y - e.h).floor()) {
          for (var x = l.floor(); x <= r.floor(); x++) {
            if (solid(x, head)) {
              ny = head + 1 + e.h + .001;
              e.vy = 0;
              e.ceiling = true;
              break;
            }
          }
        }
      }
      e.y = ny;
    }
    if (!noPlatforms && !e.grounded && wasGround && e.vy >= 0 && !drop) {
      for (final p in platforms) {
        if (e.x + e.w / 2 < number(p['x']) ||
            e.x - e.w / 2 > number(p['x']) + number(p['w'])) {
          continue;
        }
        if (e.y >= number(p['y']) - .02 && e.y <= number(p['y']) + .25) {
          e.y = number(p['y']);
          e.vy = 0;
          e.grounded = true;
          e.platform = p['id'];
          break;
        }
      }
    }
  }

  void update(double elapsed) {
    if (paused || over) {
      accumulator = 0;
      return;
    }
    // Split each display frame into equal steps of at most 1/60 s, like the
    // original loop. A fixed 1/60 accumulator alternates 0 and 2 steps per
    // frame on 90/120 Hz screens and on uneven frames, which reads as stutter.
    accumulator += clamp(elapsed, 0, .25);
    final n = (accumulator * 60 - 1e-6).ceil();
    if (n <= 0) return;
    final sub = math.min(1 / 60, accumulator / n);
    for (var i = 0; i < n; i++) {
      step(player.aiming ? sub / 4 : sub);
      if (over) break;
    }
    accumulator = over ? 0 : math.max(0, accumulator - sub * n);
  }

  void step(double dt) {
    time += dt;
    toastTime = math.max(0, toastTime - dt);
    hurtFlash = math.max(0, hurtFlash - dt);
    shake = math.max(0, shake - dt * 3);
    respawnFade = math.max(0, respawnFade - dt * 1.6);
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
    updateWorld(dt);
    updatePlayer(dt);
    // The world keeps moving while the hunter falls; respawn after 1.1 s.
    if (player.dead && player.deadTime > 1.1 && !endless) {
      respawn();
      return;
    }
    if (formLog.last['form'] != player.form && player.form != 'eclipse') {
      formLog.add({'t': time, 'form': player.form});
      if (formLog.length > 32) formLog.removeAt(0);
    }
    if (noise != null) noise!['t'] = number(noise!['t']) - dt;
    updateEnemies(dt);
    if (boss?.dead == true) {
      boss!.deathTime += dt;
      if (boss!.deathTime > 2.2 && !won) {
        won = true;
        score += math.max(0, (3000 - time * 5).round()) + shards * 100;
        clearInput();
      }
    }
    updateShots(dt);
    updatePickups(dt);
    if (endless) {
      final travelled = math.max(0.0, player.x - number(level['start']['x']));
      if (travelled > distance) {
        score += travelled.floor() - distance.floor();
        distance = travelled;
      }
    }
    for (final effect in effects) {
      effect['t'] = number(effect['t']) + dt;
    }
    effects.removeWhere((e) => number(e['t']) >= number(e['dur'], .35));
    if (buffs['spirit'] == true) {
      companionTimer -= dt;
      if (companionTimer <= 0) {
        final near = enemies
            .where((e) => !e.dead && (e.x - player.x).abs() < 5)
            .firstOrNull;
        if (near != null) {
          hitEnemy(near, 1.0, 'spirit');
          companionTimer = 1.2;
          fx('spirit_wolf', near.x, near.y - 1);
        }
      }
    }
  }

  void updateWorld(double dt) {
    for (final a in objects('altars')) {
      a['activeT'] = math.max(0, number(a['activeT']) - dt);
    }
    lights.clear();
    platforms.clear();
    for (final l in objects('lamps')) {
      lights.add({
        'x': l['x'],
        'y': l['y'],
        'ang':
            number(l['base']) +
            math.sin(time * math.pi * 2 / number(l['period'])) *
                number(l['amp']),
        'half': .2,
        'len': 11.0,
        'kind': 'lamp',
      });
    }
    for (final e in enemies.where((e) => !e.dead && e.lantern)) {
      lights.add({
        'x': e.x + e.facing * .5,
        'y': e.y - 1.15,
        'ang': e.facing > 0 ? .32 : math.pi - .32,
        'half': .42,
        'len': 6.5,
        'kind': 'lantern',
      });
    }
    bool active(dynamic id) =>
        objects('altars').any((a) => a['id'] == id && number(a['activeT']) > 0);
    bool lit(double x, double y) => lights.any((l) {
      final dx = x - number(l['x']), dy = y - number(l['y']);
      var angle = math.atan2(dy, dx) - number(l['ang']);
      while (angle > math.pi) {
        angle -= 2 * math.pi;
      }
      while (angle < -math.pi) {
        angle += 2 * math.pi;
      }
      return math.sqrt(dx * dx + dy * dy) <= number(l['len']) &&
          angle.abs() <= number(l['half']);
    });
    for (final s in objects('shadows')) {
      final n = math.max(1, number(s['w']).round()), width = number(s['w']) / n;
      final mask = List<bool>.filled(n, false);
      s['litMask'] = mask;
      for (var i = 0; i < n; i++) {
        final x = number(s['x']) + width * i, y = number(s['y']);
        mask[i] = active(s['altar']) && lit(x + width / 2, y);
        if (active(s['altar']) && !lit(x + width / 2, y)) {
          platforms.add({
            'id': '${s['id']}_$i',
            'x': x,
            'y': y,
            'w': width + .001,
          });
        }
      }
    }
    for (final w in objects('wheels')) {
      w['ang'] = number(w['ang']) + .7 * dt;
      for (var i = 0; i < 4; i++) {
        final a = number(w['ang']) + i * math.pi / 2, r = number(w['r']);
        final x = number(w['cx']) + math.cos(a) * r,
            y = number(w['cy']) + math.sin(a) * r;
        (w['lit'] as List)[i] = active(w['altar']) && lit(x, y);
        if (active(w['altar']) && !lit(x, y)) {
          platforms.add({
            'id': '${w['id']}_$i',
            'x': x - .9,
            'y': y,
            'w': 1.8,
            'dx': (math.cos(a) - math.cos(a - .7 * dt)) * r,
            'dy': (math.sin(a) - math.sin(a - .7 * dt)) * r,
          });
        }
      }
    }
    for (final c in crumble) {
      c['t'] = number(c['t']) - dt;
      if (number(c['t']) <= 0) breakColumn(c['x'] as int, c['y'] as int, 3);
    }
    crumble.removeWhere((c) => number(c['t']) <= 0);
    final arena = level['arena'] as Json?;
    if (arena != null &&
        !arenaLocked &&
        boss?.dead == false &&
        player.x > number(arena['trigger'])) {
      arenaLocked = true;
      boss!.active = true;
      for (var y = 0; y < 14; y++) {
        setTile((arena['gateX'] as num).toInt(), y, 5);
      }
      message(areaDefinition['boss']);
      sound?.call('gate');
    }
  }

  void breakColumn(int x, int y, int kind) {
    while (y > 0 && tile(x, y - 1) == kind) {
      y--;
    }
    while (tile(x, y) == kind) {
      setTile(x, y, 0);
      y++;
    }
  }

  void fx(String name, double x, double y, {double scale = 1}) => effects.add({
    'name': name,
    'x': x,
    'y': y,
    'scale': scale,
    't': 0.0,
    'dur': .35,
  });
  void act(String name, double duration, {int step = 0}) {
    player.action = ActionState(name, duration, step: step);
    if (name != 'hurt') noise = {'x': player.x, 'y': player.y, 't': 2.0};
  }

  void gain(double amount) {
    if (player.eclipse <= 0) {
      player.ulti = math.min(
        100,
        player.ulti + amount * tweak('ultiGain') * number(buffs['ultiRate'], 1),
      );
    }
  }

  void transform() {
    final p = player;
    if (p.eclipse > 0 ||
        p.dead ||
        const ['hurt', 'howl'].contains(p.action?.name)) {
      return;
    }
    final human = p.form == 'human';
    if (!human && boxSolid(p.x, p.y, .62, 1.5)) {
      message('Terlalu sempit');
      return;
    }
    if (p.swing != null) releaseSwing();
    p.hang = null;
    p.setForm(human ? 'wolf' : 'human');
    if (p.comboEnd > 0) {
      act(human ? 'lunge' : 'rising', human ? .26 : .36);
      p.vx = p.facing * 15;
      p.vy = human ? 0 : -10;
      message('Sambungan!');
    } else if (human && !p.grounded && !p.airBoost) {
      p.airBoost = true;
      p.vx = p.facing * 13;
      p.vy = math.min(p.vy, -3);
      act('transform', .16);
    } else if (human && p.grounded && p.vx.abs() > 2.5) {
      act('dash', .22);
    } else {
      act(human ? 'transform' : 'untransform', .2);
    }
    p.comboStep = 0;
    p.comboEnd = 0;
    fx('moon_burst', p.x, p.y - .7);
    sound?.call('transform');
  }

  void attack() {
    final p = player;
    if (p.form == 'human' && p.thread != null) {
      final enemy = enemies.where((e) => e.id == p.thread!['id']).firstOrNull;
      if (enemy != null) {
        enemy.stun = 2.2;
        enemy.cooldown = 3.5;
      }
      p.thread = null;
      sound?.call('snap');
    }
    if (p.hang != null || p.hook != null) return;
    if (p.swing != null) {
      releaseSwing();
      return;
    }
    if (p.action != null) {
      if (p.action!.progress > .4) p.action!.queued = true;
      return;
    }
    final chain = p.form == 'human'
        ? ['slash1', 'slash2', 'slash3']
        : p.form == 'wolf'
        ? ['claw', 'bite', 'slam']
        : ['eclipseClaw'];
    final step = p.comboTime > 0 ? p.comboStep % chain.length : 0;
    final name = chain[step];
    act(name, switch (name) {
      'slash3' || 'slam' => .42,
      'claw' => .26,
      'eclipseClaw' => .38,
      _ => .3,
    }, step: step);
    p.comboStep = step + 1;
    if (p.grounded) p.vx = p.facing * (step == 2 ? 4 : 2.5);
    sound?.call('attack');
    fx(
      p.form == 'human' ? 'slash' : 'claw',
      p.x + p.facing,
      p.y - .8,
      scale: .75,
    );
  }

  List<Json> targets() {
    final p = player, list = <Json>[];
    void add(String id, double x, double y, double range, String kind) {
      final dx = x - p.x,
          dy = y - (p.y - p.h * .6),
          d = math.sqrt(dx * dx + dy * dy);
      if (d > range || d < .5) return;
      list.add({
        'id': id,
        'x': x,
        'y': y,
        'kind': kind,
        'score':
            d +
            (direction(dx) != p.facing && dx.abs() > .6 ? 4 : 0) +
            dy.abs() * .3,
      });
    }

    if (p.form == 'human') {
      for (final r in objects('rings')) {
        add(r['id'], number(r['x']), number(r['y']), 7.5, 'ring');
      }
    }
    for (final e in [
      ...enemies,
      if (boss?.active == true) boss!,
    ].where((e) => !e.dead)) {
      add(
        e.id,
        e.x,
        e.y - e.h * .55,
        p.form == 'human'
            ? 7.5
            : e.marked > 0
            ? 9.5
            : 5.5,
        'enemy',
      );
    }
    list.sort((a, b) => number(a['score']).compareTo(number(b['score'])));
    return list;
  }

  void skill() {
    final p = player;
    if (p.swing != null || p.hook != null || p.hang != null) return;
    if (p.action != null &&
        !const [
          'transform',
          'untransform',
          'dash',
          'lunge',
        ].contains(p.action!.name)) {
      return;
    }
    if (p.form == 'eclipse') {
      act('eclipseSlam', .55);
      if (!p.grounded) p.vy = 18;
      return;
    }
    final altar = objects('altars')
        .where(
          (a) =>
              (number(a['x']) - p.x).abs() < 1.1 &&
              (number(a['y']) - p.y).abs() < .7,
        )
        .firstOrNull;
    if (p.form == 'wolf' && altar != null) {
      act('howl', .9);
      sound?.call('howl');
      return;
    }
    if (p.cooldown > 0) return;
    final candidates = targets();
    final target =
        candidates.where((t) => t['id'] == p.targetId).firstOrNull ??
        candidates.firstOrNull;
    if (p.form == 'wolf') {
      var duration = .36;
      p.vx = p.facing * 13;
      p.vy = -6;
      if (target != null) {
        final dx = number(target['x']) - p.x,
            dy = number(target['y']) + .3 - (p.y - .4);
        duration = clamp(math.sqrt(dx * dx + dy * dy) / 17, .16, .5);
        p.vx = dx / duration;
        p.vy = dy / duration;
        p.facing = direction(dx);
      }
      act('pounce', duration);
      p.grounded = false;
      p.cooldown = .9;
      sound?.call('pounce');
    } else {
      act('hook', .3);
      p.cooldown = .45;
      sound?.call('hook');
      if (target != null) p.hook = {...target, 't': 0.0};
    }
  }

  void releaseSwing() {
    final p = player, s = p.swing;
    if (s == null) return;
    final a = number(s['ang']), v = number(s['vel']) * number(s['len']);
    p.vx = math.cos(a) * v * 1.12;
    p.vy = -math.sin(a) * v * 1.12 - 5;
    if (p.vx.abs() < 5) p.vx = p.facing * 6;
    p.swing = null;
    p.airBoost = false;
    p.jumpBuffer = 0;
    sound?.call('jump');
  }

  void ultimate() {
    final p = player;
    if (p.ulti < 100 || p.eclipse > 0 || boxSolid(p.x, p.y, 1, 2.1)) return;
    p.baseForm = p.form;
    p.setForm('eclipse');
    p.eclipse = tweak('ultiDuration') * number(buffs['eclipseMult'], 1);
    p.ulti = 0;
    p.invulnerable = math.max(p.invulnerable, .6);
    p.action = null;
    p.hang = p.swing = p.hook = null;
    fx('moon_burst', p.x, p.y - 1.2, scale: 2);
    message('ECLIPSE');
    sound?.call('ulti');
  }

  void updatePlayer(double dt) {
    final p = player;
    if (p.dead) {
      p.deadTime += dt;
      p.vx *= .9;
      p.vy = math.min(p.vy + 38 * dt, 20);
      moveActor(p, dt);
      animate(
        p.form == 'human'
            ? 'human.hurt'
            : p.form == 'wolf'
            ? 'wolf.hurt'
            : 'eclipse.idle',
        dt,
        progress: .99,
      );
      return;
    }
    p.slowTime = math.max(0, p.slowTime - dt);
    if (p.thread != null) {
      p.thread!['t'] = number(p.thread!['t']) - dt;
      final enemy = enemies
          .where((e) => e.id == p.thread!['id'] && !e.dead)
          .firstOrNull;
      if (enemy == null ||
          number(p.thread!['t']) <= 0 ||
          (enemy.x - p.x).abs() > 11)
        p.thread = null;
    }
    p.invulnerable = math.max(0, p.invulnerable - dt);
    p.coyote = math.max(0, p.coyote - dt);
    p.jumpBuffer = math.max(0, p.jumpBuffer - dt);
    p.drop = math.max(0, p.drop - dt);
    p.comboTime = math.max(0, p.comboTime - dt);
    p.comboEnd = math.max(0, p.comboEnd - dt);
    p.cooldown = math.max(0, p.cooldown - dt);
    p.grabCooldown = math.max(0, p.grabCooldown - dt);
    if (p.eclipse > 0) {
      p.eclipse -= dt;
      if (p.eclipse <= 0) {
        p.setForm(
          p.baseForm == 'human' && !boxSolid(p.x, p.y, .62, 1.5)
              ? 'human'
              : 'wolf',
        );
        p.action = null;
        shots.add({
          'x': p.x,
          'y': p.y - .7,
          'vx': p.facing * 17.0,
          'vy': 0.0,
          't': 0.0,
          'friendly': true,
          'kind': 'spirit',
          'ids': <String>{},
        });
        fx('moon_burst', p.x, p.y - .8);
        sound?.call('spirit');
      }
    }
    final pressed = Set<String>.from(events);
    events.clear();
    if (pressed.contains('jump')) p.jumpBuffer = .14;
    final dir =
        (held.contains('right') ? 1 : 0) - (held.contains('left') ? 1 : 0);
    if (pressed.contains('skill')) p.skillHold = .0001;
    if (p.skillHold > 0) {
      p.skillHold += 1 / 60;
      if (p.skillHold > .22 && p.form != 'eclipse') p.aiming = true;
    }
    final options = targets();
    if (!p.aiming || !options.any((t) => t['id'] == p.targetId)) {
      p.targetId = options.firstOrNull?['id'];
    }
    if (p.aiming &&
        options.isNotEmpty &&
        (pressed.contains('left') || pressed.contains('right'))) {
      options.sort((a, b) => number(a['x']).compareTo(number(b['x'])));
      final index = options.indexWhere((t) => t['id'] == p.targetId);
      p.targetId =
          options[(index + (pressed.contains('left') ? -1 : 1)) %
              options.length]['id'];
    }
    if (pressed.contains('skillUp')) {
      p.skillHold = 0;
      p.aiming = false;
      skill();
    }
    if (pressed.contains('transform')) transform();
    if (pressed.contains('ulti')) ultimate();
    if (pressed.contains('attack')) attack();
    if (p.hang != null) {
      final h = p.hang!;
      if (p.jumpBuffer > 0) {
        p.x =
            number(h['tx']) +
            (p.facing > 0 ? p.w / 2 + .08 : 1 - p.w / 2 - .08);
        p.y = number(h['top']);
        p.hang = null;
        p.jumpBuffer = 0;
        p.grounded = true;
      } else if (pressed.contains('down') || dir == -p.facing) {
        p.hang = null;
        p.grabCooldown = .35;
        p.vy = 1;
      } else {
        animate('human.hang', dt, fps: 6);
        return;
      }
    }
    if (p.hook != null) {
      final h = p.hook!;
      h['t'] = number(h['t']) + dt;
      if (number(h['t']) > .16) {
        if (h['kind'] == 'ring') {
          final dx = p.x - number(h['x']), dy = p.y - p.h * .9 - number(h['y']);
          p.swing = {
            'x': h['x'],
            'y': h['y'],
            'len': clamp(math.sqrt(dx * dx + dy * dy), 1.8, 3),
            'ang': math.atan2(dx, dy),
            'vel': p.facing * 2.5,
            't': 0.0,
          };
          p.action = null;
        } else {
          final e = [
            ...enemies,
            ?boss,
          ].where((e) => e.id == h['id'] && !e.dead).firstOrNull;
          if (e != null) {
            if (e.lantern) {
              e.lantern = false;
              e.stun = 1.6;
              gain(8);
              message('Lentera direbut!');
            } else if (e.shield && e.cracked) {
              e.shield = false;
              e.stun = 1.4;
              score += 50;
              gain(10);
              message('Perisai dicopot!');
            } else if (e.boss || e.shield) {
              p.vx = direction(e.x - p.x) * 20;
              p.vy = -3;
            } else {
              e.x = p.x + p.facing * 1.1;
              hitEnemy(e, 1, 'hook');
              e.stun = 1;
            }
          }
        }
        p.hook = null;
      }
    }
    if (p.swing != null) {
      final s = p.swing!, len = number(p.swing!['len']);
      s['t'] = number(s['t']) + dt;
      s['vel'] =
          (number(s['vel']) +
              (-38 / len * math.sin(number(s['ang'])) * .85 + dir * 3.2) * dt) *
          (1 - .15 * dt);
      s['ang'] = clamp(number(s['ang']) + number(s['vel']) * dt, -1.45, 1.45);
      final nx = number(s['x']) + math.sin(number(s['ang'])) * len,
          ny = number(s['y']) + math.cos(number(s['ang'])) * len + p.h * .9;
      if (boxSolid(nx, ny, p.w, p.h)) {
        p.swing = null;
        p.vx = p.vy = 0;
      } else {
        p.x = nx;
        p.y = ny;
        p.facing = direction(number(s['vel']));
      }
      if (p.jumpBuffer > 0 || number(s['t']) > 3.2) {
        releaseSwing();
      } else if (p.swing != null) {
        animate('human.fall', dt, fps: 8);
        return;
      }
    }
    final a = p.action;
    if (a != null) {
      a.time += dt;
      if (a.name == 'howl' && a.progress > .35 && !a.done) {
        a.done = true;
        for (final altar in objects('altars')) {
          if ((number(altar['x']) - p.x).abs() < 1.1) {
            altar['activeT'] = tweak('shadowDuration');
            gain(5);
            fx('howl_rings', p.x, p.y - 1.2);
            message('Bayangan bangkit!');
          }
        }
      }
      resolveAttack(a);
      if (a.name == 'dash' || a.name == 'lunge') {
        p.vx = p.facing * (a.name == 'dash' ? 16 : 15);
        p.vy = 0;
      }
      if (a.progress >= 1) {
        p.action = null;
        if (const [
          'slash1',
          'slash2',
          'slash3',
          'claw',
          'bite',
          'slam',
          'eclipseClaw',
        ].contains(a.name)) {
          p.comboTime = .35;
          if (a.step == 2) {
            p.comboEnd = .45;
            p.comboStep = 0;
          }
          if (a.queued) attack();
        }
      }
    }
    final name = p.action?.name;
    final owned = const ['dash', 'lunge', 'pounce'].contains(name);
    final locked =
        const [
          'slash1',
          'slash2',
          'slash3',
          'claw',
          'bite',
          'slam',
          'eclipseClaw',
          'eclipseSlam',
          'hook',
          'howl',
        ].contains(name) &&
        (p.grounded || name == 'howl');
    final crawl =
        p.form == 'wolf' &&
        (solid(p.x.floor(), (p.y - 1.25).floor()) || held.contains('down'));
    final speed =
        (p.form == 'human'
            ? tweak('humanSpeed')
            : p.form == 'wolf'
            ? tweak('wolfSpeed')
            : 7.5) *
        number(buffs['speed'], 1) *
        (crawl ? .65 : 1) *
        (p.thread != null ? .45 : 1) *
        (p.slowTime > 0 ? .55 : 1);
    if (!owned) {
      if (!locked && name != 'hurt') {
        final target = (p.aiming ? 0 : dir) * speed,
            amount = (p.grounded ? 70 : 38) * dt;
        p.vx = p.vx < target
            ? math.min(target, p.vx + amount)
            : math.max(target, p.vx - amount);
        if (dir != 0 && !p.aiming) p.facing = dir;
      } else if (p.grounded) {
        p.vx *= math.pow(.0005, dt);
      }
    }
    final jumpV = math.sqrt(
      2 *
          38 *
          tweak('jumpHeight') *
          (p.form == 'wolf'
              ? 1.18
              : p.form == 'eclipse'
              ? 1.4
              : 1),
    );
    if (p.jumpBuffer > 0 &&
        (p.grounded || p.coyote > 0) &&
        !locked &&
        !owned &&
        name != 'hurt') {
      if (held.contains('down') && p.groundTile == 2) {
        p.drop = .25;
        p.jumpBuffer = 0;
      } else if (!crawl || !solid(p.x.floor(), (p.y - p.h - .2).floor())) {
        p.vy = -jumpV;
        p.grounded = false;
        p.coyote = 0;
        p.jumpBuffer = 0;
        p.airBoost = false;
        sound?.call('jump');
      }
    } else if (pressed.contains('jump') &&
        !p.grounded &&
        buffs['doubleJump'] == true &&
        !p.airJumped &&
        !locked &&
        !owned) {
      p.airJumped = true;
      p.jumpBuffer = 0;
      p.vy = -jumpV * .92;
      sound?.call('jump');
    }
    if (pressed.contains('down') && p.grounded && p.groundTile == 2) {
      p.drop = .25;
    }
    if (!owned) {
      p.vy = math.min(
        22,
        p.vy +
            38 *
                dt *
                (p.vy < 0 && !held.contains('jump') && !held.contains('up')
                    ? 2.2
                    : 1),
      );
    }
    moveActor(p, dt, drop: p.drop > 0);
    if (p.grounded) {
      p.coyote = .1;
      p.airJumped = false;
      p.airBoost = false;
      if (p.groundTile == 3 && !crumble.any((c) => c['x'] == p.x.floor())) {
        crumble.add({'x': p.x.floor(), 'y': p.y.floor(), 't': .45});
      }
      if (p.groundTile == 1 &&
          solid((p.x - 1.4).floor(), (p.y + .1).floor()) &&
          solid((p.x + 1.4).floor(), (p.y + .1).floor())) {
        p.safeX = p.x;
        p.safeY = p.y;
      }
    }
    if (p.form == 'human' &&
        !p.grounded &&
        p.vy > 0 &&
        p.grabCooldown <= 0 &&
        p.action == null) {
      final tx = (p.x + p.facing * (p.w / 2 + .2)).floor(), hand = p.y - p.h;
      for (var ty = (hand - .45).floor(); ty <= (hand + .45).floor(); ty++) {
        if ((ty - hand).abs() > .45 ||
            !solid(tx, ty) ||
            solid(tx, ty - 1) ||
            solid(tx, ty - 2)) {
          continue;
        }
        final x = p.facing > 0 ? tx - p.w / 2 - .02 : tx + 1 + p.w / 2 + .02;
        if (!boxSolid(x, ty + p.h * .95, p.w, p.h)) {
          p.hang = {'tx': tx, 'top': ty};
          p.x = x;
          p.y = ty + p.h * .95;
          p.vx = p.vy = 0;
          break;
        }
      }
    }
    if (p.y > rows + 2.5) {
      p.invulnerable = 0;
      damage(1, p.x);
      if (!p.dead) {
        p.x = p.safeX;
        p.y = p.safeY - .05;
        p.vx = p.vy = 0;
        p.invulnerable = 1.3;
        p.action = null;
        message('Jatuh!');
      }
    }
    final current = p.action;
    if (current != null) {
      final anim = switch (current.name) {
        'transform' => 'human.transform',
        'untransform' => 'human.untransform',
        'dash' || 'lunge' || 'pounce' => 'wolf.pounce',
        'rising' => 'human.slash2',
        'aerial' => 'human.slash3',
        'eclipseClaw' => 'eclipse.claw',
        'eclipseSlam' => 'eclipse.slam',
        _ => '${p.form}.${current.name}',
      };
      animate(anim, dt, progress: clamp(current.progress, 0, .999));
    } else if (p.hang != null) {
      animate('human.hang', dt);
    } else if (!p.grounded) {
      animate(
        '${p.form}.${p.form == 'eclipse'
            ? 'run'
            : p.form == 'wolf' || p.vy < 0
            ? 'jump'
            : 'fall'}',
        dt,
        progress: p.form == 'wolf' ? .5 : -1,
      );
    } else {
      animate(
        '${p.form}.${crawl
            ? 'crawl'
            : p.vx.abs() > .6
            ? 'run'
            : 'idle'}',
        dt,
        fps: p.vx.abs() > .6 ? (p.form == 'wolf' ? 14 : 12) : 6,
      );
    }
  }

  void animate(String key, double dt, {double progress = -1, double fps = 10}) {
    player.animTime = player.animation == key ? player.animTime + dt : 0;
    player.animation = key;
    player.animProgress = progress;
    player.fps = fps;
  }

  void resolveAttack(ActionState a) {
    final p = player;
    final spec = switch (a.name) {
      'slash1' || 'slash2' => (.25, .6, .95, -.85, 1.8, 1.6, 1.0),
      'slash3' => (.3, .65, 1.0, -.9, 2.1, 1.9, 1.5),
      'claw' => (.25, .6, 1.0, -.45, 1.7, 1.2, 1.0),
      'bite' => (.3, .6, 1.05, -.45, 1.5, 1.1, 1.2),
      'slam' => (.45, .72, .8, -.5, 2.6, 1.5, 1.8),
      'eclipseClaw' => (.3, .65, 1.5, -1.2, 3.4, 2.8, 2.2),
      'eclipseSlam' => (
        .5,
        .78,
        0.0,
        -.6,
        buffs['wideSlam'] == true ? 24.0 : 7.5,
        buffs['wideSlam'] == true ? 6.0 : 2.0,
        3.0,
      ),
      'pounce' || 'lunge' => (0.0, 1.0, .6, -.45, 1.7, 1.2, 2.0),
      'dash' => (0.0, 1.0, .5, -.45, 1.5, 1.0, 1.0),
      'rising' => (.05, .6, .6, -1.4, 2.0, 2.8, 2.0),
      _ => null,
    };
    if (spec == null || a.progress < spec.$1 || a.progress > spec.$2) return;
    final x = p.x + p.facing * spec.$3,
        y = p.y + spec.$4,
        w = spec.$5,
        h = spec.$6;
    for (final e in [...enemies, if (boss?.active == true) boss!]) {
      if (e.dead || a.hits.contains(e.id) || !e.overlaps(x, y, w, h)) continue;
      a.hits.add(e.id);
      hitEnemy(e, spec.$7, a.name);
    }
    if (p.form == 'human') {
      for (final l in objects('levers')) {
        if (l['on'] == true ||
            (number(l['x']) - x).abs() > w / 2 + .4 ||
            number(l['y']) < y - h / 2 ||
            number(l['y']) - 1 > y + h / 2) {
          continue;
        }
        l['on'] = true;
        final g = l['gate'];
        for (
          var yy = (g['y'] as num).toInt();
          yy < number(g['y']) + number(g['h']);
          yy++
        ) {
          setTile((g['x'] as num).toInt(), yy, 0);
        }
        sound?.call('lever');
      }
      for (final s in shots.where((s) => s['friendly'] != true)) {
        if ((number(s['x']) - x).abs() < w / 2 &&
            (number(s['y']) - y).abs() < h / 2) {
          s['friendly'] = true;
          s['vx'] = p.facing * 18.0;
          s['vy'] = 0.0;
          gain(6);
          sound?.call('deflect');
        }
      }
    }
    if (p.form != 'human' || a.name == 'slash3') {
      for (var xx = (x - w / 2).floor(); xx <= (x + w / 2).floor(); xx++) {
        for (var yy = (y - h / 2).floor(); yy <= (y + h / 2).floor(); yy++) {
          if (tile(xx, yy) == 4 ||
              (a.name == 'eclipseSlam' && tile(xx, yy) == 3)) {
            breakColumn(xx, yy, tile(xx, yy));
            sound?.call('break');
          }
        }
      }
    }
  }

  void hitEnemy(Enemy e, double amount, String kind, {bool chain = true}) {
    final p = player;
    if (e.dead) return;
    if (e.boss) {
      bossHit(e, amount, kind);
      return;
    }
    if (p.thread?['id'] == e.id && kind != 'spirit' && kind != 'lightning') {
      message('Putus benangnya dulu');
      return;
    }
    if (e.type == 'mimic' && e.memory['revealed'] != true) {
      e.memory['revealed'] = true;
      e.state = 'reveal';
      e.timer = 0;
    }
    if (e.shield) {
      if (const ['bite', 'lunge', 'eclipseClaw'].contains(kind)) {
        e.cracked = true;
      }
      if (direction(p.x - e.x) == e.facing &&
          kind != 'eclipseSlam' &&
          kind != 'lightning' &&
          kind != 'spirit') {
        sound?.call('deflect');
        return;
      }
    }
    if (kind == 'pounce' && e.marked > 0) {
      amount += 1.5;
      e.marked = 0;
      gain(18);
    }
    final hits = const ['spirit', 'lightning', 'burn'].contains(kind)
        ? 1
        : (buffs['hits'] as int);
    for (var i = 0; i < hits && !e.dead; i++) {
      e.hp -= amount;
      combo++;
      comboTimer = 2.4;
      bestCombo = math.max(bestCombo, combo);
      score += 10 * math.min(combo, 30);
      gain(e.boss ? 3 : 4);
    }
    if (kind == 'slash3' || kind == 'rising') e.marked = 8;
    if (buffs['burn'] == true && kind != 'burn') e.burn = 3;
    if (buffs['freeze'] == true) e.frozen = kind == 'hook' ? 2.5 : .9;
    e.stun = .3;
    e.vx = p.facing * 3;
    if (kind == 'slam' || kind == 'rising') e.vy = -7;
    fx('hit_spark', e.x, e.y - e.h * .6, scale: .7);
    sound?.call('hit');
    if (buffs['lightning'] == true &&
        chain &&
        const ['pounce', 'dash', 'lunge', 'eclipseSlam'].contains(kind)) {
      for (final other
          in enemies
              .where((o) => o != e && !o.dead && (o.x - e.x).abs() < 6)
              .take(3)
              .toList()) {
        hitEnemy(other, 1.5, 'lightning', chain: false);
      }
    }
    if (e.definition['splits'] == true &&
        e.memory['split'] != true &&
        !e.dead) {
      e.memory['split'] = true;
      enemies.add(
        makeEnemy({
          'type': e.memory['variant'],
          'x': e.x - p.facing * 1.2,
          'y': e.y,
          'hpMul': .34,
          'split': true,
        }, 'split${time}_${enemies.length}'),
      );
    }
    if (e.dead) killEnemy(e);
  }

  void damage(int amount, double fromX) {
    final p = player;
    if (p.invulnerable > 0 || p.dead || over) return;
    p.hp -= amount;
    p.invulnerable = 1.1;
    hurtFlash = .35;
    shake = math.max(shake, .8);
    p.vx = direction(p.x - fromX) * 7;
    p.vy = -6;
    p.grounded = false;
    p.swing = p.hang = p.hook = null;
    combo = 0;
    if (p.form != 'eclipse') act('hurt', .32);
    sound?.call('hurt');
    if (p.hp <= 0 && buffs['revive'] == true && !p.reviveUsed) {
      p.hp = 2;
      p.reviveUsed = true;
      p.invulnerable = 2.2;
      message('Roh leluhur membangkitkanmu!');
    }
    if (p.hp <= 0) {
      p.hp = 0;
      deathX = p.x;
      deathY = p.y - p.h * .5;
      shake = 1.4;
      clearInput();
      sound?.call('death');
    }
  }

  void updatePickups(double dt) {
    final p = player;
    for (final shard in objects('shards')) {
      if (shard['taken'] == true) continue;
      if ((number(shard['x']) - p.x).abs() < .8 &&
          number(shard['y']) > p.y - p.h - .4 &&
          number(shard['y']) - .6 < p.y + .2) {
        shard['taken'] = true;
        shards++;
        score += 50;
        gain(10);
        sound?.call('pickup');
        fx('shard_sparkle', number(shard['x']), number(shard['y']) - .5);
        if (endless && shards % 10 == 0) p.hp = math.min(p.maxHp, p.hp + 1);
      }
    }
    for (final cp in objects('checkpoints')) {
      if (cp['on'] == true ||
          (number(cp['x']) - p.x).abs() > 1 ||
          (number(cp['y']) - p.y).abs() > 2.5) {
        continue;
      }
      cp['on'] = true;
      checkpointX = number(cp['x']);
      checkpointY = number(cp['y']);
      p.hp = p.maxHp;
      p.reviveUsed = false;
      sound?.call('checkpoint');
      message(cp['name']);
    }
    for (final hint in objects('hints')) {
      if (hint['shown'] != true && p.x >= number(hint['x'])) {
        hint['shown'] = true;
        message(hint['text']);
      }
    }
    orbPulse = math.max(0, orbPulse - dt);
    for (final orb in orbs) {
      final t = number(orb['t']) + dt;
      orb['t'] = t;
      var x = number(orb['x']), y = number(orb['y']);
      var vx = number(orb['vx']), vy = number(orb['vy']);
      // Pop out of the enemy, hang for a beat, then home in on the hunter with
      // a sideways swirl that tightens as it gets closer.
      final dx = p.x - x, dy = p.y - .8 - y;
      final d = math.max(.001, math.sqrt(dx * dx + dy * dy));
      if (t < .35 || p.dead) {
        vy += 14 * dt;
        vx *= math.pow(.02, dt).toDouble();
      } else {
        final pull = 38 + t * 30;
        vx += (dx / d * pull - dy / d * 9) * dt;
        vy += (dy / d * pull + dx / d * 9) * dt;
        final speed = math.sqrt(vx * vx + vy * vy), max = 9 + t * 8;
        if (speed > max) {
          vx *= max / speed;
          vy *= max / speed;
        }
      }
      x += vx * dt;
      y += vy * dt;
      orb
        ..['x'] = x
        ..['y'] = y
        ..['vx'] = vx
        ..['vy'] = vy;
      final trail = (orb['trail'] ??= <List<double>>[]) as List;
      trail.insert(0, [x, y]);
      if (trail.length > 9) trail.removeLast();
      if (!p.dead && t > .35 && d < .55) {
        gain(8);
        orb['t'] = 99.0;
        orbPulse = .35;
        fx('shard_sparkle', p.x, p.y - .8, scale: .7);
        sound?.call('orb');
      }
    }
    orbs.removeWhere((o) => number(o['t']) > 15);
  }
}
