import 'dart:convert';
import 'package:flame/components.dart' show Vector2;
import 'package:flame/widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Display one atlas frame instead of shrinking the entire sheet into a card.
class SkinPreview extends StatefulWidget {
  const SkinPreview({super.key, required this.file});
  final String file;

  @override
  State<SkinPreview> createState() => _SkinPreviewState();
}

class _SkinPreviewState extends State<SkinPreview> {
  late Future<Map<String, dynamic>> _frame = _load();

  Future<Map<String, dynamic>> _load() async {
    final json = await rootBundle.loadString('assets/json/${widget.file.replaceFirst('.webp', '.frames.json')}');
    final data = jsonDecode(json) as Map<String, dynamic>;
    final frame = (data['frames'] as List).cast<Map<String, dynamic>>().firstWhere((frame) => frame['name'] == 'idle_1');
    return (frame['content'] ?? frame['source']) as Map<String, dynamic>;
  }

  @override
  void didUpdateWidget(covariant SkinPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.file != widget.file) _frame = _load();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 64, height: 84,
    child: FutureBuilder<Map<String, dynamic>>(
      future: _frame,
      builder: (context, snapshot) {
        if (snapshot.hasError) return const Icon(Icons.broken_image_outlined);
        final rect = snapshot.data;
        if (rect == null) return const SizedBox.shrink();
        return Center(child: AspectRatio(
          aspectRatio: (rect['w'] as num) / (rect['h'] as num),
          child: SpriteWidget.asset(
            key: ValueKey(widget.file), path: widget.file,
            srcPosition: Vector2((rect['x'] as num).toDouble(), (rect['y'] as num).toDouble()),
            srcSize: Vector2((rect['w'] as num).toDouble(), (rect['h'] as num).toDouble()),
          ),
        ));
      },
    ),
  );
}
