import '../../../shared/models/models.dart';

/// Known event names (free-form names are also allowed).
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
  static const ecoScoreViewed = 'eco_score_viewed';
  static const terroirRouteGenerated = 'terroir_route_generated';

  // EcoDrive product events (brief-mandated exact names).
  static const ecodriveRouteSearchStarted = 'ecodrive_route_search_started';
  static const ecodriveRouteOptionSelected = 'ecodrive_route_option_selected';
  static const ecodriveTripStarted = 'ecodrive_trip_started';
  static const ecodriveTripCompleted = 'ecodrive_trip_completed';
  static const ecodriveScoreViewed = 'ecodrive_score_viewed';
  static const ecodriveAdviceViewed = 'ecodrive_advice_viewed';
}

abstract class AnalyticsRepository {
  Future<void> logEvent(
    String eventName, {
    Map<String, dynamic> properties,
    ProductContext productContext,
    String? userId,
  });
}
