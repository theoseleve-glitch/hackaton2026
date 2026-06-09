// EcoDrive-specific vehicle categories and their (approximate) energy profiles.
//
// This lives in the EcoDrive product module on purpose: vehicle-level fuel/CO2
// modelling is product business logic and must NOT leak into the shared core
// (`features/`, `shared/`). The shared `RouteRequest.vehicleType` is a plain
// `String`; convert with `EcoVehicleType.name` / `EcoVehicleType.fromName`.

/// Grid carbon intensity used to convert electric energy (kWh) into CO2.
///
/// APPROX: ~0.06 kg CO2/kWh is a France-grid order of magnitude. In production
/// this should come from configuration (per-country / real-time grid mix).
/// See `docs/ECODRIVE.md`.
const double kEcoGridCo2KgPerKwh = 0.06;

/// Vehicle categories the EcoDrive module can estimate fuel/CO2 for.
enum EcoVehicleType {
  petrol,
  diesel,
  hybrid,
  electric,
  van;

  /// Short French label for the UI.
  String get label => switch (this) {
        EcoVehicleType.petrol => 'Essence',
        EcoVehicleType.diesel => 'Diesel',
        EcoVehicleType.hybrid => 'Hybride',
        EcoVehicleType.electric => 'Électrique',
        EcoVehicleType.van => 'Utilitaire',
      };

  /// Parses a [RouteRequest.vehicleType]-style string, defaulting to
  /// [EcoVehicleType.petrol] when the value is null or unknown.
  static EcoVehicleType fromName(String? value) =>
      EcoVehicleType.values.firstWhere((e) => e.name == value,
          orElse: () => EcoVehicleType.petrol);

  /// Parses a string, returning `null` when it does not match a known type.
  static EcoVehicleType? tryFromName(String? value) {
    for (final e in EcoVehicleType.values) {
      if (e.name == value) return e;
    }
    return null;
  }
}

/// Per-[EcoVehicleType] consumption baselines and CO2 emission factors used by
/// the EcoDrive fuel/CO2 estimator and scoring layer.
///
/// All figures are deliberately simplified mixed-cycle (urban + extra-urban)
/// approximations in the spirit of the French ADEME emission-factor database.
/// They are NOT measured per-vehicle values; they exist so the app can produce
/// plausible, deterministic estimates offline.
///
/// APPROX: every constant here is an approximation. See `docs/ECODRIVE.md`. In
/// production these would be replaced by a real vehicle/emissions catalogue
/// keyed on make, model, engine and homologation cycle (WLTP).
class EcoVehicleProfile {
  /// Creates a profile. Prefer [EcoVehicleProfile.of] so canonical baselines
  /// are used.
  const EcoVehicleProfile({
    required this.type,
    required this.baseConsumptionL100km,
    required this.co2KgPerLiter,
    required this.kwhPer100km,
  });

  /// The vehicle category this profile describes.
  final EcoVehicleType type;

  /// Mixed-cycle baseline fuel consumption in litres per 100 km (0 for electric).
  final double baseConsumptionL100km;

  /// Tailpipe CO2 emitted per litre of fuel, in kilograms (0 for electric;
  /// electric CO2 is derived from [kwhPer100km] and [kEcoGridCo2KgPerKwh]).
  final double co2KgPerLiter;

  /// Baseline electrical consumption in kWh per 100 km (electric only; else 0).
  final double kwhPer100km;

  /// Returns the canonical [EcoVehicleProfile] for the given [EcoVehicleType].
  ///
  /// APPROX baselines: petrol 7.0 L/100km & 2.31 kg CO2/L; diesel 6.0 & 2.68;
  /// hybrid 4.5 & 2.31; van 9.0 & 2.68; electric 18 kWh/100km.
  static EcoVehicleProfile of(EcoVehicleType t) => switch (t) {
        EcoVehicleType.petrol => const EcoVehicleProfile(
            type: EcoVehicleType.petrol,
            baseConsumptionL100km: 7.0,
            co2KgPerLiter: 2.31,
            kwhPer100km: 0,
          ),
        EcoVehicleType.diesel => const EcoVehicleProfile(
            type: EcoVehicleType.diesel,
            baseConsumptionL100km: 6.0,
            co2KgPerLiter: 2.68,
            kwhPer100km: 0,
          ),
        EcoVehicleType.hybrid => const EcoVehicleProfile(
            type: EcoVehicleType.hybrid,
            baseConsumptionL100km: 4.5,
            co2KgPerLiter: 2.31,
            kwhPer100km: 0,
          ),
        EcoVehicleType.van => const EcoVehicleProfile(
            type: EcoVehicleType.van,
            baseConsumptionL100km: 9.0,
            co2KgPerLiter: 2.68,
            kwhPer100km: 0,
          ),
        EcoVehicleType.electric => const EcoVehicleProfile(
            type: EcoVehicleType.electric,
            baseConsumptionL100km: 0,
            co2KgPerLiter: 0,
            kwhPer100km: 18,
          ),
      };
}
