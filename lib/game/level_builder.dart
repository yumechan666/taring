part of 'simulation.dart';

/// Mulberry32 with explicit 32-bit multiplication on both Dart VM and web.
class JourneyRandom {
  JourneyRandom(this.seed);
  int seed;
  int multiply(int a, int b) =>
      (((a & 65535) * (b & 65535)) +
          ((((a >>> 16) * (b & 65535) + (a & 65535) * (b >>> 16)) & 65535) <<
              16)) &
      0xffffffff;
  double next() {
    seed = (seed + 0x6d2b79f5) & 0xffffffff;
    var t = multiply(seed ^ (seed >>> 15), seed | 1);
    t = (t ^ ((t + multiply(t ^ (t >>> 7), t | 61)) & 0xffffffff)) & 0xffffffff;
    return ((t ^ (t >>> 14)) & 0xffffffff) / 4294967296;
  }

  T pick<T>(List<T> values) => values[(next() * values.length).floor()];
}

class LevelBuilder {
  LevelBuilder(int cols)
    : level = {
        'cols': cols,
        'rows': 18,
        'tiles': List<int>.filled(cols * 18, 0),
        'theme': List<int>.filled(cols, 0),
        for (final key in [
          'altars',
          'shadows',
          'wheels',
          'rings',
          'levers',
          'shards',
          'checkpoints',
          'decor',
          'lamps',
          'hints',
          'enemies',
          'sections',
        ])
          key: <Json>[],
        'boss': null,
        'start': {'x': 3.5, 'y': 14},
        'arena': null,
        'tileKeys': ['TILES_VILLAGE', 'TILES_FOREST'],
        'layerKeys': ['VILLAGE_LAYER', 'FOREST_LAYER'],
        'area': 0,
        'drift': 0,
        'tint': null,
      };
  final Json level;
  int nextId = 1;
  String id(String prefix) => '$prefix${nextId++}';
  void fill(int x, int y, int w, int h, [int value = 1]) {
    final cols = level['cols'] as int;
    for (var yy = y; yy < y + h; yy++) {
      for (var xx = x; xx < x + w; xx++) {
        if (xx >= 0 && xx < cols && yy >= 0 && yy < 18)
          level['tiles'][yy * cols + xx] = value;
      }
    }
  }

  void ground(int a, int b, [int top = 14]) =>
      fill(a, top, b - a + 1, 18 - top);
  void shard(int x, int y, [bool secret = false]) =>
      (level['shards'] as List).add({
        'id': id('shard'),
        'x': x + .5,
        'y': y,
        'taken': false,
        'secret': secret,
      });
  void ring(int x, int y) =>
      (level['rings'] as List).add({'id': id('ring'), 'x': x + .5, 'y': y});
  String altar(int x) {
    final name = id('altar');
    (level['altars'] as List).add({
      'id': name,
      'x': x + .5,
      'y': 14,
      'activeT': 0,
    });
    return name;
  }

  void enemies(int a, int b, int count, List<String> pool, JourneyRandom r) {
    for (var i = 0; i < count; i++) {
      final type = r.pick(pool),
          x = a + 1 + (r.next() * math.max(1, b - a - 2)).floor();
      final flying = ['crow', 'sprite', 'bat', 'gargoyle'].contains(type),
          hover = ['stitcher', 'wraith', 'spider', 'witch'].contains(type);
      (level['enemies'] as List).add({
        'type': type,
        'x': x + .5,
        'y': flying
            ? 6 + (r.next() * 3).floor()
            : hover
            ? 11.5
            : 14,
        if (!flying && !hover) 'range': 3,
      });
    }
  }

  int chunk(int x, String kind, JourneyRandom r, List<String> pool, int n) {
    switch (kind) {
      case 'flat':
        final w = 16 + (r.next() * 6).floor();
        ground(x, x + w - 1);
        if (r.next() < .5) {
          fill(x + 6, 12, 3, 2);
          shard(x + 7, 12);
        }
        enemies(x + 3, x + w - 2, n, pool, r);
        return x + w;
      case 'gap':
        final gap = 2 + (r.next() * 3).floor();
        ground(x, x + 6);
        ground(x + 7 + gap, x + 16 + gap);
        shard(x + 7 + gap ~/ 2, 11);
        enemies(x + 8 + gap, x + 16 + gap, math.max(1, n - 1), pool, r);
        return x + 17 + gap;
      case 'ring':
        ground(x, x + 5);
        ring(x + 9, 8);
        ground(x + 13, x + 21);
        enemies(x + 14, x + 21, math.max(1, n - 1), pool, r);
        return x + 22;
      case 'bridge':
        ground(x, x + 6);
        final a = altar(x + 3);
        (level['shadows'] as List).add({
          'id': id('sh'),
          'altar': a,
          'x': x + 7,
          'y': 14,
          'w': 10,
          'kind': 'bridge',
          'lit': false,
        });
        ground(x + 17, x + 24);
        enemies(x + 18, x + 24, 1, pool, r);
        return x + 25;
      case 'tunnel':
        ground(x, x + 17);
        fill(x + 5, 5, 8, 8);
        shard(x + 9, 14, true);
        enemies(x + 13, x + 17, 1, pool, r);
        return x + 18;
      case 'barricade':
        ground(x, x + 15);
        fill(x + 7, 9, 1, 5, 4);
        enemies(x + 9, x + 15, math.max(1, n - 1), pool, r);
        return x + 16;
      case 'planks':
        ground(x, x + 19);
        fill(x + 4, 11, 4, 1, 2);
        fill(x + 10, 8, 5, 1, 2);
        shard(x + 12, 8);
        enemies(x + 3, x + 19, n, pool, r);
        return x + 20;
      case 'fragile':
        ground(x, x + 17);
        fill(x + 7, 14, 3, 2, 3);
        fill(x + 7, 16, 3, 2, 0);
        enemies(x + 12, x + 17, 1, pool, r);
        return x + 18;
      case 'wheel':
        ground(x, x + 5);
        final a = altar(x + 2);
        (level['wheels'] as List).add({
          'id': id('wh'),
          'altar': a,
          'cx': x + 10,
          'cy': 9.5,
          'r': 3,
          'ang': 0,
          'lit': [false, false, false, false],
        });
        ground(x + 15, x + 22);
        return x + 23;
      case 'lever':
        ground(x, x + 17);
        fill(x + 9, 5, 1, 9, 5);
        (level['levers'] as List).add({
          'id': id('lever'),
          'x': x + 6.5,
          'y': 14,
          'on': false,
          'gate': {'x': x + 9, 'y': 5, 'h': 9},
        });
        enemies(x + 11, x + 17, n, pool, r);
        return x + 18;
      default:
        ground(x, x + 9);
        return x + 10;
    }
  }
}

Json buildEndless(int seed, {Json? extra}) {
  final b = LevelBuilder(70 * 24 + 40),
      r = JourneyRandom(seed),
      level = b.level;
  b.ground(0, 13);
  (level['hints'] as List).add({
    'x': 1,
    'text': 'Perjalanan tanpa akhir — sejauh mana kau bisa lari?',
    'shown': false,
  });
  if (extra != null) {
    (level['tileKeys'] as List).addAll(extra['tiles'] as List);
    (level['layerKeys'] as List).addAll(extra['layers'] as List);
  }
  const pools = [
    ['archer', 'hound', 'crow'],
    ['archer', 'hound', 'crow', 'knight', 'lantern'],
    ['archer', 'hound', 'crow', 'knight', 'lantern', 'stitcher', 'mimic'],
  ];
  const kinds = [
    'flat',
    'gap',
    'ring',
    'bridge',
    'tunnel',
    'barricade',
    'planks',
    'fragile',
    'wheel',
    'lever',
    'flat',
  ];
  var x = 14;
  for (var i = 0; i < 70; i++) {
    final tier = i < 6
            ? 0
            : i < 16
            ? 1
            : 2,
        useExtra = extra != null && i >= 8 && (i ~/ 4) % 2 == 1;
    final pool = useExtra
            ? (extra['monsters'] as List).cast<String>()
            : pools[tier],
        theme = useExtra ? 2 : (i ~/ 4) % 2,
        start = x;
    final count = math.min(4, 1 + i ~/ 8 + (r.next() < .4 ? 1 : 0));
    x = b.chunk(x, i == 0 ? 'flat' : r.pick(kinds), r, pool, count);
    for (var xx = start; xx <= math.min(level['cols'] - 1, x); xx++) {
      level['theme'][xx] = theme;
    }
    if (i % 3 == 2 && !useExtra) {
      (level['decor'] as List).add({
        'id': b.id('dc'),
        'kind': r.pick([
          'lamp_post',
          'gravestone',
          'red_bush',
          'barrel',
          'dead_tree',
        ]),
        'x': x - 1.5,
        'y': 14,
        'scale': 1,
        'back': true,
      });
    }
  }
  b.ground(x, (level['cols'] as int) - 1);
  return level;
}
