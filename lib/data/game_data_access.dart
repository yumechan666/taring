import 'game_data.dart';

/// Native Dart data for one embedded game data entry.
Map<String, dynamic> gameJson(String name) {
  final data = gameDataFiles[name];
  if (data == null) throw StateError('Missing game data: $name');
  return copyGameData(data) as Map<String, dynamic>;
}

dynamic copyGameData(dynamic value) {
  if (value is Map) {
    return value.map(
      (key, item) => MapEntry(key as String, copyGameData(item)),
    );
  }
  if (value is List) return value.map(copyGameData).toList();
  return value;
}
