part of 'echappee_map_screens.dart';

/// Fond de carte de marque : crème soutenu, routes secondaires en quadrillage
/// doux, plans d'eau Mist Blue, trajet Clay Red et pins par catégorie.
class _EchappeeMapPainter extends CustomPainter {
  _EchappeeMapPainter({
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
    // Crème légèrement plus soutenu que le background, dérivé des tokens.
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..color = Color.alphaBlend(
            EchappeeColors.border.withAlpha(64), EchappeeColors.background),
    );
    _paintSecondaryRoads(canvas, size);
    _paintWater(canvas, size);

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
    const pad = EchappeeSpacing.s40;

    Offset project(GeoPoint p) => Offset(
          pad + (p.longitude - minLng) / lngSpan * (size.width - pad * 2),
          pad + (maxLat - p.latitude) / latSpan * (size.height - pad * 2),
        );

    if (polyline.length > 1) {
      final route = Paint()
        ..color = EchappeeColors.primary
        ..strokeWidth = 4
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round;
      final path = Path()
        ..moveTo(project(polyline.first).dx, project(polyline.first).dy);
      for (final p in polyline.skip(1)) {
        final o = project(p);
        path.lineTo(o.dx, o.dy);
      }
      canvas.drawPath(path, route);
    }

    // Départ : cercle ouvert · arrivée : point plein — écho du symbole.
    if (origin != null) {
      canvas.drawCircle(project(origin!), 6,
          Paint()..color = EchappeeColors.surface);
      canvas.drawCircle(
        project(origin!),
        6,
        Paint()
          ..color = EchappeeColors.primary
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3,
      );
    }
    if (destination != null) {
      canvas.drawCircle(
          project(destination!), 6, Paint()..color = EchappeeColors.primary);
    }

    for (final poi in pois) {
      final center = project(poi.point);
      final color = poi.isSponsored
          ? EchappeeColors.accent
          : _styleFor(poi.categorySlug).color;
      canvas.drawCircle(
          center, 8, Paint()..color = EchappeeColors.surface);
      canvas.drawCircle(
        center,
        8,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      canvas.drawCircle(center, 3, Paint()..color = color);
    }
  }

  void _paintSecondaryRoads(Canvas canvas, Size size) {
    final road = Paint()
      ..color = EchappeeColors.border.withAlpha(115)
      ..strokeWidth = 1.4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    for (var x = EchappeeSpacing.s64; x < size.width; x += EchappeeSpacing.s64) {
      final path = Path()
        ..moveTo(x, 0)
        ..quadraticBezierTo(x + EchappeeSpacing.s12, size.height / 2, x,
            size.height);
      canvas.drawPath(path, road);
    }
    for (var y = EchappeeSpacing.s64;
        y < size.height;
        y += EchappeeSpacing.s64) {
      final path = Path()
        ..moveTo(0, y)
        ..quadraticBezierTo(size.width / 2, y + EchappeeSpacing.s12,
            size.width, y);
      canvas.drawPath(path, road);
    }
  }

  void _paintWater(Canvas canvas, Size size) {
    final water =
        Paint()..color = EchappeeColors.mapAccent.withAlpha(31); // 12 %
    canvas.drawPath(_blob(size, 0.18, 0.16, 0.16), water);
    canvas.drawPath(_blob(size, 0.84, 0.34, 0.12), water);
    canvas.drawPath(_blob(size, 0.30, 0.74, 0.20), water);
  }

  Path _blob(Size size, double cx, double cy, double scale) {
    final c = Offset(size.width * cx, size.height * cy);
    final r = size.shortestSide * scale;
    return Path()
      ..moveTo(c.dx - r, c.dy)
      ..cubicTo(c.dx - r, c.dy - r * 0.9, c.dx - r * 0.2, c.dy - r * 0.7,
          c.dx + r * 0.4, c.dy - r * 0.6)
      ..cubicTo(c.dx + r * 1.1, c.dy - r * 0.45, c.dx + r * 0.9,
          c.dy + r * 0.5, c.dx + r * 0.3, c.dy + r * 0.7)
      ..cubicTo(c.dx - r * 0.3, c.dy + r * 0.9, c.dx - r, c.dy + r * 0.6,
          c.dx - r, c.dy)
      ..close();
  }

  @override
  bool shouldRepaint(covariant _EchappeeMapPainter old) =>
      old.origin != origin ||
      old.destination != destination ||
      !listEquals(old.polyline, polyline) ||
      !listEquals(old.pois, pois);
}

final _poiProvider = FutureProvider.family<Poi?, String>(
  (ref, id) => ref.watch(poiRepositoryProvider).getPoi(id),
);

/// Fiche d'une halte : pourquoi on la propose, et ce qu'on peut en faire.
class EchappeePoiDetailScreen extends ConsumerWidget {
  const EchappeePoiDetailScreen({super.key, required this.poiId});

  final String poiId;

  static const double _heroHeight = 220;
  static const double _heroLogoSize = 64;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final poiAsync = ref.watch(_poiProvider(poiId));
    return EchappeePage(
      child: Scaffold(
        body: poiAsync.when(
          loading: () => const EchappeeLoadingState(),
          error: (_, __) => const _PoiNotFound(),
          data: (poi) =>
              poi == null ? const _PoiNotFound() : _PoiDetailBody(poi: poi),
        ),
      ),
    );
  }
}

class _PoiNotFound extends StatelessWidget {
  const _PoiNotFound();

  @override
  Widget build(BuildContext context) {
    return EchappeeEmptyState(
      title: "Cette halte s'est envolée.",
      message: "On n'a pas retrouvé ce lieu — la route en garde d'autres.",
      actionLabel: 'Retour',
      onAction: () => context.go('/echappee/map'),
      icon: Icons.explore_off_outlined,
    );
  }
}

class _PoiDetailBody extends ConsumerWidget {
  const _PoiDetailBody({required this.poi});

  final Poi poi;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final style = _styleFor(poi.categorySlug);
    final description = poi.description;
    final city = poi.city;
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        Stack(
          children: [
            Container(
              height: EchappeePoiDetailScreen._heroHeight,
              width: double.infinity,
              color: EchappeeColors.primaryTint,
              child: Center(
                child: EchappeeLogo(
                  size: EchappeePoiDetailScreen._heroLogoSize,
                  color: EchappeeColors.primary.withAlpha(102), // 40 %
                ),
              ),
            ),
            const Positioned(
              top: 0,
              left: 0,
              child: SafeArea(
                child: Padding(
                  padding: EdgeInsets.only(
                    left: EchappeeSpacing.screen,
                    top: EchappeeSpacing.s12,
                  ),
                  child: _CircleBackButton(fallbackRoute: '/echappee/map'),
                ),
              ),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.all(EchappeeSpacing.screen),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(style.icon, size: 16, color: style.color),
                  const SizedBox(width: EchappeeSpacing.s4),
                  Text(
                    style.label,
                    style: EchappeeTypography.caption
                        .copyWith(color: style.color),
                  ),
                  const Text(' · ', style: EchappeeTypography.caption),
                  Text(
                    'Ouvert',
                    style: EchappeeTypography.caption
                        .copyWith(color: EchappeeColors.statusOpen),
                  ),
                ],
              ),
              if (poi.isSponsored) ...[
                const SizedBox(height: EchappeeSpacing.s8),
                const Row(children: [EchappeePartnerBadge()]),
              ],
              const SizedBox(height: EchappeeSpacing.s8),
              Text(poi.name, style: EchappeeTypography.h1),
              const SizedBox(height: EchappeeSpacing.s20),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(EchappeeSpacing.cardLoose),
                decoration: const BoxDecoration(
                  color: EchappeeColors.primaryTint,
                  borderRadius: EchappeeRadius.xlAll,
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    EchappeeEyebrow('Pourquoi on te le propose'),
                    SizedBox(height: EchappeeSpacing.s8),
                    Text(
                      'Une halte simple, locale, et juste assez proche pour '
                      'valoir le détour.',
                      style: EchappeeTypography.body,
                    ),
                  ],
                ),
              ),
              if (description != null) ...[
                const SizedBox(height: EchappeeSpacing.s20),
                Text(description, style: EchappeeTypography.bodyLarge),
              ],
              if (city != null) ...[
                const SizedBox(height: EchappeeSpacing.s12),
                Row(
                  children: [
                    const Icon(Icons.place,
                        size: 16, color: EchappeeColors.textSecondary),
                    const SizedBox(width: EchappeeSpacing.s4),
                    Text(city, style: EchappeeTypography.bodySmall),
                  ],
                ),
              ],
              const SizedBox(height: EchappeeSpacing.s32),
              EchappeeButton(
                label: 'Ajouter à ma route',
                icon: Icons.add_road_rounded,
                onPressed: () =>
                    _addFavorite(context, ref, 'Ajoutée à ton échappée.'),
              ),
              const SizedBox(height: EchappeeSpacing.s12),
              EchappeeButton(
                label: 'Garder pour plus tard',
                variant: EchappeeButtonVariant.secondary,
                icon: Icons.bookmark_border_rounded,
                onPressed: () =>
                    _addFavorite(context, ref, 'On te la garde au chaud.'),
              ),
              const SizedBox(height: EchappeeSpacing.s8),
              EchappeeButton(
                label: 'Y aller',
                variant: EchappeeButtonVariant.tertiary,
                onPressed: () => context.go('/echappee/map'),
              ),
              const SizedBox(height: EchappeeSpacing.s24),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _addFavorite(
      BuildContext context, WidgetRef ref, String message) async {
    final user = ref.read(authControllerProvider).valueOrNull;
    if (user == null) return;
    await ref
        .read(favoriteRepositoryProvider)
        .addFavorite(user.id, FavoriteTargetType.poi, poi.id);
    await ref.read(analyticsRepositoryProvider).logEvent(
      AnalyticsEvents.poiFavorited,
      properties: {'poiId': poi.id},
      productContext: ProductContext.terroir,
    );
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }
}
