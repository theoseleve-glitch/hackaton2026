/// Neutral platform-wide constants. Product-specific tuning belongs in
/// product_modules/.
class AppConstants {
  const AppConstants._();

  static const defaultPoiSearchRadiusMeters = 5000.0;
  static const defaultRouteCorridorMeters = 3000.0;
  static const gpsTrackingIntervalSeconds = 5;
  static const minTrackingAccuracyMeters = 50.0;

  /// Rough averages used by placeholder fuel/CO2 estimations.
  static const defaultFuelLitersPer100Km = 6.5;
  static const co2KgPerFuelLiter = 2.31;
}
