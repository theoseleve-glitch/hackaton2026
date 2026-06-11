part of 'echappee_map_screens.dart';

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
