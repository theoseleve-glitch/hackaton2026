import 'package:flutter/foundation.dart';

/// Minimal logger; swap for a real solution (sentry, logger pkg) later.
class AppLogger {
  const AppLogger(this.scope);

  final String scope;

  void info(String message) => _log('INFO', message);
  void warn(String message) => _log('WARN', message);
  void error(String message, [Object? error, StackTrace? stack]) {
    _log('ERROR', '$message${error == null ? '' : ' — $error'}');
    if (stack != null && kDebugMode) debugPrintStack(stackTrace: stack);
  }

  void _log(String level, String message) {
    if (kDebugMode) debugPrint('[$level][$scope] $message');
  }
}
