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
    this.description,
    this.address,
    this.city,
    this.region,
    this.country = 'FR',
    this.phone,
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

  final String id;
  final String name;
  final String? description;
  final String categoryId;
  final double latitude;
  final double longitude;
  final String? address;
  final String? city;
  final String? region;
  final String country;
  final String? phone;
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
