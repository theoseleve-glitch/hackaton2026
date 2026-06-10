import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Typed access to environment variables. Never hardcode keys elsewhere.
class Env {
  const Env._();

  static String get supabaseUrl => dotenv.maybeGet('SUPABASE_URL') ?? '';
  static String get supabaseAnonKey =>
      dotenv.maybeGet('SUPABASE_ANON_KEY') ?? '';

  /// mock / mapbox / google / openrouteservice
  static String get mapProvider =>
      dotenv.maybeGet('MAP_PROVIDER') ?? 'mock';

  /// Which product experience this build boots into:
  /// common (neutral core screens) / echappee (L'Échappée) / ecodrive.
  /// Keeps the core neutral — each dev sets their own flavor in .env.
  static String get productFlavor =>
      dotenv.maybeGet('PRODUCT_FLAVOR') ?? 'common';

  static String get mapboxAccessToken =>
      dotenv.maybeGet('MAPBOX_ACCESS_TOKEN') ?? '';
  static String get googleMapsApiKey =>
      dotenv.maybeGet('GOOGLE_MAPS_API_KEY') ?? '';
  static String get openRouteServiceApiKey =>
      dotenv.maybeGet('OPENROUTESERVICE_API_KEY') ?? '';

  static bool get hasSupabase =>
      supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
}
