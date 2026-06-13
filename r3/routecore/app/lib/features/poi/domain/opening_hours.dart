/// Pure-Dart parser for the *common subset* of the OSM `opening_hours` syntax.
///
/// Supported:
/// - `24/7`
/// - rules separated by `;` — later rules override earlier ones for the days
///   they mention (e.g. `Mo-Sa 08:00-19:00; Su off`)
/// - day ranges and lists `Mo-Fr`, `Mo,We,Fr`, `Sa-Su` (ranges may wrap the
///   week: `Fr-Mo`); a rule without days applies to every day
/// - one or more time ranges per rule: `08:00-19:00`,
///   `08:30-12:30,15:00-19:00` (overnight ranges like `18:00-02:00` wrap)
/// - `off` / `closed` rules
/// - `PH off` / `PH closed` rules are ignored (public holidays unsupported)
///
/// Anything else returns `null` from [tryParse]: callers must treat an
/// unparseable value as *unknown*, NOT as closed.
class OpeningHours {
  const OpeningHours._(this._rules, this.always);

  final List<_Rule> _rules;

  /// True for `24/7` — open at any instant.
  final bool always;

  static final RegExp _phRule =
      RegExp(r'^PH\s+(off|closed)$', caseSensitive: false);
  static final RegExp _dayPrefix = RegExp(
      r'^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)'
      r'(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?'
      r'\s*(.*)$');
  static final RegExp _timeRange =
      RegExp(r'^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$');
  static const List<String> _dayNames = [
    'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su', // 1..7, DateTime.weekday order
  ];

  /// Parses [raw]; returns `null` when the value uses syntax outside the
  /// supported subset (callers treat that as "hours unknown").
  static OpeningHours? tryParse(String raw) {
    final text = raw.trim();
    if (text.isEmpty) return null;
    if (text == '24/7') return const OpeningHours._([], true);
    final rules = <_Rule>[];
    for (final part in text.split(';')) {
      final rule = part.trim();
      if (rule.isEmpty) continue;
      if (_phRule.hasMatch(rule)) continue; // public holidays: ignored
      final parsed = _parseRule(rule);
      if (parsed == null) return null;
      rules.add(parsed);
    }
    if (rules.isEmpty) return null;
    return OpeningHours._(rules, false);
  }

  /// Whether the place is open at [when]. Days never mentioned by any rule
  /// are considered closed (hours were published, the day is absent).
  bool isOpenAt(DateTime when) {
    if (always) return true;
    final day = when.weekday; // 1 = Monday .. 7 = Sunday
    final minutes = when.hour * 60 + when.minute;
    bool? status;
    for (final rule in _rules) {
      if (!rule.days.contains(day)) continue;
      status = rule.off ? false : rule.ranges.any((r) => r.contains(minutes));
    }
    return status ?? false;
  }

  static _Rule? _parseRule(String rule) {
    final match = _dayPrefix.firstMatch(rule);
    if (match == null) return null;
    final daySpec = match.group(1);
    final rest = match.group(2)!.trim();
    final days = daySpec == null ? _allDays() : _parseDays(daySpec);
    if (days == null || days.isEmpty) return null;
    if (rest.isEmpty) return null; // "Sa" alone: meaning unclear → unknown
    final lower = rest.toLowerCase();
    if (lower == 'off' || lower == 'closed') {
      return _Rule(days: days, off: true, ranges: const []);
    }
    final ranges = <_TimeRange>[];
    for (final chunk in rest.split(',')) {
      final m = _timeRange.firstMatch(chunk.trim());
      if (m == null) return null;
      final startH = int.parse(m.group(1)!);
      final startM = int.parse(m.group(2)!);
      final endH = int.parse(m.group(3)!);
      final endM = int.parse(m.group(4)!);
      if (startH > 24 || endH > 24 || startM > 59 || endM > 59) return null;
      ranges.add(_TimeRange(startH * 60 + startM, endH * 60 + endM));
    }
    if (ranges.isEmpty) return null;
    return _Rule(days: days, off: false, ranges: ranges);
  }

  static Set<int> _allDays() => {1, 2, 3, 4, 5, 6, 7};

  static Set<int>? _parseDays(String spec) {
    final days = <int>{};
    for (final token in spec.split(',')) {
      final t = token.trim();
      final dash = t.indexOf('-');
      if (dash == -1) {
        final d = _dayNames.indexOf(t);
        if (d == -1) return null;
        days.add(d + 1);
      } else {
        final from = _dayNames.indexOf(t.substring(0, dash));
        final to = _dayNames.indexOf(t.substring(dash + 1));
        if (from == -1 || to == -1) return null;
        var d = from;
        while (true) {
          days.add(d + 1);
          if (d == to) break;
          d = (d + 1) % 7; // week wrap, e.g. Fr-Mo
        }
      }
    }
    return days;
  }
}

class _Rule {
  const _Rule({required this.days, required this.off, required this.ranges});

  final Set<int> days;
  final bool off;
  final List<_TimeRange> ranges;
}

class _TimeRange {
  const _TimeRange(this.startMinutes, this.endMinutes);

  final int startMinutes;
  final int endMinutes;

  bool contains(int minutes) {
    if (endMinutes <= startMinutes) {
      // Overnight range, e.g. 18:00-02:00.
      return minutes >= startMinutes || minutes < endMinutes;
    }
    return minutes >= startMinutes && minutes < endMinutes;
  }
}
