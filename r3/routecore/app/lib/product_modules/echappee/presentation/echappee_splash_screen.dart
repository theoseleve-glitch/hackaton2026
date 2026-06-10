import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../features/analytics/domain/analytics_repository.dart'
    show AnalyticsEvents;
import '../../../shared/models/models.dart';
import '../design_system/design_system.dart';
import 'echappee_page.dart';

/// Splash L'Échappée : crème, symbole, tagline — puis routage selon la
/// session restaurée (même logique que le splash core).
class EchappeeSplashScreen extends ConsumerStatefulWidget {
  const EchappeeSplashScreen({super.key});

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
    UserProfile? user;
    try {
      user = await ref.read(authControllerProvider.future);
      if (user != null) {
        await ref.read(authControllerProvider.notifier).syncConsent();
      }
    } catch (_) {
      user = null;
    }
    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    if (user == null) {
      final consent = ref.read(consentAcceptedProvider);
      context.go(consent ? '/echappee/login' : '/echappee/onboarding');
    } else {
      context.go('/echappee/home');
    }
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
