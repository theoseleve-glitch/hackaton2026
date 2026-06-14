import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../../core/logging/app_logger.dart';
import '../../../shared/models/models.dart';

/// Turn-by-turn directions via the public OSRM demo server — same provider,
/// host and conventions as [OsrmRoutingService], but with `steps=true` so the
/// response carries one maneuver per step (turn, roundabout, arrive…).
/// Demo server policy: light usage only (fine for dev/MVP).
///
/// The HTTP layer is a thin shell; all the mapping lives in the pure
/// [parseSteps] / [frenchText] functions so it stays unit-testable.
class OsrmDirectionsService {
  OsrmDirectionsService({http.Client? client, this.baseUrl})
      : _client = client ?? http.Client();

  final http.Client _client;
  final String? baseUrl;
  static const _log = AppLogger('osrm-directions');

  String get _base => baseUrl ?? 'https://router.project-osrm.org';

  /// Fetches the driving route [origin] → [destination] and returns its
  /// maneuvers in driving order. Throws on network/parse failure — the
  /// caller decides how to degrade (there is no meaningful mock fallback
  /// for live guidance).
  Future<List<NavInstruction>> getDirections({
    required GeoPoint origin,
    required GeoPoint destination,
    List<GeoPoint> vias = const [],
  }) async {
    try {
      // origine → étapes manuelles (dans l'ordre) → destination. parseSteps
      // parcourt déjà TOUS les legs, donc le tour-par-tour traverse les étapes.
      final coords = [origin, ...vias, destination]
          .map((p) => '${p.longitude},${p.latitude}')
          .join(';');
      final uri = Uri.parse(
        '$_base/route/v1/driving/$coords'
        '?overview=full&geometries=geojson&steps=true',
      );
      final res = await _client.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) {
        throw Exception('OSRM HTTP ${res.statusCode}');
      }
      final instructions =
          parseSteps(jsonDecode(res.body) as Map<String, dynamic>);
      if (instructions.isEmpty) throw Exception('OSRM: no steps');
      return instructions;
    } catch (e) {
      _log.warn('directions request failed: $e');
      rethrow;
    }
  }
}

/// One lane of the road at the upcoming maneuver (OSRM
/// `intersections[].lanes`). [valid] = this lane can be used for the maneuver;
/// [indications] = the arrows it carries ('straight', 'slight right', 'left'…).
class NavLane {
  const NavLane({required this.valid, this.indications = const []});

  final bool valid;
  final List<String> indications;
}

/// One navigable maneuver parsed from an OSRM step.
class NavInstruction {
  const NavInstruction({
    required this.maneuverType,
    required this.location,
    required this.distanceMeters,
    required this.durationSeconds,
    this.modifier,
    this.exitNumber,
    this.roadName,
    this.points = const [],
    this.lanes = const [],
  });

  /// OSRM maneuver type: turn / roundabout / rotary / depart / arrive /
  /// merge / continue / on ramp / off ramp / fork / end of road / new name…
  final String maneuverType;

  /// OSRM modifier: left / right / slight left / slight right / sharp left /
  /// sharp right / straight / uturn.
  final String? modifier;

  /// Roundabout exit number (`maneuver.exit`), null otherwise.
  final int? exitNumber;

  /// Road taken after the maneuver (null when OSRM gives an empty name).
  final String? roadName;

  /// Where the maneuver happens.
  final GeoPoint location;

  /// Length of the step driven after this maneuver.
  final double distanceMeters;
  final double durationSeconds;

  /// Step geometry (from the maneuver to the next one).
  final List<GeoPoint> points;

  /// Lane guidance for this maneuver (empty when OSRM carries no `lanes`).
  final List<NavLane> lanes;
}

/// Pure mapping OSRM `/route?steps=true` JSON → instructions in driving
/// order, across all legs of the first route (unit-tested).
List<NavInstruction> parseSteps(Map<String, dynamic> json) {
  final routes =
      (json['routes'] as List? ?? const []).cast<Map<String, dynamic>>();
  if (routes.isEmpty) return const [];
  final legs =
      (routes.first['legs'] as List? ?? const []).cast<Map<String, dynamic>>();
  final instructions = <NavInstruction>[];
  for (final leg in legs) {
    final steps =
        (leg['steps'] as List? ?? const []).cast<Map<String, dynamic>>();
    for (final step in steps) {
      final maneuver = step['maneuver'] as Map<String, dynamic>? ?? const {};
      // GeoJSON order is [lng, lat] everywhere in the OSRM response.
      final location = (maneuver['location'] as List?) ?? const [0, 0];
      final geometry = step['geometry'] as Map<String, dynamic>? ?? const {};
      final coords = (geometry['coordinates'] as List? ?? const []).cast<List>();
      final name = (step['name'] as String?)?.trim();
      // Guidage de file : on prend les lanes de la DERNIÈRE intersection du
      // step qui en porte (la plus proche de la manœuvre). Souvent absent du
      // serveur démo OSRM (tag turn:lanes clairsemé) -> liste vide alors.
      final intersections =
          (step['intersections'] as List? ?? const []).whereType<Map>();
      var lanes = const <NavLane>[];
      for (final intersection in intersections) {
        final raw = intersection['lanes'] as List?;
        if (raw != null && raw.isNotEmpty) {
          lanes = [
            for (final lane in raw.whereType<Map>())
              NavLane(
                valid: (lane['valid'] as bool?) ?? false,
                indications: ((lane['indications'] as List?) ?? const [])
                    .map((e) => e.toString())
                    .toList(growable: false),
              ),
          ];
        }
      }
      instructions.add(NavInstruction(
        maneuverType: maneuver['type'] as String? ?? 'continue',
        modifier: maneuver['modifier'] as String?,
        exitNumber: (maneuver['exit'] as num?)?.toInt(),
        roadName: (name == null || name.isEmpty) ? null : name,
        lanes: lanes,
        location: GeoPoint(
          latitude: (location[1] as num).toDouble(),
          longitude: (location[0] as num).toDouble(),
        ),
        distanceMeters: ((step['distance'] as num?) ?? 0).toDouble(),
        durationSeconds: ((step['duration'] as num?) ?? 0).toDouble(),
        points: [
          for (final c in coords)
            GeoPoint(
              latitude: (c[1] as num).toDouble(),
              longitude: (c[0] as num).toDouble(),
            ),
        ],
      ));
    }
  }
  return instructions;
}

/// Concatenates the step geometries into the full route polyline (drops the
/// duplicated point shared by two consecutive steps). Pure helper.
List<GeoPoint> stitchGeometry(List<NavInstruction> instructions) {
  final points = <GeoPoint>[];
  for (final instruction in instructions) {
    for (final p in instruction.points) {
      if (points.isEmpty || points.last != p) points.add(p);
    }
  }
  return points;
}

/// French guidance text for an instruction — voix L'Échappée : tutoiement,
/// phrases courtes. Pure, total (any type/modifier combination yields a
/// sentence).
String frenchText(NavInstruction instruction) {
  final road = instruction.roadName;
  switch (instruction.maneuverType) {
    case 'depart':
      return 'Prends la route';
    case 'arrive':
      return 'Tu es arrivé·e — belle route.';
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      final exit = instruction.exitNumber;
      if (exit == null) return 'Au rond-point, suis la route principale';
      return 'Au rond-point, prends la ${_frenchOrdinal(exit)} sortie';
    case 'exit roundabout':
    case 'exit rotary':
      return 'Sors du rond-point${_onRoad(road)}';
    case 'merge':
      return road == null ? 'Insère-toi sur la voie' : 'Insère-toi sur $road';
    case 'on ramp':
      return 'Prends la bretelle${_sideSuffix(instruction.modifier)}';
    case 'off ramp':
      return 'Prends la sortie${_sideSuffix(instruction.modifier)}';
    default:
      // turn / continue / new name / end of road / fork… : the modifier
      // carries the direction.
      return _turnText(instruction.modifier, road);
  }
}

String _turnText(String? modifier, String? road) {
  switch (modifier) {
    case 'left':
      return 'Tourne à gauche${_onRoad(road)}';
    case 'right':
      return 'Tourne à droite${_onRoad(road)}';
    case 'slight left':
      return 'Serre à gauche${_onRoad(road)}';
    case 'slight right':
      return 'Serre à droite${_onRoad(road)}';
    case 'sharp left':
      return 'Tourne franchement à gauche${_onRoad(road)}';
    case 'sharp right':
      return 'Tourne franchement à droite${_onRoad(road)}';
    case 'uturn':
      return 'Fais demi-tour';
    case 'straight':
      return 'Continue tout droit';
    default:
      return road == null ? 'Continue tout droit' : 'Continue sur $road';
  }
}

String _onRoad(String? road) => road == null ? '' : ' sur $road';

String _sideSuffix(String? modifier) {
  if (modifier == null) return '';
  if (modifier.contains('left')) return ' à gauche';
  if (modifier.contains('right')) return ' à droite';
  return '';
}

/// 1 → « 1re », n → « ne » (2e, 3e…).
String _frenchOrdinal(int n) => n == 1 ? '1re' : '${n}e';
