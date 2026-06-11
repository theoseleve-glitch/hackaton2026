part of 'echappee_map_screens.dart';

/// Fond de carte réel : tuiles OSM réchauffées aux couleurs de la marque,
/// trajet Clay Red liseré de blanc et haltes épinglées par catégorie.
class _EchappeeOsmMap extends StatelessWidget {
  const _EchappeeOsmMap({
    super.key,
    required this.origin,
    required this.destination,
    required this.polyline,
    required this.pois,
  });

  final GeoPoint origin;
  final GeoPoint destination;
  final List<GeoPoint> polyline;
  final List<Poi> pois;

  static const double _endpointSize = 20;
  static const double _poiMarkerSize = 36;
  static const double _poiMarkerBorder = 2.5;
  static const double _poiIconSize = 16;
  static const double _routeCasingWidth = 8;
  static const double _routeStrokeWidth = 5;

  /// Désature les tuiles OSM à ~0.82 puis les réchauffe légèrement (rouge
  /// poussé ×1.02 +10, vert +4, bleu retenu ×0.96 −8) pour coller au crème
  /// L'Échappée. Matrice 4×5, base luminance :
  /// C' = (lum·(1−s) + [s si canal courant]) avec lum = (.213, .715, .072).
  static const List<double> _warmTileMatrix = [
    0.8755, 0.1313, 0.0132, 0, 10, // R
    0.0383, 0.9487, 0.0130, 0, 4, // G
    0.0368, 0.1236, 0.7996, 0, -8, // B
    0, 0, 0, 1, 0, // A
  ];

  static LatLng _toLatLng(GeoPoint p) => LatLng(p.latitude, p.longitude);

  @override
  Widget build(BuildContext context) {
    final route = [for (final p in polyline) _toLatLng(p)];
    final bounds = LatLngBounds.fromPoints([
      _toLatLng(origin),
      _toLatLng(destination),
      ...route,
      for (final poi in pois) _toLatLng(poi.point),
    ]);
    return FlutterMap(
      options: MapOptions(
        initialCameraFit: CameraFit.bounds(
          bounds: bounds,
          padding: const EdgeInsets.all(EchappeeSpacing.s48),
          maxZoom: 16,
        ),
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
              // Liseré clair sous le trait Clay Red, pour la lisibilité.
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
            _originMarker(),
            _destinationMarker(),
            for (final poi in pois) _poiMarker(context, poi),
          ],
        ),
      ],
    );
  }

  /// Départ : cercle ouvert Olive avec point — écho du symbole de la marque.
  Marker _originMarker() => Marker(
        point: _toLatLng(origin),
        width: _endpointSize,
        height: _endpointSize,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: EchappeeColors.surface,
            shape: BoxShape.circle,
            border: Border.all(color: EchappeeColors.nature, width: 3),
            boxShadow: EchappeeShadows.sm,
          ),
          child: Center(
            child: Container(
              width: 6,
              height: 6,
              decoration: const BoxDecoration(
                color: EchappeeColors.nature,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ),
      );

  /// Arrivée : point plein Clay Red cerclé de blanc.
  Marker _destinationMarker() => Marker(
        point: _toLatLng(destination),
        width: _endpointSize,
        height: _endpointSize,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: EchappeeColors.primary,
            shape: BoxShape.circle,
            border: Border.all(color: EchappeeColors.surface, width: 2.5),
            boxShadow: EchappeeShadows.sm,
          ),
        ),
      );

  Marker _poiMarker(BuildContext context, Poi poi) {
    final style = _styleFor(poi.categorySlug);
    final borderColor = poi.isSponsored ? EchappeeColors.accent : style.color;
    return Marker(
      point: _toLatLng(poi.point),
      width: _poiMarkerSize,
      height: _poiMarkerSize,
      child: GestureDetector(
        onTap: () => context.push('/echappee/poi/${poi.id}'),
        child: Container(
          decoration: BoxDecoration(
            color: EchappeeColors.surface,
            shape: BoxShape.circle,
            border: Border.all(color: borderColor, width: _poiMarkerBorder),
            boxShadow: EchappeeShadows.sm,
          ),
          child: Icon(style.icon, size: _poiIconSize, color: style.color),
        ),
      ),
    );
  }
}
