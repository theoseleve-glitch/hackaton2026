import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/config.dart';
import '../../../app/providers.dart';
import '../../../shared/models/models.dart';
import '../../routing/presentation/route_planner_controller.dart';

/// Map placeholder: renders origin/destination/route/POIs on a CustomPaint
/// projection. Swap for a real map widget (flutter_map / mapbox) when a
/// provider is configured — the data layer stays identical.
class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  List<Poi> _pois = [];
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _loadPois();
  }

  Future<void> _loadPois() async {
    final planner = ref.read(routePlannerProvider);
    final repo = ref.read(poiRepositoryProvider);
    try {
      if (planner.isReady) {
        final along = await repo.poisAlongRoute(
            planner.origin!, planner.destination!,
            corridorMeters: 20000);
        if (mounted) setState(() => _pois = along.map((p) => p.poi).toList());
      } else {
        final center =
            await ref.read(locationRepositoryProvider).getCurrentPosition();
        final pois = await repo.nearbyPois(center, radiusMeters: 30000);
        if (mounted) setState(() => _pois = pois);
      }
    } catch (_) {
      // Non-fatal, but tell the user why the map is empty.
      if (mounted) {
        setState(() => _loadError = 'Impossible de charger les POI.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final planner = ref.watch(routePlannerProvider);
    final polyline = planner.selectedOption == null
        ? <GeoPoint>[]
        : ref
            .read(routingServiceProvider)
            .getRoutePolyline(planner.selectedOption!);
    return Scaffold(
      appBar: AppBar(title: Text(AppConfig.mapProviderLabel)),
      body: CustomPaint(
        size: Size.infinite,
        painter: _MapPainter(
          origin: planner.origin,
          destination: planner.destination,
          polyline: polyline,
          pois: _pois,
        ),
        child: _loadError != null && _pois.isEmpty
            ? Center(child: Text(_loadError!))
            : _pois.isEmpty && !planner.isReady
                ? const Center(
                    child: Text('Aucune donnée à afficher.\n'
                        'Choisissez un départ et une destination.'))
                : null,
      ),
    );
  }
}

class _MapPainter extends CustomPainter {
  _MapPainter({
    required this.origin,
    required this.destination,
    required this.polyline,
    required this.pois,
  });

  final GeoPoint? origin;
  final GeoPoint? destination;
  final List<GeoPoint> polyline;
  final List<Poi> pois;

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()..color = const Color(0xFFE8F0E8);
    canvas.drawRect(Offset.zero & size, bg);

    final all = <GeoPoint>[
      if (origin != null) origin!,
      if (destination != null) destination!,
      ...polyline,
      ...pois.map((p) => p.point),
    ];
    if (all.isEmpty) return;

    var minLat = all.first.latitude, maxLat = all.first.latitude;
    var minLng = all.first.longitude, maxLng = all.first.longitude;
    for (final p in all) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    final latSpan = (maxLat - minLat).abs() < 0.01 ? 0.01 : maxLat - minLat;
    final lngSpan = (maxLng - minLng).abs() < 0.01 ? 0.01 : maxLng - minLng;

    Offset project(GeoPoint p) => Offset(
          40 + (p.longitude - minLng) / lngSpan * (size.width - 80),
          40 + (maxLat - p.latitude) / latSpan * (size.height - 80),
        );

    if (polyline.length > 1) {
      final paint = Paint()
        ..color = const Color(0xFF1565C0)
        ..strokeWidth = 4
        ..style = PaintingStyle.stroke;
      final path = Path()..moveTo(project(polyline.first).dx, project(polyline.first).dy);
      for (final p in polyline.skip(1)) {
        final o = project(p);
        path.lineTo(o.dx, o.dy);
      }
      canvas.drawPath(path, paint);
    }

    final poiPaint = Paint()..color = const Color(0xFFE65100);
    for (final poi in pois) {
      canvas.drawCircle(project(poi.point), 6, poiPaint);
    }

    if (origin != null) {
      canvas.drawCircle(project(origin!), 9, Paint()..color = const Color(0xFF2E7D32));
    }
    if (destination != null) {
      canvas.drawCircle(project(destination!), 9, Paint()..color = const Color(0xFFC62828));
    }
  }

  @override
  bool shouldRepaint(covariant _MapPainter old) =>
      old.origin != origin ||
      old.destination != destination ||
      !listEquals(old.polyline, polyline) ||
      !listEquals(old.pois, pois);
}
