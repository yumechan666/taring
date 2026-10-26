// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flame/game.dart';
import 'package:taring/data/game_data_access.dart';
import 'package:taring/game/taring_game.dart';
import 'package:taring/game/simulation.dart';
import 'package:taring/game/game_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:taring/main.dart';

void main() {
  testWidgets('gameplay button shows its key and keeps touch input', (
    tester,
  ) async {
    var presses = 0;
    var releases = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: HoldControl(
              label: 'Attack',
              shortcut: 'J',
              iconName: 'sickle',
              size: 60,
              color: const Color(0xffffb7a8),
              onDown: () => presses++,
              onUp: () => releases++,
            ),
          ),
        ),
      ),
    );
    expect(find.text('J'), findsOneWidget);
    expect(find.bySemanticsLabel('Attack (J)'), findsOneWidget);
    await tester.tap(find.byType(HoldControl));
    expect(presses, 1);
    expect(releases, 1);
  });

  testWidgets('Sabit Taring Malam loads', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const MyApp());
    await tester.pumpAndSettle();
    expect(find.byType(MaterialApp), findsOneWidget);
  });

  for (final size in const [Size(360, 780), Size(780, 360)]) {
    testWidgets(
      'menu and tutorial fit a ${size.width.toInt()}x${size.height.toInt()} phone',
      (tester) async {
        SharedPreferences.setMockInitialValues({});
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(const MyApp());
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.ensureVisible(find.text('Mulai Perjalanan'));
        await tester.tap(find.text('Mulai Perjalanan'));
        await tester.pumpAndSettle();
        expect(find.text('Lewati'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('Start mounts Flame with selected skin and area', (tester) async {
    SharedPreferences.setMockInitialValues({
      'sabit_taring_malam_save': '{"skin":2,"theme":4,"muted":true}',
    });
    await tester.pumpWidget(const MyApp());
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Mulai Perjalanan'));
    await tester.tap(find.text('Mulai Perjalanan'));
    await tester.pumpAndSettle();
    expect(find.text('Lewati'), findsOneWidget);
    await tester.tap(find.text('Lewati'));
    await tester.pump();
    final widget = tester.widget<GameWidget<TaringGame>>(
      find.byType(GameWidget<TaringGame>),
    );
    expect(widget.game!.skin, 3);
    expect(widget.game!.area, 3);
    expect(widget.game!.muted, isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('keyboard controls reach gameplay after the run starts', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'sabit_taring_malam_save': '{"muted":true}',
    });
    tester.view.physicalSize = const Size(1000, 560);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(const MyApp());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mulai Perjalanan'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lewati'));
    await tester.pump();

    final game = tester
        .widget<GameWidget<TaringGame>>(find.byType(GameWidget<TaringGame>))
        .game!;
    final reference =
        gameJson('journey.json')
            as Map<String, dynamic>;
    game.simulation = JourneySimulation(reference);
    expect(game.simulation, isNotNull, reason: game.loadError);

    await tester.sendKeyDownEvent(LogicalKeyboardKey.keyD);
    expect(game.session.held, contains('right'));
    await tester.sendKeyUpEvent(LogicalKeyboardKey.keyD);
    expect(game.session.held, isNot(contains('right')));

    await tester.sendKeyDownEvent(LogicalKeyboardKey.space);
    expect(game.session.held, contains('jump'));
    await tester.sendKeyUpEvent(LogicalKeyboardKey.space);

    await tester.pumpWidget(const SizedBox.shrink());
  });
}
