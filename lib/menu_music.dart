import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

/// Looping music for the main menu. The game itself plays its own music inside
/// the WebView, so the shell turns this off while a run is open and on again at
/// the menu. Audio is optional: any failure (no plugin in tests, a browser that
/// blocks autoplay before the first tap) is logged and retried on the next tap.
class MenuMusic {
  MenuMusic({this.asset = 'audio/bgm_stage.mp3', this.volume = 0.35});

  final String asset;
  final double volume;
  AudioPlayer? _player;
  bool _wanted = false;
  bool _foreground = true;
  bool _started = false;
  // Operations run one after another. Startup fires several at once (the menu
  // asks for music while the lifecycle reports "resumed"), and overlapping
  // setSource/play calls leave Android's MediaPlayer idle.
  Future<void> _queue = Future.value();

  bool get wanted => _wanted;

  Future<void> setWanted(bool wanted) {
    _wanted = wanted;
    return _apply();
  }

  /// Pause while the app is in the background, resume when it comes back.
  Future<void> setForeground(bool foreground) {
    _foreground = foreground;
    return _apply();
  }

  /// Call on a user gesture: browsers refuse to start audio before one.
  Future<void> nudge() => _started ? Future.value() : _apply();

  Future<void> _apply() {
    _queue = _queue.then((_) => _applyNow());
    return _queue;
  }

  // Reads the wanted/foreground flags when it runs, not when it was queued, so
  // a burst of calls settles on the latest state.
  Future<void> _applyNow() async {
    try {
      if (_wanted && _foreground) {
        final player = _player ??= AudioPlayer();
        if (!_started) {
          await player.setReleaseMode(ReleaseMode.loop);
          await player.setVolume(volume);
          await player.play(AssetSource(asset));
          _started = true;
        } else if (player.state != PlayerState.playing) {
          await player.resume();
        }
      } else if (_player != null && _started && _player!.state == PlayerState.playing) {
        await _player!.pause();
      }
    } catch (error) {
      debugPrint('MenuMusic: $error');
      _started = false;
    }
  }

  Future<void> dispose() async {
    final player = _player;
    _player = null;
    try {
      await player?.dispose();
    } catch (_) {}
  }
}
