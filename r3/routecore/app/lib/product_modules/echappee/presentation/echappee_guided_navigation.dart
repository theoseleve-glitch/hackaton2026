import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../features/navigation/presentation/navigation_screen.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../ecodrive/data/driving_sensors.dart';
import '../../ecodrive/data/eco_stats_store.dart';
import '../../ecodrive/presentation/arrival_summary_screen.dart';
import '../../ecodrive/presentation/eco_coach_controller.dart';
import '../../ecodrive/presentation/eco_coach_overlay.dart';

/// Navigation guidée + coach éco live : compose l'écran de navigation
/// (carte course-up, instructions) avec le contrôleur éco (conseils temps
/// réel, score live) et le bilan d'arrivée (score, économies, registre
/// annuel).
class EchappeeGuidedNavigationScreen extends ConsumerStatefulWidget {
  const EchappeeGuidedNavigationScreen({super.key});

  @override
  ConsumerState<EchappeeGuidedNavigationScreen> createState() =>
      _EchappeeGuidedNavigationScreenState();
}

class _EchappeeGuidedNavigationScreenState
    extends ConsumerState<EchappeeGuidedNavigationScreen> {
  late final EcoCoachController _coach;

  /// Capteurs de conduite live (accéléro + gyro) alimentant la détection
  /// d'événements brusques et le conseil « Anticipe ». Sur émulateur le flux
  /// reste silencieux ([DrivingSensors.available] = false) → mode GPS-seul,
  /// rien ne plante.
  late final DrivingSensors _sensors;
  StreamSubscription<DrivingSample>? _sensorsSub;
  bool _finished = false;

  @override
  void initState() {
    super.initState();
    _coach = ref.read(ecoCoachControllerProvider);
    // Branche les capteurs sur le coach : chaque échantillon validé alimente
    // la fenêtre de décélérations brusques (conseil « Anticipe »).
    _sensors = DrivingSensors();
    _sensorsSub = _sensors.samples.listen(_coach.onDrivingSample);
    // Démarre le coach sur la route sélectionnée (conseils géométriques :
    // virages serrés détectés sur la polyline).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final planner = ref.read(routePlannerProvider);
      final option = planner.selectedOption ??
          planner.options.valueOrNull?.firstOrNull;
      if (option != null) {
        final line =
            ref.read(routingServiceProvider).getRoutePolyline(option);
        if (line.length >= 2) _coach.start(routePolyline: line);
      }
    });
  }

  @override
  void dispose() {
    _sensorsSub?.cancel();
    unawaited(_sensors.dispose());
    super.dispose();
  }

  Future<void> _onArrived(double distanceKm, double durationSeconds) async {
    if (_finished || !mounted) return;
    _finished = true;
    final score = _coach.finish(
      distanceKm: distanceKm,
      durationSeconds: durationSeconds,
    );
    // Registre annuel (stats home) — best-effort, le bilan s'affiche même
    // si la persistance échoue.
    try {
      await ref
          .read(ecoLedgerProvider.notifier)
          .recordTrip(score, distanceKm);
    } catch (_) {}
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
      builder: (_) =>
          ArrivalSummaryScreen(score: score, distanceKm: distanceKm),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return EchappeeNavigationScreen(
      coachOverlay: EcoCoachOverlay(state: _coach.state),
      onPositionUpdate: (position, speedMps) {
        // updateSpeed AVANT onPosition : la tendance de vitesse GPS donne le
        // signe de l'accélération longitudinale du prochain échantillon
        // capteur (freinage vs accélération).
        _sensors.updateSpeed(speedMps);
        // Altitude null : NavState/onPositionUpdate ne la portent pas encore
        // (GeoPoint n'a pas d'altitude). Le contrôleur gère le GPS-seul
        // (pente = 0). Travail futur : exposer l'altitude via le flux de
        // localisation (sans toucher GeoPoint ni le repo de localisation).
        _coach.onPosition(position, speedMps);
      },
      onArrived: (km, seconds) => _onArrived(km, seconds),
    );
  }
}
