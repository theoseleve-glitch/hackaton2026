import 'enums.dart';
import 'geo.dart';

class PoiCategory {
  const PoiCategory({
    required this.id,
    required this.name,
    required this.slug,
    this.parentCategoryId,
    this.productContext = ProductContext.common,
    this.iconName,
  });

  final String id;
  final String name;
  final String slug;
  final String? parentCategoryId;
  final ProductContext productContext;
  final String? iconName;

  factory PoiCategory.fromJson(Map<String, dynamic> json) => PoiCategory(
        id: json['id'] as String,
        name: json['name'] as String,
        slug: json['slug'] as String,
        parentCategoryId: json['parent_category_id'] as String?,
        productContext:
            ProductContext.fromName(json['product_context'] as String?),
        iconName: json['icon_name'] as String?,
      );
}

class Poi {
  const Poi({
    required this.id,
    required this.name,
    required this.categoryId,
    required this.latitude,
    required this.longitude,
    this.categorySlug,
    this.description,
    this.address,
    this.city,
    this.region,
    this.country = 'FR',
    this.phone,
    this.email,
    this.websiteUrl,
    this.imageUrl,
    this.openingHours,
    this.tags = const [],
    this.source = 'manual',
    this.isVerified = false,
    this.isSponsored = false,
    this.createdAt,
    this.updatedAt,
  });

  /// Décode une halte du carnet embarqué (assets/data/haltes.json, schéma
  /// compact OSM/ODbL). Clés : id, name, cat, lat, lng, addr?, city?, phone?,
  /// web?, email?, hours?, desc?, tags?.
  factory Poi.fromJson(Map<String, dynamic> json) => Poi(
        id: json['id'] as String,
        name: json['name'] as String,
        categoryId: (json['category_id'] as String?) ?? '',
        categorySlug: (json['cat'] ?? json['category_slug']) as String?,
        latitude: (json['lat'] as num).toDouble(),
        longitude: (json['lng'] as num).toDouble(),
        description: json['desc'] as String?,
        address: json['addr'] as String?,
        city: json['city'] as String?,
        region: json['region'] as String?,
        phone: json['phone'] as String?,
        email: json['email'] as String?,
        websiteUrl: (json['web'] ?? json['website_url']) as String?,
        imageUrl: json['image_url'] as String?,
        openingHours: json['hours'] is String
            ? {'raw': json['hours'] as String}
            : json['hours'] as Map<String, dynamic>?,
        tags: (json['tags'] as List?)?.cast<String>() ?? const [],
        source: (json['source'] as String?) ?? 'osm',
        isVerified: (json['is_verified'] as bool?) ?? true,
      );

  final String id;
  final String name;
  final String? description;

  /// UUID of the category when read from a table; may be empty for RPC rows
  /// that only return the slug — use [categorySlug] first when filtering.
  final String categoryId;

  /// Category slug when the source provides it (nearby_pois /
  /// pois_along_route RPCs); null for table reads.
  final String? categorySlug;
  final double latitude;
  final double longitude;
  final String? address;
  final String? city;
  final String? region;
  final String country;
  final String? phone;
  final String? email;
  final String? websiteUrl;
  final String? imageUrl;
  final Map<String, dynamic>? openingHours;
  final List<String> tags;
  final String source;
  final bool isVerified;
  final bool isSponsored;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  GeoPoint get point => GeoPoint(latitude: latitude, longitude: longitude);
}

class PoiAlongRoute {
  const PoiAlongRoute({
    required this.poi,
    required this.distanceFromRouteMeters,
    required this.detourMinutesEstimate,
    required this.relevanceScore,
  });

  final Poi poi;
  final double distanceFromRouteMeters;
  final double detourMinutesEstimate;

  /// 0..1 — computed by a product-specific relevance scorer (see
  /// product_modules/terroir). The core only carries the value.
  final double relevanceScore;
}
