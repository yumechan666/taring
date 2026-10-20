// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:taring/main.dart';

void main() {
  testWidgets('Sabit Taring Malam loads', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const MyApp());
    await tester.pumpAndSettle();
    expect(find.byType(MaterialApp), findsOneWidget);
  });

  for (final size in const [Size(360, 780), Size(780, 360)]) {
    testWidgets('menu and tutorial fit a ${size.width.toInt()}x${size.height.toInt()} phone', (tester) async {
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
    });
  }

  testWidgets('Android start opens original game with selected settings', (tester) async {
    SharedPreferences.setMockInitialValues({
      'sabit_taring_malam_save': '{"tutorialSeen":true,"skin":2,"theme":4,"muted":true}',
    });
    MethodCall? launch;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('taring/game'), (call) async {
        launch = call;
        return '{"bestScore":42,"skin":3,"muted":true}';
      },
    );
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('taring/game'), null));
    await tester.pumpWidget(const MyApp());
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Mulai Perjalanan'));
    await tester.tap(find.text('Mulai Perjalanan'));
    await tester.pumpAndSettle();
    // The tutorial opens before every run, even when it was seen before.
    expect(find.text('Lewati'), findsOneWidget);
    expect(launch, isNull);
    await tester.tap(find.text('Lewati'));
    await tester.pumpAndSettle();
    expect(launch?.method, 'openGame');
    expect(launch?.arguments, {'skin': 3, 'area': 3, 'muted': true});
    expect(find.text('Skor terbaik: 42'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
