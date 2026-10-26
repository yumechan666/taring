import 'dart:ui' as ui;
import 'package:flame/game.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:taring/game/taring_game.dart';

/// Plays every area (and endless) while rendering and fails when a draw call
/// asks for a picture or frame that was never loaded.
void main() {
  Future<Set<String>> play(
    WidgetTester tester, {
    required int area,
    int skin = 1,
    bool endless = false,
  }) async {
    final game = TaringGame(
      area: area,
      skin: skin,
      muted: true,
      onScore: (_) {},
      onGameOver: (_) {},
    );
    game.onGameResize(Vector2(1000, 560));
    await tester.runAsync(() async {
      await game.onLoad();
      if (endless) {
        await game.change(nextArea: 0, endless: true);
      }
      final s = game.session;
      s.paused = false;
      s.press('right');
      void frames(int count) {
        for (var i = 0; i < count; i++) {
          s.update(1 / 60);
          if (i % 6 == 0) {
            final recorder = ui.PictureRecorder();
            game.render(ui.Canvas(recorder));
            recorder.endRecording().dispose();
          }
        }
      }

      frames(180);
      s.press('transform');
      frames(60);
      s.press('transform');
      s.press('attack');
      frames(60);
      // Walk through the level so every enemy type and the boss come on screen.
      final arena = s.level['arena'] as Map?;
      final width = (s.level['cols'] as int).toDouble();
      for (double x = 12; x < width - 4; x += 8) {
        s.player.x = x;
        s.player.y = 12;
        s.player.vy = 0;
        frames(24);
      }
      if (arena != null) {
        s.player.x = (arena['trigger'] as num).toDouble() + 1;
        s.player.y = 12;
        frames(240);
      }
      game.onRemove();
    });
    return game.missing;
  }

  testWidgets('the audit itself notices a missing picture', (tester) async {
    final game = TaringGame(
      area: 0,
      skin: 1,
      muted: true,
      onScore: (_) {},
      onGameOver: (_) {},
    );
    game.onGameResize(Vector2(1000, 560));
    await tester.runAsync(() async {
      await game.onLoad();
      game.pictures.remove('HERO_HUMAN_MOVE');
      final recorder = ui.PictureRecorder();
      game.render(ui.Canvas(recorder));
      recorder.endRecording().dispose();
      game.onRemove();
    });
    expect(game.missing, contains('pic:HERO_HUMAN_MOVE'));
  });

  for (var area = 0; area <= 10; area++) {
    testWidgets('area $area draws only loaded images', (tester) async {
      final missing = await play(tester, area: area, skin: area == 0 ? 10 : 1);
      expect(missing, isEmpty, reason: 'area $area missing: $missing');
    });
  }
  testWidgets('endless draws only loaded images', (tester) async {
    final missing = await play(tester, area: 0, endless: true);
    expect(missing, isEmpty, reason: 'endless missing: $missing');
  });
}
