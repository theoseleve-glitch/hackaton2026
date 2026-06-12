import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart' show LatLng;

import '../../../app/providers.dart';
import '../../../core/logging/app_logger.dart';
import '../../../product_modules/echappee/design_system/design_system.dart';
import '../../../product_modules/echappee/presentation/echappee_page.dart';
import '../../../shared/models/models.dart';
import '../../location/data/location_repositories.dart';
import '../../routing/presentation/route_planner_controller.dart';
import '../data/osrm_directions_service.dart';
import '../domain/navigation_engine.dart';

/// Navigation guidée L'Échappée : carte plein écran qui suit la position,
/// instruction en haut (« Au rond-point, prends la 2e sortie »), ETA et
/// distance restante en bas. Sur émulateur (pas de GPS réel branché), la
/// conduite est simulée le long du trajet — chip « Simulation » affichée.
///
/// La route est câblée ailleurs ('/echappee/navigation') — ce fichier
/// n'exporte que le widget.
class EchappeeNavigationScreen extends ConsumerStatefulWidget {
  const EchappeeNavigationScreen({super.key});

  @override
  ConsumerState<EchappeeNavigationScreen> createState() =>
      _EchappeeNavigationScreenState();
}

class _EchappeeNavigationScreenState
    extends ConsumerState<EchappeeNavigationScreen> {
  static const _log = AppLogger('echappee-nav');
  static const double _followZoom = 16;
  static const double _routeCasingWidth = 8;
  static const double _routeStrokeWidth = 5;
  static const double _positionMarkerSize = 22;
  static const Duration _recalcCooldown = Duration(seconds: 10);

  /// Tuiles OSM réchauffées aux couleurs de la marque — même matrice que la
  /// carte de l'atelier (echappee_map_osm.dart), dupliquée car privée là-bas.
  static const List<double> _warmTileMatrix = [
    0.8755, 0.1313, 0.0132, 0, 10, // R
    0.0383, 0.9487, 0.0130, 0, 4, // G
    0.0368, 0.1236, 0.7996, 0, -8, // B
    0, 0, 0, 1, 0, // A
  ];

  final _mapController = MapController();
  final _directions = OsrmDirectionsService();

  GeoPoint? _origin;
  GeoPoint? _destination;
  List<GeoPoint> _routePolyline = const [];
  List<NavInstruction>? _instructions;
  NavigationEngine? _engine;
  NavState? _nav;
  GeoPoint? _position;
  bool _simulated = false;
  bool _recalculating = false;
  DateTime? _lastRecalcAt;
  String? _error;
  StreamSubscription<GpsTrackPoint>? _gpsSub;
  StreamSubscription<GeoPoint>? _simSub;

  @override
  void initState() {
    super.initState();
    final planner = ref.read(routePlannerProvider);
    final options = planner.options.valueOrNull ?? const <RouteOption>[];
    final option =
        planner.selectedOption ?? (options.isEmpty ? null : options.first);
    if (planner.isReady && option != null) {
      _origin = planner.origin;
      _destination = planner.destination;
      // Tracé initial : la géométrie de l'option choisie, remplacée dès que
      // la géométrie portée par les steps OSRM arrive.
      _routePolyline = _decodePolyline(option);
      unawaited(_init());
    }
  }

  @override
  void dispose() {
    _gpsSub?.cancel();
    _simSub?.cancel();
    _mapController.dispose();
    super.dispose();
  }

  /// Décode le polyline `lat,lng;lat,lng` quand
  /// metadata['polylineFormat'] == 'latlng-list' (mock + OSRM). Autre format
  /// (encodé Google/Mapbox) : ligne droite en attendant la géométrie OSRM.
  static List<GeoPoint> _decodePolyline(RouteOption option) {
    if (option.metadata['polylineFormat'] != 'latlng-list') {
      return [option.origin, option.destination];
    }
    return [
      for (final pair in option.polyline.split(';'))
        GeoPoint(
          latitude: double.parse(pair.split(',')[0]),
          longitude: double.parse(pair.split(',')[1]),
        ),
    ];
  }

  Future<void> _init() async {
    final origin = _origin!;
    final destination = _destination!;
    try {
      // MVP : même si l'option sélectionnée passe par des haltes
      // (metadata['viaCount']), on redemande à OSRM le trajet direct avec les
      // MÊMES origine/destination et on navigue sur la géométrie retournée
      // avec les steps — instructions et tracé restent ainsi alignés.
      final instructions = await _directions.getDirections(
          origin: origin, destination: destination);
      if (!mounted) return;
      final geometry = stitchGeometry(instructions);
      setState(() {
        _instructions = instructions;
        if (geometry.length > 1) _routePolyline = geometry;
        _engine = NavigationEngine(
            instructions: instructions, polyline: _routePolyline);
      });
      _startPositionStream();
    } catch (e) {
      _log.warn('directions indisponibles: $e');
      if (mounted) {
        setState(() =>
            _error = 'La navigation ne répond pas. Réessaie dans un instant.');
      }
    }
  }

  /// GPS réel quand le device en a un (repo Geolocator) ; sinon — émulateur,
  /// desktop, démo — on rejoue le trajet en accéléré.
  void _startPositionStream() {
    final repo = ref.read(locationRepositoryProvider);
    if (repo is GeolocatorLocationRepository) {
      _gpsSub = repo
          .watchPosition(
            tripId: 'nav-${DateTime.now().millisecondsSinceEpoch}',
            userId: 'navigation',
          )
          .listen(
            (pt) => _onPosition(pt.point, speedMps: pt.speedMps),
            onError: (Object e) {
              _log.warn('GPS indisponible, bascule en simulation: $e');
              _startSimulation();
            },
          );
    } else {
      _startSimulation();
    }
  }

  void _startSimulation() {
    if (!mounted || _simulated) return;
    _gpsSub?.cancel();
    final drive = SimulatedDrive(polyline: _routePolyline);
    setState(() => _simulated = true);
    _simSub = drive
        .positions()
        .listen((p) => _onPosition(p, speedMps: drive.speedMps));
  }

  void _onPosition(GeoPoint p, {double? speedMps}) {
    final engine = _engine;
    if (!mounted || engine == null) return;
    final nav = engine.update(p, speedMps: speedMps);
    setState(() {
      _position = p;
      _nav = nav;
    });
    try {
      _mapController.move(LatLng(p.latitude, p.longitude), _followZoom);
    } catch (_) {
      // Carte pas encore rendue : le prochain fix recadrera.
    }
    if (nav.offRoute && !_simulated) unawaited(_maybeRecalculate(p));
  }

  /// Hors route → re-demande les directions depuis la position courante,
  /// au plus une fois toutes les 10 s.
  Future<void> _maybeRecalculate(GeoPoint from) async {
    final destination = _destination;
    if (destination == null || _recalculating) return;
    final last = _lastRecalcAt;
    if (last != null && DateTime.now().difference(last) < _recalcCooldown) {
      return;
    }
    _lastRecalcAt = DateTime.now();
    setState(() => _recalculating = true);
    try {
      final instructions = await _directions.getDirections(
          origin: from, destination: destination);
      if (!mounted) return;
      final geometry = stitchGeometry(instructions);
      setState(() {
        _instructions = instructions;
        if (geometry.length > 1) _routePolyline = geometry;
        _engine = NavigationEngine(
            instructions: instructions, polyline: _routePolyline);
      });
    } catch (e) {
      _log.warn('recalcul impossible: $e');
    } finally {
      if (mounted) setState(() => _recalculating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final origin = _origin;
    if (origin == null || _destination == null) {
      return EchappeePage(
        child: Scaffold(
          body: EchappeeEmptyState(
            title: "Choisis d'abord un itinéraire.",
            message: 'La navigation démarre depuis un trajet calculé.',
            actionLabel: 'Retour',
            onAction: () => context.pop(),
            icon: Icons.navigation_outlined,
          ),
        ),
      );
    }
    if (_error != null) {
      return EchappeePage(
        child: Scaffold(
          body: EchappeeEmptyState(
            title: 'La route se dérobe.',
            message: _error!,
            actionLabel: 'Réessayer',
            onAction: () {
              setState(() => _error = null);
              unawaited(_init());
            },
            icon: Icons.wifi_off,
          ),
        ),
      );
    }
    return EchappeePage(
      child: Scaffold(
        body: Stack(
          children: [
            Positioned.fill(child: _buildMap(origin)),
            SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(EchappeeSpacing.screen,
                        EchappeeSpacing.s12, EchappeeSpacing.screen, 0),
                    child: _buildInstructionCard(),
                  ),
                  if (_simulated)
                    const Padding(
                      padding: EdgeInsets.only(
                          top: EchappeeSpacing.s8,
                          right: EchappeeSpacing.screen),
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: _SimulationChip(),
                      ),
                    ),
                  const Spacer(),
                  const Padding(
                    padding: EdgeInsets.only(
                        right: EchappeeSpacing.screen,
                        bottom: EchappeeSpacing.s4),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: Text('© OpenStreetMap',
                          style: EchappeeTypography.bodySmall),
                    ),
                  ),
                  _buildBottomBar(context),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMap(GeoPoint origin) {
    final position = _position;
    final route = [
      for (final p in _routePolyline) LatLng(p.latitude, p.longitude),
    ];
    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter:
            LatLng((position ?? origin).latitude, (position ?? origin).longitude),
        initialZoom: _followZoom,
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.routecore.routecore',
          tileBuilder: (context, tileWidget, tile) => ColorFiltered(
            colorFilter: const ColorFilter.matrix(_warmTileMatrix),
            child: tileWidget,
          ),
        ),
        if (route.length > 1)
          PolylineLayer(
            polylines: [
              // Liseré clair sous le trait, comme la carte de l'atelier.
              Polyline(
                points: route,
                color: EchappeeColors.surface,
                strokeWidth: _routeCasingWidth,
              ),
              Polyline(
                points: route,
                color: EchappeeColors.primary,
                strokeWidth: _routeStrokeWidth,
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            if (route.isNotEmpty)
              Marker(
                point: route.last,
                width: _positionMarkerSize,
                height: _positionMarkerSize,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: EchappeeColors.primary,
                    shape: BoxShape.circle,
                    border:
                        Border.all(color: EchappeeColors.surface, width: 2.5),
                    boxShadow: EchappeeShadows.sm,
                  ),
                ),
              ),
            if (position != null)
              Marker(
                point: LatLng(position.latitude, position.longitude),
                width: _positionMarkerSize,
                height: _positionMarkerSize,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: EchappeeColors.mapAccent,
                    shape: BoxShape.circle,
                    border: Border.all(color: EchappeeColors.surface, width: 3),
                    boxShadow: EchappeeShadows.sm,
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildInstructionCard() {
    final nav = _nav;
    if (_recalculating) {
      return const _InstructionCard(
          icon: Icons.refresh, title: 'Recalcul…', loading: true);
    }
    if (_instructions == null || nav?.current == null) {
      return const _InstructionCard(
        icon: Icons.route,
        title: "Préparation de l'itinéraire…",
        loading: true,
      );
    }
    final current = nav!.current!;
    return _InstructionCard(
      icon: _maneuverIcon(current),
      title: frenchText(current),
      distanceLabel: current.maneuverType == 'arrive'
          ? null
          : _formatDistance(nav.distanceToManeuverMeters),
    );
  }

  Widget _buildBottomBar(BuildContext context) {
    final nav = _nav;
    final etaClock = nav == null
        ? '—'
        : _formatClock(
            DateTime.now().add(Duration(seconds: nav.etaSeconds.round())));
    final remaining = nav == null ? '—' : _formatRemaining(nav.etaSeconds);
    final distance = nav == null ? '—' : _formatDistance(nav.remainingMeters);
    return Padding(
      padding: const EdgeInsets.fromLTRB(EchappeeSpacing.screen,
          EchappeeSpacing.s8, EchappeeSpacing.screen, EchappeeSpacing.s16),
      child: Container(
        padding: const EdgeInsets.all(EchappeeSpacing.card),
        decoration: const BoxDecoration(
          color: EchappeeColors.surface,
          borderRadius: EchappeeRadius.xlAll,
          boxShadow: EchappeeShadows.lg,
        ),
        child: Row(
          children: [
            Expanded(child: _Stat(label: 'Arrivée', value: etaClock)),
            Expanded(child: _Stat(label: 'Durée', value: remaining)),
            Expanded(child: _Stat(label: 'Distance', value: distance)),
            EchappeeButton(
              label: 'Quitter',
              variant: EchappeeButtonVariant.secondary,
              expanded: false,
              onPressed: () => context.pop(),
            ),
          ],
        ),
      ),
    );
  }
}

IconData _maneuverIcon(NavInstruction instruction) {
  final modifier = instruction.modifier ?? '';
  final left = modifier.contains('left');
  switch (instruction.maneuverType) {
    case 'depart':
      return Icons.navigation_rounded;
    case 'arrive':
      return Icons.sports_score;
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
    case 'exit roundabout':
    case 'exit rotary':
      return left ? Icons.roundabout_left : Icons.roundabout_right;
    case 'merge':
      return Icons.merge;
    case 'on ramp':
    case 'off ramp':
      return left ? Icons.ramp_left : Icons.ramp_right;
    case 'fork':
      return left ? Icons.fork_left : Icons.fork_right;
  }
  switch (modifier) {
    case 'left':
      return Icons.turn_left;
    case 'right':
      return Icons.turn_right;
    case 'slight left':
      return Icons.turn_slight_left;
    case 'slight right':
      return Icons.turn_slight_right;
    case 'sharp left':
      return Icons.turn_sharp_left;
    case 'sharp right':
      return Icons.turn_sharp_right;
    case 'uturn':
      return Icons.u_turn_left;
  }
  return Icons.straight;
}

/// « 300 m », « 1,2 km », « 42 km ».
String _formatDistance(double meters) {
  if (meters < 1000) return '${(meters / 10).round() * 10} m';
  final km = meters / 1000;
  if (km >= 10) return '${km.round()} km';
  return '${km.toStringAsFixed(1).replaceAll('.', ',')} km';
}

/// « 1h12 », « 8 min ».
String _formatRemaining(double seconds) {
  final total = seconds.round();
  final h = total ~/ 3600;
  final m = (total % 3600) ~/ 60;
  if (h > 0) return '${h}h${m.toString().padLeft(2, '0')}';
  return '${m < 1 ? 1 : m} min';
}

/// « 14:07 ».
String _formatClock(DateTime t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

/// Card du haut : icône de manœuvre, distance et consigne en français.
class _InstructionCard extends StatelessWidget {
  const _InstructionCard({
    required this.icon,
    required this.title,
    this.distanceLabel,
    this.loading = false,
  });

  final IconData icon;
  final String title;
  final String? distanceLabel;
  final bool loading;

  static const double _iconDiscSize = 56;
  static const double _iconSize = 32;
  static const double _spinnerSize = 18;
  static const double _spinnerStroke = 2;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(EchappeeSpacing.card),
      decoration: const BoxDecoration(
        color: EchappeeColors.surface,
        borderRadius: EchappeeRadius.xlAll,
        boxShadow: EchappeeShadows.lg,
      ),
      child: Row(
        children: [
          Container(
            width: _iconDiscSize,
            height: _iconDiscSize,
            decoration: const BoxDecoration(
              color: EchappeeColors.primaryTint,
              shape: BoxShape.circle,
            ),
            child: loading
                ? const Center(
                    child: SizedBox(
                      width: _spinnerSize,
                      height: _spinnerSize,
                      child: CircularProgressIndicator(
                        strokeWidth: _spinnerStroke,
                        color: EchappeeColors.primary,
                      ),
                    ),
                  )
                : Icon(icon, size: _iconSize, color: EchappeeColors.primary),
          ),
          const SizedBox(width: EchappeeSpacing.s16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (distanceLabel != null)
                  Text(
                    distanceLabel!,
                    style: EchappeeTypography.h3
                        .copyWith(color: EchappeeColors.primary),
                  ),
                Text(
                  title,
                  style: EchappeeTypography.body
                      .copyWith(fontWeight: FontWeight.w600),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Pill discret signalant la conduite simulée (démo émulateur).
class _SimulationChip extends StatelessWidget {
  const _SimulationChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: EchappeeSpacing.s12, vertical: EchappeeSpacing.s4),
      decoration: const BoxDecoration(
        color: EchappeeColors.accentTint,
        borderRadius: EchappeeRadius.fullAll,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.play_arrow_rounded,
              size: 14, color: EchappeeColors.textPrimary),
          const SizedBox(width: EchappeeSpacing.s4),
          Text(
            'Simulation',
            style: EchappeeTypography.caption.copyWith(
              color: EchappeeColors.textPrimary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Petite stat du bandeau bas (valeur + libellé).
class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: EchappeeTypography.h3),
        Text(label, style: EchappeeTypography.caption),
      ],
    );
  }
}
