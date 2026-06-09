import 'dart:math' as math;

import '../../../shared/models/models.dart';
import 'eco_vehicle_type.dart';

/// The estimated energy cost of a route leg: fuel burned, CO2 emitted, and
/// (for electric vehicles) electrical energy consumed.
///
/// Units: litres, kilograms, kilowatt-hours. APPROX — see `docs/ECODRIVE.md`.
class FuelEstimate {
  /// Creates an immutable fuel/CO2 estimate.
  const FuelEstimate({
    required this.fuelLiters,
    required this.co2Kg,
    this.kwh,
  });

  /// Litres of liquid fuel consumed. Always `0` for electric vehicles.
  final double fuelLiters;

  /// Kilograms of CO2 emitted (combustion: `fuelLiters * factor`; electric:
  /// `kwh * grid intensity`).
  final double co2Kg;

  /// Electrical energy in kWh for electric vehicles; `null` for combustion.
  final double? kwh;
}

/// Estimates fuel consumption and CO2 emissions for a route leg given a vehicle
/// type, a distance and a duration.
///
/// Model: a baseline consumption figure (from [EcoVehicleProfile]) corrected by
/// a speed-dependent multiplier that penalises both very low (stop-and-go) and
/// very high (aerodynamic drag) average speeds, with a minimum around 70 km/h.
///
/// APPROX: every number this class produces is an approximation. It is NOT a
/// measurement and NOT OBD-based. See `docs/ECODRIVE.md`.
class FuelCo2Estimator {
  /// Creates a stateless estimator.
  const FuelCo2Estimator();

  /// Speed-based consumption multiplier as a function of average speed in km/h.
  ///
  /// APPROX (documented heuristic): a U-shaped curve centred on 70 km/h —
  /// `m = 1 + 0.0008 * (v - 70)^2 / 10` — clamped to `[0.85, 1.6]`.
  double _speedMultiplier(double avgKmh) {
    final m = 1 + 0.0008 * math.pow(avgKmh - 70, 2) / 10;
    return m.clamp(0.85, 1.6).toDouble();
  }

  /// Estimates fuel + CO2 for a single route leg.
  FuelEstimate estimateForRoute({
    required EcoVehicleType vehicle,
    required int distanceMeters,
    required int durationSeconds,
  }) {
    final profile = EcoVehicleProfile.of(vehicle);
    final distanceKm = distanceMeters / 1000.0;
    final hours = durationSeconds <= 0 ? 0.0 : durationSeconds / 3600.0;
    // Intentional fallback: with no usable duration, assume a 70 km/h average
    // (the efficient band, multiplier ~1.0) rather than fabricate a speed.
    final avgKmh = hours <= 0 ? 70.0 : distanceKm / hours;
    final m = _speedMultiplier(avgKmh);

    if (profile.kwhPer100km > 0) {
      // Electric: no liquid fuel; energy in kWh, CO2 from the grid factor.
      final kwh = profile.kwhPer100km * distanceKm / 100.0 * m;
      final co2 = kwh * kEcoGridCo2KgPerKwh;
      return FuelEstimate(fuelLiters: 0, co2Kg: co2, kwh: kwh);
    }

    // Combustion: litres = baseline * distance * multiplier.
    final baseLiters = profile.baseConsumptionL100km * distanceKm / 100.0;
    final fuelLiters = baseLiters * m;
    final co2 = fuelLiters * profile.co2KgPerLiter;
    return FuelEstimate(fuelLiters: fuelLiters, co2Kg: co2);
  }

  /// Returns a copy of [option] with `estimatedFuelLiters` / `estimatedCo2Kg`
  /// filled from [estimateForRoute] for [vehicle].
  ///
  /// [RouteOption] has no `copyWith`, so a fresh instance is built.
  RouteOption annotate(RouteOption option, EcoVehicleType vehicle) {
    final est = estimateForRoute(
      vehicle: vehicle,
      distanceMeters: option.distanceMeters,
      durationSeconds: option.durationSeconds,
    );
    return RouteOption(
      id: option.id,
      origin: option.origin,
      destination: option.destination,
      polyline: option.polyline,
      distanceMeters: option.distanceMeters,
      durationSeconds: option.durationSeconds,
      estimatedFuelLiters: double.parse(est.fuelLiters.toStringAsFixed(2)),
      estimatedCo2Kg: double.parse(est.co2Kg.toStringAsFixed(2)),
      routeMode: option.routeMode,
      provider: option.provider,
      metadata: option.metadata,
    );
  }

  /// Estimates the savings of a [candidate] route versus a [reference] route
  /// (e.g. the eco option vs the fastest) for [vehicle].
  ///
  /// Returns `reference - candidate` per component: positive values mean the
  /// candidate saves; negative values represent an extra cost. APPROX.
  FuelEstimate savingsVs({
    required RouteOption candidate,
    required RouteOption reference,
    required EcoVehicleType vehicle,
  }) {
    final cand = estimateForRoute(
      vehicle: vehicle,
      distanceMeters: candidate.distanceMeters,
      durationSeconds: candidate.durationSeconds,
    );
    final ref = estimateForRoute(
      vehicle: vehicle,
      distanceMeters: reference.distanceMeters,
      durationSeconds: reference.durationSeconds,
    );
    final kwh = (ref.kwh != null || cand.kwh != null)
        ? (ref.kwh ?? 0) - (cand.kwh ?? 0)
        : null;
    return FuelEstimate(
      fuelLiters: ref.fuelLiters - cand.fuelLiters,
      co2Kg: ref.co2Kg - cand.co2Kg,
      kwh: kwh,
    );
  }
}
