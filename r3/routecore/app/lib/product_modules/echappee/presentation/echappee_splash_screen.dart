import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../app/providers.dart';
import '../../../features/analytics/domain/analytics_repository.dart'
    show AnalyticsEvents;
import '../../../shared/models/models.dart';
import '../design_system/design_system.dart';
import 'echappee_page.dart';

/// Splash L'Échappée : symbole, tagline — puis routage local. Pas de compte :
/// premier lancement → onboarding + choix du véhicule, sinon direct l'app.
class EchappeeSplashScreen extends ConsumerStatefulWidget {
  const EchappeeSplashScreen({super.key});

  /// Clé prefs posée à la fin de l'onboarding (voir EchappeeOnboardingScreen).
  static const onboardedPrefKey = 'onboarding.done';
  static const consentPrefKey = 'consent.location';

  @override
  ConsumerState<EchappeeSplashScreen> createState() =>
      _EchappeeSplashScreenState();
}

class _EchappeeSplashScreenState extends ConsumerState<EchappeeSplashScreen> {
  @override
  void initState() {
    super.initState();
    ref.read(analyticsRepositoryProvider).logEvent(
          AnalyticsEvents.appOpened,
          productContext: ProductContext.terroir,
        );
    _redirect();
  }

  Future<void> _redirect() async {
    final prefs = await SharedPreferences.getInstance();
    // Réhydrate le consentement localisation (révocable dans Réglages).
    ref.read(consentAcceptedProvider.notifier).state =
        prefs.getBool(EchappeeSplashScreen.consentPrefKey) ?? false;
    final onboarded =
        prefs.getBool(EchappeeSplashScreen.onboardedPrefKey) ?? false;
    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    context.go(onboarded ? '/echappee/home' : '/echappee/onboarding');
  }

  @override
  Widget build(BuildContext context) {
    return EchappeePage(
      child: Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const EchappeeWordmark(symbolSize: 72),
              const SizedBox(height: EchappeeSpacing.s12),
              Text(
                'Le GPS des routes qui respirent.',
                style: EchappeeTypography.body
                    .copyWith(color: EchappeeColors.textSecondary),
              ),
              const SizedBox(height: EchappeeSpacing.s48),
              const SizedBox(
                width: 120,
                child: EchappeeLoadingState(message: ''),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
