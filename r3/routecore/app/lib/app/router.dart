import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/presentation/auth_screens.dart';
import '../features/map/presentation/map_screen.dart';
import '../features/poi/presentation/poi_screens.dart';
import '../features/routing/presentation/home_screen.dart';
import '../features/routing/presentation/route_options_screen.dart';
import '../features/settings/presentation/settings_screen.dart';
import '../features/tracking/presentation/tracking_screens.dart';
import '../product_modules/ecodrive/presentation/ecodrive_screens.dart';
import '../product_modules/ecodrive/presentation/eco_history_screen.dart';
import '../product_modules/terroir/presentation/terroir_screens.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(
          path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
      GoRoute(path: '/map', builder: (_, __) => const MapScreen()),
      GoRoute(
          path: '/route-options',
          builder: (_, __) => const RouteOptionsScreen()),
      GoRoute(path: '/pois', builder: (_, __) => const PoiListScreen()),
      GoRoute(
          path: '/poi/:id',
          builder: (_, state) =>
              PoiDetailScreen(poiId: state.pathParameters['id']!)),
      GoRoute(
          path: '/tracking/:tripId',
          builder: (_, state) =>
              TripTrackingScreen(tripId: state.pathParameters['tripId']!)),
      GoRoute(
          path: '/summary/:tripId',
          builder: (_, state) =>
              TripSummaryScreen(tripId: state.pathParameters['tripId']!)),
      GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      // --- product module: Terroir ---
      GoRoute(
          path: '/terroir/plan',
          builder: (_, __) => const TerroirPlanScreen()),
      GoRoute(
          path: '/terroir/results',
          builder: (_, __) => const TerroirResultsScreen()),
      // --- product module: EcoDrive ---
      GoRoute(
          path: '/ecodrive/compare',
          builder: (_, __) => const EcoCompareScreen()),
      GoRoute(
          path: '/ecodrive/dashboard',
          builder: (_, __) => const EcoDashboardScreen()),
      GoRoute(
          path: '/ecodrive/history',
          builder: (_, __) => const EcoHistoryScreen()),
    ],
  );
});
