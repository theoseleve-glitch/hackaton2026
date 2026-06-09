/// Product context shared by every entity. Keep the core neutral: anything
/// product-specific lives in product_modules/, not here.
enum ProductContext {
  common,
  terroir,
  ecodrive;

  static ProductContext fromName(String? value) => ProductContext.values
      .firstWhere((e) => e.name == value, orElse: () => ProductContext.common);
}

enum RouteMode {
  fastest,
  shortest,
  eco,
  discovery;

  static RouteMode fromName(String? value) => RouteMode.values
      .firstWhere((e) => e.name == value, orElse: () => RouteMode.fastest);
}

enum TripStatus {
  draft,
  planned,
  active,
  completed,
  cancelled;

  static TripStatus fromName(String? value) => TripStatus.values
      .firstWhere((e) => e.name == value, orElse: () => TripStatus.draft);
}

enum FavoriteTargetType {
  poi,
  route,
  trip;

  static FavoriteTargetType fromName(String? value) =>
      FavoriteTargetType.values.firstWhere((e) => e.name == value,
          orElse: () => FavoriteTargetType.poi);
}
