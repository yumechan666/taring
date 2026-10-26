import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:taring/data/game_data_access.dart';
import 'package:taring/game/simulation.dart';
import 'fixtures/physics_reference.dart';

void main() {
  final reference = gameJson('journey.json');
  JourneySimulation game({int skin = 1, int area = 0}) =>
      JourneySimulation(reference, skin: skin, area: area);
  void frames(JourneySimulation s, int count) {
    for (var i = 0; i < count; i++) {
      s.update(1 / 60);
    }
  }

  test('movement matches reference physics frame by frame', () {
    final traces = physicsReference;
    for (final trace in traces) {
      final s = game();
      s.enemies.clear();
      for (var i = 0; i < 90; i++) {
        for (final key in (trace['events']['$i'] as List? ?? [])) {
          if ((key as String).startsWith('-'))
            s.release(key.substring(1));
          else
            s.press(key);
        }
        s.update(1 / 60);
        final expected = (trace['samples'] as List)
            .where((sample) => sample['frame'] == i + 1)
            .firstOrNull;
        if (expected == null) continue;
        expect(
          s.player.x,
          closeTo(number(expected['x']), 1e-8),
          reason: '${trace['name']} x frame ${i + 1}',
        );
        expect(
          s.player.y,
          closeTo(number(expected['y']), 1e-8),
          reason: '${trace['name']} y frame ${i + 1}',
        );
      }
    }
  });
  test(
    'all eleven authored areas spawn clear with independent mutable tiles',
    () {
      for (var i = 0; i < 11; i++) {
        final a = game(area: i), b = game(area: i);
        expect(a.tiles.length, a.cols * a.rows);
        expect(
          a.enemies.every((e) => e.fly || !a.boxSolid(e.x, e.y, e.w, e.h)),
          isTrue,
          reason: 'area $i',
        );
        a.setTile(0, 14, 0);
        expect(b.tile(0, 14), 1);
        frames(a, 60);
        expect(a.player.hp, a.player.maxHp);
      }
    },
  );
  test('simulation frame rate does not change movement or elapsed time', () {
    final a = game(), b = game();
    a.press('right');
    b.press('right');
    frames(a, 60);
    for (var i = 0; i < 30; i++) {
      b.update(1 / 30);
    }
    expect(a.player.x, closeTo(b.player.x, 1e-9));
    expect(a.time, closeTo(b.time, 1e-9));
    expect(a.player.x, greaterThan(9));
    a.release('right');
    frames(a, 30);
    expect(a.player.vx, 0);
  });
  test('jump holds rise higher than a tap; pause clears held input', () {
    final held = game(), tap = game();
    frames(held, 2);
    frames(tap, 2);
    held.press('jump');
    tap.press('jump');
    frames(held, 1);
    frames(tap, 1);
    tap.release('jump');
    frames(held, 15);
    frames(tap, 15);
    expect(held.player.y, lessThan(tap.player.y));
    final x = held.player.x;
    held.paused = true;
    held.clearInput();
    frames(held, 60);
    expect(held.player.x, x);
    expect(held.held, isEmpty);
  });
  test('one-way planks permit up passage and deliberate drop', () {
    final s = game();
    s.platforms.clear();
    final a = Actor(92, 10.9)..vy = 4;
    s.moveActor(a, .1);
    expect(a.y, 11);
    expect(a.grounded, isTrue);
    a.vy = 4;
    s.moveActor(a, .1, drop: true);
    expect(a.y, greaterThan(11));
    expect(a.grounded, isFalse);
  });
  test('wolf fits low tunnel and cannot transform into obstructed human', () {
    final s = game();
    s.player.x = 41;
    s.player.y = 14;
    s.transform();
    expect(s.player.form, 'wolf');
    expect(s.boxSolid(41, 14, 1.05, .8), isFalse);
    s.player.action = null;
    s.transform();
    expect(s.player.form, 'wolf');
    expect(s.toast, 'Terlalu sempit');
  });
  test(
    'wolf howl activates the authored bridge and expires after twelve seconds',
    () {
      final s = game();
      s.player.x = 126.5;
      s.player.y = 14;
      s.player.setForm('wolf');
      s.skill();
      frames(s, 30);
      expect(s.objects('altars').first['activeT'], greaterThan(11));
      expect(s.platforms, isNotEmpty);
      s.enemies.clear();
      s.player.x = 120;
      frames(s, 750);
      expect(s.platforms, isEmpty);
    },
  );
  test('skin ten starts with seven hearts and sixteen second Eclipse', () {
    final s = game(skin: 10);
    expect(s.player.hp, 7);
    expect(s.player.ulti, 100);
    s.ultimate();
    expect(s.player.form, 'eclipse');
    expect(s.player.eclipse, 16);
    expect(s.player.ulti, 0);
    frames(s, 961);
    expect(s.player.form, 'human');
    expect(s.shots.any((shot) => shot['kind'] == 'spirit'), isTrue);
  });
  test('checkpoint revives and mutable state is reset on restart', () {
    final s = game();
    s.player.x = 59.5;
    s.player.y = 14;
    s.player.hp = 2;
    s.updatePickups(1 / 60);
    expect(s.checkpointX, 59.5);
    expect(s.player.hp, 5);
    s.player.hp = 0;
    s.respawn();
    expect(s.player.x, 59.5);
    expect(s.player.dead, isFalse);
    s.restart();
    expect(s.checkpointX, 3.5);
    expect(s.score, 0);
  });
  test(
    'attack hitboxes respect facing and award each target once per swing',
    () {
      final s = game();
      s.enemies.clear();
      final enemy = s.makeEnemy({'type': 'archer', 'x': 4.5, 'y': 14}, 'test');
      s.enemies.add(enemy);
      s.player.x = 3.5;
      s.player.facing = -1;
      s.attack();
      frames(s, 10);
      expect(enemy.hp, 2);
      s.player.action = null;
      s.player.facing = 1;
      s.attack();
      frames(s, 18);
      expect(enemy.hp, 1);
    },
  );
  test('active Flutter entrypoint uses the Flame game', () {
    final main = File('lib/main.dart').readAsStringSync();
    expect(main, isNot(contains('original_game')));
    expect(main, isNot(contains('openGame')));
    expect(main, contains("import 'game/taring_game.dart';"));
  });
}
