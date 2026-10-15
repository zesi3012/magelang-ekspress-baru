import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magelang_ekspress/main.dart';

void main() {
  testWidgets('Magelang Ekspress dapat ditampilkan', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: MagelangEkspressApp(),
      ),
    );

    expect(find.byType(MagelangEkspressApp), findsOneWidget);
  });
}
