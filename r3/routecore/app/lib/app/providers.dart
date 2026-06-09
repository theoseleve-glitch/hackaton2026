import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as sb;

import '../core/env/env.dart';
import '../core/permissions/location_permission_service.dart';
import '../features/analytics/data/analytics_repositories.dart';
import '../features/analytics/domain/analytics_repository.dart';
import '../features/auth/data/mock_auth_repository.dart';
import '../features/auth/data/supabase_auth_repository.dart';
import '../features/auth/domain/auth_repository.dart';
import '../features/location/data/location_repositories.dart';
import '../features/location/domain/location_repository.dart';
import '../features/poi/data/poi_repositories.dart';
import '../features/poi/domain/poi_repository.dart';
import '../features/scoring/domain/scoring_service.dart';
import '../features/trips/data/mock_trip_repositories.dart';
import '../features/trips/data/trip_repositories.dart';
import '../features/trips/domain/trip_repository.dart';
import '../shared/models/models.dart';
import '../shared/services/map_search_service.dart';
import '../shared/services/routing_service.dart';

/// Central dependency wiring. Every repository switches between its Supabase
/// implementation (when .env is configured) and a mock (demo mode).

sb.SupabaseClient get _client => sb.Supabase.instance.client;

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => Env.hasSupabase
      ? SupabaseAuthRepository(_client)
      : MockAuthRepository(),
);

final userRepositoryProvider = Provider<UserRepository>(
  (ref) => Env.hasSupabase
      ? SupabaseUserRepository(_client)
      : MockUserRepository(),
);

final locationRepositoryProvider = Provider<LocationRepository>(
  // Mock by default on desktop dev; Geolocator on devices. Keep it simple:
  // mock when no Supabase configured (demo mode), real otherwise.
  (ref) => Env.hasSupabase
      ? GeolocatorLocationRepository(LocationPermissionService())
      : MockLocationRepository(),
);

final mapSearchServiceProvider = Provider<MapSearchService>((ref) {
  switch (Env.mapProvider) {
    case 'mapbox':
      return MapboxMapSearchService();
    default:
      return MockMapSearchService();
  }
});

final routingServiceProvider = Provider<RoutingService>((ref) {
  switch (Env.mapProvider) {
    case 'mapbox':
      return MapboxRoutingService();
    case 'google':
      return GoogleMapsRoutingService();
    case 'openrouteservice':
      return OpenRouteServiceRoutingService();
    default:
      return MockRoutingService();
  }
});

final poiRepositoryProvider = Provider<PoiRepository>(
  (ref) =>
      Env.hasSupabase ? SupabasePoiRepository(_client) : MockPoiRepository(),
);

final tripRepositoryProvider = Provider<TripRepository>(
  (ref) =>
      Env.hasSupabase ? SupabaseTripRepository(_client) : MockTripRepository(),
);

final trackingRepositoryProvider = Provider<TrackingRepository>(
  (ref) => Env.hasSupabase
      ? SupabaseTrackingRepository(_client)
      : MockTrackingRepository(),
);

final favoriteRepositoryProvider = Provider<FavoriteRepository>(
  (ref) => Env.hasSupabase
      ? SupabaseFavoriteRepository(_client)
      : MockFavoriteRepository(),
);

final analyticsRepositoryProvider = Provider<AnalyticsRepository>(
  (ref) => Env.hasSupabase
      ? SupabaseAnalyticsRepository(_client)
      : ConsoleAnalyticsRepository(),
);

final scoringServiceProvider =
    Provider<ScoringService>((ref) => const BasicTripScoringService());

// ---------------------------------------------------------------------------
// Auth state
// ---------------------------------------------------------------------------

class AuthController extends Notifier<AsyncValue<UserProfile?>> {
  @override
  AsyncValue<UserProfile?> build() {
    _restore();
    return const AsyncValue.loading();
  }

  Future<void> _restore() async {
    final user = await ref.read(authRepositoryProvider).currentUser();
    state = AsyncValue.data(user);
  }

  Future<void> signIn(String email, String password) async {
    state = const AsyncValue.loading();
    try {
      final user = await ref
          .read(authRepositoryProvider)
          .signInWithPassword(email, password);
      await ref.read(analyticsRepositoryProvider).logEvent(
            'login_completed',
            userId: user.id,
          );
      state = AsyncValue.data(user);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> signUp(String email, String password) async {
    state = const AsyncValue.loading();
    try {
      final user =
          await ref.read(authRepositoryProvider).signUp(email, password);
      state = AsyncValue.data(user);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> signOut() async {
    await ref.read(authRepositoryProvider).signOut();
    state = const AsyncValue.data(null);
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AsyncValue<UserProfile?>>(
        AuthController.new);

/// Product mode chosen by the user (Settings / Onboarding).
final productModeProvider =
    StateProvider<ProductContext>((ref) => ProductContext.common);

/// Whether the user accepted location + privacy consent during onboarding.
final consentAcceptedProvider = StateProvider<bool>((ref) => false);
