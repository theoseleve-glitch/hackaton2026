import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/presentation/auth_screens.dart';
import '../features/map/presentation/map_screen.dart';
import '../features/poi/presentation/poi_screens.dart';
import '../features/routing/presentation/home_screen.dart';
import '../features/routing/presentation/route_options_screen.dart';
import '../features/settings/presentation/settings_screen.dart';
import '../features/tracking/presentation/tracking_screens.dart';
import '../features/vehicle/presentation/vehicle_picker_screen.dart';
import '../core/env/env.dart';
import '../product_modules/echappee/presentation/design_system_preview_screen.dart';
import '../product_modules/echappee/presentation/echappee_flow_screens.dart';
import '../product_modules/echappee/presentation/echappee_guided_navigation.dart';
import '../product_modules/echappee/presentation/echappee_manifeste_screen.dart';
import '../product_modules/echappee/presentation/echappee_map_screens.dart';
import '../product_modules/echappee/presentation/echappee_places_screen.dart';
import '../product_modules/echappee/presentation/echappee_services_screen.dart';
import '../product_modules/echappee/presentation/echappee_splash_screen.dart';
import '../product_modules/ecodrive/presentation/ecodrive_screens.dart';
import '../product_modules/terroir/presentation/terroir_screens.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    // The build flavor decides which experience boots; the neutral core
    // screens stay available for the common/ecodrive flavors.
    initialLocation:
        Env.productFlavor == 'echappee' ? '/echappee/splash' : '/splash',
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
      // --- product module: Terroir (marque: L'Échappée) ---
      GoRoute(
          path: '/terroir/plan',
          builder: (_, __) => const TerroirPlanScreen()),
      GoRoute(
          path: '/terroir/results',
          builder: (_, __) => const TerroirResultsScreen()),
      GoRoute(
          path: '/echappee/design',
          builder: (_, __) => const EchappeeDesignSystemPreviewScreen()),
      GoRoute(
          path: '/echappee/splash',
          builder: (_, __) => const EchappeeSplashScreen()),
      GoRoute(
          path: '/echappee/onboarding',
          builder: (_, __) => const EchappeeOnboardingScreen()),
      // Sans compte : choix du véhicule (calculs carburant/CO2) à la place
      // de l'ancienne connexion. ?edit=1 = ouverture depuis Réglages.
      GoRoute(
          path: '/echappee/vehicle',
          builder: (_, state) => VehiclePickerScreen(
              isOnboarding: state.uri.queryParameters['edit'] != '1')),
      GoRoute(
          path: '/echappee/manifeste',
          builder: (_, __) => const EchappeeManifesteScreen()),
      GoRoute(
          path: '/echappee/navigation',
          builder: (_, __) => const EchappeeGuidedNavigationScreen()),
      GoRoute(
          path: '/echappee/home',
          builder: (_, __) => const EchappeeHomeScreen()),
      GoRoute(
          path: '/echappee/detour',
          builder: (_, __) => const EchappeeDetourScreen()),
      GoRoute(
          path: '/echappee/categories',
          builder: (_, __) => const EchappeeCategoriesScreen()),
      GoRoute(
          path: '/echappee/routes',
          builder: (_, __) => const EchappeeRouteOptionsScreen()),
      GoRoute(
          path: '/echappee/map',
          builder: (_, __) => const EchappeeMapScreen()),
      GoRoute(
          path: '/echappee/services',
          builder: (_, __) => const EchappeeServicesScreen()),
      GoRoute(
          path: '/echappee/places',
          builder: (_, __) => const EchappeePlacesScreen()),
      GoRoute(
          path: '/echappee/poi/:id',
          builder: (_, state) =>
              EchappeePoiDetailScreen(poiId: state.pathParameters['id']!)),
      // --- product module: EcoDrive ---
      GoRoute(
          path: '/ecodrive/compare',
          builder: (_, __) => const EcoCompareScreen()),
      GoRoute(
          path: '/ecodrive/dashboard',
          builder: (_, __) => const EcoDashboardScreen()),
    ],
  );
});
