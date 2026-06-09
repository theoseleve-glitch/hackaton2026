import '../core/env/env.dart';

/// App-level configuration derived from the environment.
class AppConfig {
  const AppConfig._();

  static bool get demoMode => !Env.hasSupabase;
  static String get mapProviderLabel =>
      Env.mapProvider == 'mock' ? 'Carte de démonstration' : Env.mapProvider;
}
