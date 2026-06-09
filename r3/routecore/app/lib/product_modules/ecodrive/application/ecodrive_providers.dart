import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/eco_vehicle_type.dart';

/// The vehicle type the driver selected in the EcoDrive flow.
///
/// Drives both the per-vehicle fuel/CO2 figures on the route comparison screen
/// and the fuel/CO2 estimate used by the eco scoring service (via
/// `scoringServiceProvider`). Defaults to [EcoVehicleType.petrol].
final selectedEcoVehicleProvider =
    StateProvider<EcoVehicleType>((ref) => EcoVehicleType.petrol);
