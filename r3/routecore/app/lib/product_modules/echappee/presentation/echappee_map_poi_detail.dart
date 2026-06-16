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
    // Statut d'ouverture RÉEL (parseur OSM) — honnêteté : pas de chip si on ne
    // sait pas (horaires absents ou non interprétables).
    final hoursRaw = poi.openingHours?['raw'] as String?;
    final openNow = hoursRaw == null
        ? null
        : OpeningHours.tryParse(hoursRaw)?.isOpenAt(DateTime.now());
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
                  if (openNow != null) ...[
                    const Text(' · ', style: EchappeeTypography.caption),
                    Text(
                      openNow ? 'Ouvert' : 'Fermé',
                      style: EchappeeTypography.caption.copyWith(
                        color: openNow
                            ? EchappeeColors.statusOpen
                            : EchappeeColors.textSecondary,
                      ),
                    ),
                  ],
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
              if (city != null && poi.address == null) ...[
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
              _PracticalInfo(poi: poi, openNow: openNow),
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

/// Section « Infos pratiques » : adresse, horaires (avec statut), téléphone,
/// site et e-mail cliquables, et labels (bio, accessible…). N'affiche que ce
/// qui existe — honnêteté sur la couverture variable des données OSM.
class _PracticalInfo extends StatelessWidget {
  const _PracticalInfo({required this.poi, required this.openNow});

  final Poi poi;
  final bool? openNow;

  @override
  Widget build(BuildContext context) {
    final raw = poi.openingHours?['raw'] as String?;
    final rows = <Widget>[
      if (poi.address != null)
        _InfoRow(icon: Icons.place_outlined, text: poi.address!),
      if (raw != null)
        _InfoRow(
          icon: Icons.schedule_outlined,
          text: raw,
          trailing: openNow == null
              ? null
              : Text(
                  openNow! ? 'Ouvert' : 'Fermé',
                  style: EchappeeTypography.caption.copyWith(
                    color: openNow!
                        ? EchappeeColors.statusOpen
                        : EchappeeColors.textSecondary,
                  ),
                ),
        ),
      if (poi.phone != null)
        _InfoRow(
          icon: Icons.call_outlined,
          text: poi.phone!,
          onTap: () => _launchExternal('tel:${poi.phone}'),
        ),
      if (poi.websiteUrl != null)
        _InfoRow(
          icon: Icons.language_outlined,
          text: _prettyUrl(poi.websiteUrl!),
          onTap: () => _launchExternal(poi.websiteUrl!),
        ),
      if (poi.email != null)
        _InfoRow(
          icon: Icons.mail_outline,
          text: poi.email!,
          onTap: () => _launchExternal('mailto:${poi.email}'),
        ),
    ];
    final labels = [for (final t in poi.tags) _labelText(t)];
    if (rows.isEmpty && labels.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: EchappeeSpacing.s20),
        const EchappeeEyebrow('Infos pratiques'),
        const SizedBox(height: EchappeeSpacing.s8),
        ...rows,
        if (labels.isNotEmpty) ...[
          const SizedBox(height: EchappeeSpacing.s8),
          Wrap(
            spacing: EchappeeSpacing.s8,
            runSpacing: EchappeeSpacing.s8,
            children: [for (final l in labels) _LabelChip(label: l)],
          ),
        ],
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(
      {required this.icon, required this.text, this.onTap, this.trailing});

  final IconData icon;
  final String text;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final link = onTap != null;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: EchappeeSpacing.s8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon,
                size: 18,
                color: link
                    ? EchappeeColors.primary
                    : EchappeeColors.textSecondary),
            const SizedBox(width: EchappeeSpacing.s12),
            Expanded(
              child: Text(
                text,
                style: EchappeeTypography.body.copyWith(
                  color: link ? EchappeeColors.primary : null,
                  decoration: link ? TextDecoration.underline : null,
                ),
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: EchappeeSpacing.s8),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}

class _LabelChip extends StatelessWidget {
  const _LabelChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: EchappeeSpacing.s12, vertical: EchappeeSpacing.s4),
      decoration: const BoxDecoration(
        color: EchappeeColors.accentTint,
        borderRadius: EchappeeRadius.fullAll,
      ),
      child: Text(label,
          style: EchappeeTypography.caption
              .copyWith(fontWeight: FontWeight.w600)),
    );
  }
}

Future<void> _launchExternal(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null) return;
  try {
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  } catch (_) {/* lien invalide / pas d'app — silencieux */}
}

String _prettyUrl(String url) => url
    .replaceFirst(RegExp(r'^https?://'), '')
    .replaceFirst(RegExp(r'/$'), '');

/// Tag OSM brut -> libellé lisible (bio, accessible, cuisine…).
String _labelText(String tag) {
  if (tag.startsWith('cuisine:')) {
    final c = tag.substring(8);
    return 'Cuisine ${c[0].toUpperCase()}${c.substring(1)}';
  }
  const map = {
    'bio': 'Bio',
    'accessible': 'Accessible',
    'automate': 'Automate 24/7',
    'produits-frais': 'Produits frais',
  };
  return map[tag] ?? '${tag[0].toUpperCase()}${tag.substring(1)}';
}
