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
    this.stopNumbers = const {},
  });

  final GeoPoint origin;
  final GeoPoint destination;
  final List<GeoPoint> polyline;
  final List<Poi> pois;

  /// Ordre de conduite des haltes (poi.id -> 1, 2, 3…) — badge sur le marker.
  final Map<String, int> stopNumbers;

  static const double _endpointSize = 20;
  static const double _poiMarkerSize = 36;
  static const double _poiMarkerBorder = 2.5;
  static const double _poiIconSize = 16;
  static const double _routeCasingWidth = 8;
  static const double _routeStrokeWidth = 5;

  /// Désature les tuiles OSM à ~0.82 puis les verdit légèrement (rouge
  /// retenu −4, vert poussé +6, bleu neutre −2) pour coller au papier sauge
  /// de la palette Forêt. Matrice 4×5, base luminance :
  /// C' = (lum·(1−s) + [s si canal courant]) avec lum = (.213, .715, .072).
  static const List<double> _warmTileMatrix = [
    0.8583, 0.1287, 0.0130, 0, -4, // R
    0.0391, 0.9680, 0.0133, 0, 6, // G
    0.0376, 0.1261, 0.8157, 0, -2, // B
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
    final number = stopNumbers[poi.id];
    return Marker(
      point: _toLatLng(poi.point),
      width: _poiMarkerSize,
      height: _poiMarkerSize,
      child: GestureDetector(
        onTap: () => context.push('/echappee/poi/${poi.id}'),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: _poiMarkerSize,
              height: _poiMarkerSize,
              decoration: BoxDecoration(
                color: EchappeeColors.surface,
                shape: BoxShape.circle,
                border:
                    Border.all(color: borderColor, width: _poiMarkerBorder),
                boxShadow: EchappeeShadows.sm,
              ),
              child: Icon(style.icon, size: _poiIconSize, color: style.color),
            ),
            if (number != null)
              Positioned(
                top: 0,
                right: 0,
                child: Container(
                  width: 16,
                  height: 16,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: EchappeeColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '$number',
                    style: EchappeeTypography.caption.copyWith(
                      color: EchappeeColors.surface,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      height: 1,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
