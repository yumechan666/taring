import 'dart:ui' as ui;
import 'package:flame/game.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:taring/game/taring_game.dart';

void main(){
 testWidgets('Flame decodes original atlases and renders gameplay without JS',(tester) async {
  final game=TaringGame(area:0,skin:1,muted:true,onScore:(_){},onGameOver:(_){});
  game.onGameResize(Vector2(1000,560));
  await tester.runAsync(() async {
    await game.onLoad();
    expect(game.pictures.length,greaterThan(20));
    expect(game.frame('HERO_HUMAN_MOVE','idle'),isNotNull);
    final recorder=ui.PictureRecorder();
    game.render(ui.Canvas(recorder));
    final picture=recorder.endRecording();
    final image=await picture.toImage(1000,560);
    expect(image.width,1000);
    image.dispose();picture.dispose();
    game.onRemove();
  });
 });
}
