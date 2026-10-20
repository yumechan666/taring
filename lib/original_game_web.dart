import 'dart:convert';
import 'dart:js_interop';

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

/// Runs the same bundled modules and atlas contracts as Android.
class OriginalGame extends StatefulWidget {
  const OriginalGame({super.key, required this.skin, required this.area,
    required this.muted, required this.onClose});
  final int skin;
  final int area;
  final bool muted;
  final ValueChanged<Map<String, dynamic>> onClose;

  @override
  State<OriginalGame> createState() => _OriginalGameState();
}

class _OriginalGameState extends State<OriginalGame> {
  web.HTMLIFrameElement? _frame;
  late final JSFunction _onMessage;

  @override
  void initState() {
    super.initState();
    _onMessage = ((web.MessageEvent event) {
      if (!mounted || event.origin != Uri.base.origin ||
          _frame == null || event.source != _frame!.contentWindow ||
          event.data == null || !event.data.isA<JSString>()) {
        return;
      }
      try {
        final message = jsonDecode((event.data as JSString).toDart);
        if (message is Map && message['type'] == 'taring-close' && message['result'] is Map) {
          widget.onClose(Map<String, dynamic>.from(message['result'] as Map));
        }
      } on FormatException { /* Ignore messages from other scripts. */ }
    }).toJS;
    web.window.addEventListener('message', _onMessage);
  }

  @override
  void dispose() {
    web.window.removeEventListener('message', _onMessage);
    _frame?.src = 'about:blank';
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => HtmlElementView.fromTagName(
    tagName: 'iframe',
    onElementCreated: (element) {
      final frame = element as web.HTMLIFrameElement;
      _frame = frame;
      frame.title = 'Sabit Taring Malam';
      frame.style.width = '100%';
      frame.style.height = '100%';
      frame.style.border = '0';
      frame.allow = 'autoplay; fullscreen';
      // The bundle's directory is literally game%20js. Encode the percent sign
      // again for HTTP so the server resolves that encoded filename.
      frame.src = Uri.parse(web.document.baseURI).resolve('assets/game%2520js/index.html').replace(
        queryParameters: {'skin': '${widget.skin}', 'area': '${widget.area}',
          'muted': '${widget.muted}', 'bundled': 'true'},
      ).toString();
    },
  );
}

/// Fullscreen and landscape for the web build. Browsers only allow both from a
/// user gesture, so call this synchronously from the tap that starts the game.
/// Either request can be refused (iOS Safari has no Fullscreen API), which is fine.
void enterGameFullscreen() {
  try {
    web.document.documentElement?.requestFullscreen().toDart.catchError((Object _) => null);
  } catch (_) {}
  try {
    web.window.screen.orientation.lock('landscape').toDart.catchError((Object _) => null);
  } catch (_) {}
}

void leaveGameFullscreen() {
  try {
    web.window.screen.orientation.unlock();
  } catch (_) {}
  try {
    if (web.document.fullscreenElement != null) web.document.exitFullscreen();
  } catch (_) {}
}
