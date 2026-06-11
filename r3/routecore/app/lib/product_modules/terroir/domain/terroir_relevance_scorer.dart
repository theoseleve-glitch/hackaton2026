import '../../../shared/models/models.dart';

/// Terroir-specific relevance scoring for POIs along a route.
/// Lives in the product module — the core only carries the resulting score.
class TerroirPoiScore {
  const TerroirPoiScore({
    required this.poiRelevanceScore,
    required this.detourMinutes,
    required this.sponsoredRankBoost,
    this.openingNow,
    this.localAuthenticityScore, // placeholder — needs curated data
    this.seasonalScore, // placeholder — needs season/event data
  });

  final double poiRelevanceScore; // 0..1
  final double detourMinutes;
  final double sponsoredRankBoost;
  final bool? openingNow;
  final double? localAuthenticityScore;
  final double? seasonalScore;
}

class TerroirRelevanceScorer {
  const TerroirRelevanceScorer();

  /// Higher when: close to the route, matches preferred categories, shares
  /// affinity tags with the selected moods, sponsored (bounded boost so ads
  /// never crowd out relevance).
  TerroirPoiScore score(
    PoiAlongRoute item, {
    required int maxDetourMinutes,
    List<String> preferredCategorySlugs = const [],
    List<String> preferredTags = const [],
    String? categorySlug,
  }) {
    final detour = item.detourMinutesEstimate;
    // 1.0 at zero detour, 0 at maxDetour.
    final proximity =
        (1 - detour / maxDetourMinutes).clamp(0.0, 1.0).toDouble();
    final preferenceMatch = categorySlug != null &&
            preferredCategorySlugs.contains(categorySlug)
        ? 1.0
        : 0.4;
    // Tags refine within a category: « vignoble » beats a generic producer
    // when the Vignoble mood is on. Neutral when no mood is selected.
    final double tagMatch;
    if (preferredTags.isEmpty) {
      tagMatch = 0.5;
    } else {
      final overlap =
          item.poi.tags.where(preferredTags.contains).length;
      tagMatch = overlap == 0 ? 0.0 : (overlap == 1 ? 0.7 : 1.0);
    }
    final sponsoredBoost = item.poi.isSponsored ? 0.1 : 0.0;
    final relevance = (proximity * 0.5 +
            preferenceMatch * 0.3 +
            tagMatch * 0.2 +
            sponsoredBoost)
        .clamp(0.0, 1.0)
        .toDouble();
    return TerroirPoiScore(
      poiRelevanceScore: relevance,
      detourMinutes: detour,
      sponsoredRankBoost: sponsoredBoost,
    );
  }

  /// Applies scoring and filters out POIs beyond the accepted detour.
  List<PoiAlongRoute> rank(
    List<PoiAlongRoute> items, {
    required int maxDetourMinutes,
    List<String> preferredCategorySlugs = const [],
    List<String> preferredTags = const [],
    Map<String, String> categorySlugByPoiId = const {},
  }) {
    final scored = <(PoiAlongRoute, double)>[];
    for (final item in items) {
      if (item.detourMinutesEstimate > maxDetourMinutes) continue;
      final s = score(
        item,
        maxDetourMinutes: maxDetourMinutes,
        preferredCategorySlugs: preferredCategorySlugs,
        preferredTags: preferredTags,
        categorySlug: categorySlugByPoiId[item.poi.id],
      );
      scored.add((
        PoiAlongRoute(
          poi: item.poi,
          distanceFromRouteMeters: item.distanceFromRouteMeters,
          detourMinutesEstimate: item.detourMinutesEstimate,
          relevanceScore: s.poiRelevanceScore,
        ),
        s.poiRelevanceScore
      ));
    }
    scored.sort((a, b) => b.$2.compareTo(a.$2));
    return scored.map((e) => e.$1).toList();
  }
}
