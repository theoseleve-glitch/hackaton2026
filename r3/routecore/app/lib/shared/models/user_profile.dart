import 'enums.dart';

class UserProfile {
  const UserProfile({
    required this.id,
    this.email,
    this.displayName,
    this.preferredProductMode,
    this.privacyConsentAccepted = false,
    this.locationConsentAccepted = false,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String? email;
  final String? displayName;
  final ProductContext? preferredProductMode;
  final bool privacyConsentAccepted;
  final bool locationConsentAccepted;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        id: json['id'] as String,
        email: json['email'] as String?,
        displayName: json['display_name'] as String?,
        preferredProductMode: json['preferred_product_mode'] == null
            ? null
            : ProductContext.fromName(
                json['preferred_product_mode'] as String),
        privacyConsentAccepted:
            json['privacy_consent_accepted'] as bool? ?? false,
        locationConsentAccepted:
            json['location_consent_accepted'] as bool? ?? false,
        createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
        updatedAt: DateTime.tryParse(json['updated_at'] as String? ?? ''),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'display_name': displayName,
        'preferred_product_mode': preferredProductMode?.name,
        'privacy_consent_accepted': privacyConsentAccepted,
        'location_consent_accepted': locationConsentAccepted,
      };

  UserProfile copyWith({
    String? displayName,
    ProductContext? preferredProductMode,
    bool? privacyConsentAccepted,
    bool? locationConsentAccepted,
  }) =>
      UserProfile(
        id: id,
        email: email,
        displayName: displayName ?? this.displayName,
        preferredProductMode: preferredProductMode ?? this.preferredProductMode,
        privacyConsentAccepted:
            privacyConsentAccepted ?? this.privacyConsentAccepted,
        locationConsentAccepted:
            locationConsentAccepted ?? this.locationConsentAccepted,
        createdAt: createdAt,
        updatedAt: updatedAt,
      );
}
