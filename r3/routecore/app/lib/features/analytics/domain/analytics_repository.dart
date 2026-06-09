import '../../../shared/models/models.dart';

/// Known core event names (free-form names are also allowed).
/// Product-specific events live in their module (TerroirAnalyticsEvents,
/// EcoDriveAnalyticsEvents) to keep the core neutral.
class AnalyticsEvents {
  const AnalyticsEvents._();

  static const appOpened = 'app_opened';
  static const onboardingCompleted = 'onboarding_completed';
  static const loginCompleted = 'login_completed';
  static const routeSearchStarted = 'route_search_started';
  static const routeOptionSelected = 'route_option_selected';
  static const poiViewed = 'poi_viewed';
  static const poiFavorited = 'poi_favorited';
  static const tripStarted = 'trip_started';
  static const tripCompleted = 'trip_completed';
}

abstract class AnalyticsRepository {
  Future<void> logEvent(
    String eventName, {
    Map<String, dynamic> properties,
    ProductContext productContext,
    String? userId,
  });
}
