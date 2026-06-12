import '../models/models.dart';

/// A live-traffic event on or near a route corridor.
class TrafficIncident {
  const TrafficIncident({
    required this.location,
    required this.kind,
    required this.description,
    this.delayMinutes,
  });

  final GeoPoint location;

  /// One of: 'accident' | 'works' | 'closure' | 'slowdown'.
  final String kind;
  final String description;

  /// Extra travel time caused by the incident, when the source provides it.
  final int? delayMinutes;
}

/// Pluggable live-traffic source. Implementations look up incidents within a
/// corridor around a route polyline; the routing layer stays provider-free.
abstract class TrafficService {
  /// Incidents within [corridorMeters] of [polyline] (route points in
  /// driving order). Implementations default [corridorMeters] to 500.
  Future<List<TrafficIncident>> incidentsAlong(
    List<GeoPoint> polyline, {
    double corridorMeters,
  });
}

/// Honest empty implementation: reports NO incidents (never fakes them), so
/// the UI can ship the traffic panel before a real feed is wired.
class MockTrafficService implements TrafficService {
  const MockTrafficService();

  @override
  Future<List<TrafficIncident>> incidentsAlong(
    List<GeoPoint> polyline, {
    double corridorMeters = 500,
  }) async =>
      const [];
}

/// STUB — Bison Futé, France's free national traffic feed.
///
/// Source: tipi.bison-fute.gouv.fr — DATEX II XML under Licence Ouverte
/// (free, no API key) but covers the NATIONAL network only (autoroutes +
/// routes nationales, no local roads).
///
/// Paid alternatives, for when full coverage / flow data is needed:
/// - TomTom Traffic API: free tier 2 500 req/day, then ~0.42 €/1 000 req —
///   full flow + incidents on all roads.
/// - HERE Traffic API: 250k transactions/month free — comparable coverage.
///
/// Bison Futé is the recommended first real integration: zero cost and
/// official French data, at the price of DATEX II XML parsing and
/// national-network-only coverage.
class BisonFuteTrafficService implements TrafficService {
  const BisonFuteTrafficService();

  @override
  Future<List<TrafficIncident>> incidentsAlong(
    List<GeoPoint> polyline, {
    double corridorMeters = 500,
  }) {
    // TODO(traffic): fetch the DATEX II XML feed from
    // tipi.bison-fute.gouv.fr, parse situation records into TrafficIncident,
    // then filter to points within [corridorMeters] of [polyline]
    // (GeoPoint.distanceTo against each polyline vertex is enough for a
    // first pass).
    throw UnimplementedError(
      'BisonFuteTrafficService: DATEX II parsing not implemented yet — '
      'use MockTrafficService.',
    );
  }
}
