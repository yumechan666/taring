import 'package:flutter/widgets.dart';

class OriginalGame extends StatelessWidget {
  const OriginalGame({super.key, required this.skin, required this.area,
    required this.muted, required this.onClose});
  final int skin;
  final int area;
  final bool muted;
  final ValueChanged<Map<String, dynamic>> onClose;

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

/// Only the web build has a fullscreen API to call; native platforms are
/// already fullscreen through their own activity or system UI mode.
void enterGameFullscreen() {}

void leaveGameFullscreen() {}
