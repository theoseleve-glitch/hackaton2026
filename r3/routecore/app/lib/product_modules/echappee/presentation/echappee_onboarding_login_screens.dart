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
import 'echappee_splash_screen.dart' show EchappeeSplashScreen;

/// Onboarding L'Échappée : trois pages plein écran qui posent la promesse —
/// la route, le temps, les haltes. Pas de compte : on enchaîne sur le choix
/// du véhicule (pour les calculs carburant/CO2) puis l'app.
class EchappeeOnboardingScreen extends ConsumerStatefulWidget {
  const EchappeeOnboardingScreen({super.key});

  @override
  ConsumerState<EchappeeOnboardingScreen> createState() =>
      _EchappeeOnboardingScreenState();
}

class _EchappeeOnboardingScreenState
    extends ConsumerState<EchappeeOnboardingScreen> {
  final _controller = PageController();
  var _index = 0;

  static const _pageTransition = Duration(milliseconds: 320);

  static const _pages = [
    _OnboardingPageData(
      eyebrow: '01 — LA ROUTE',
      titleStart: 'La route peut valoir ',
      titleAccent: 'autant',
      titleEnd: ' que la destination.',
      body: 'Découvre les haltes locales qui se trouvent '
          'autour de ton trajet.',
    ),
    _OnboardingPageData(
      eyebrow: '02 — LE TEMPS',
      titleStart: 'Choisis le temps que tu veux ',
      titleAccent: "t'offrir",
      titleEnd: '.',
      body: '10 minutes pour une pause. 25 minutes pour flâner. '
          '45 minutes pour partir en échappée.',
    ),
    _OnboardingPageData(
      eyebrow: '03 — LES HALTES',
      titleStart: 'Découvre ce qui vaut vraiment le ',
      titleAccent: 'détour',
      titleEnd: '.',
      body: 'Producteurs, villages, marchés, artisans, points de vue…',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    _controller.nextPage(duration: _pageTransition, curve: Curves.easeOutCubic);
  }

  /// Accepte le consentement localisation, persiste la fin d'onboarding et
  /// enchaîne sur le choix du véhicule.
  Future<void> _finish() async {
    ref.read(consentAcceptedProvider.notifier).state = true;
    ref.read(analyticsRepositoryProvider).logEvent(
          AnalyticsEvents.onboardingCompleted,
          productContext: ProductContext.terroir,
        );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(EchappeeSplashScreen.onboardedPrefKey, true);
    await prefs.setBool(EchappeeSplashScreen.consentPrefKey, true);
    if (mounted) context.go('/echappee/vehicle');
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _index == _pages.length - 1;
    return EchappeePage(
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: PageView.builder(
                  controller: _controller,
                  itemCount: _pages.length,
                  onPageChanged: (i) => setState(() => _index = i),
                  itemBuilder: (_, i) => _OnboardingPageView(data: _pages[i]),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  EchappeeSpacing.screen,
                  0,
                  EchappeeSpacing.screen,
                  EchappeeSpacing.s24,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _PageDots(count: _pages.length, index: _index),
                    const SizedBox(height: EchappeeSpacing.s24),
                    if (isLast) ...[
                      const Text(
                        "L'Échappée utilise ta position pour trouver les "
                        'haltes proches de ta route. Tu peux modifier ce '
                        'choix à tout moment.',
                        style: EchappeeTypography.bodySmall,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: EchappeeSpacing.s16),
                    ],
                    EchappeeButton(
                      label:
                          isLast ? 'Créer ma première échappée' : 'Continuer',
                      onPressed: isLast ? _finish : _next,
                    ),
                    if (isLast) ...[
                      const SizedBox(height: EchappeeSpacing.s4),
                      EchappeeButton(
                        label: 'Passer',
                        variant: EchappeeButtonVariant.tertiary,
                        onPressed: _finish,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Contenu éditorial d'une page d'onboarding : eyebrow numéroté, titre
/// Fraunces avec un mot accentué Clay Red italique, paragraphe.
class _OnboardingPageData {
  const _OnboardingPageData({
    required this.eyebrow,
    required this.titleStart,
    required this.titleAccent,
    required this.titleEnd,
    required this.body,
  });

  final String eyebrow;
  final String titleStart;
  final String titleAccent;
  final String titleEnd;
  final String body;
}

class _OnboardingPageView extends StatelessWidget {
  const _OnboardingPageView({required this.data});

  final _OnboardingPageData data;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: EchappeeSpacing.screen),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          EchappeeEyebrow(data.eyebrow),
          const SizedBox(height: EchappeeSpacing.s16),
          Text.rich(
            TextSpan(
              style: EchappeeTypography.h1,
              children: [
                TextSpan(text: data.titleStart),
                TextSpan(
                  text: data.titleAccent,
                  style: EchappeeTypography.h1.copyWith(
                    color: EchappeeColors.primary,
                    fontStyle: FontStyle.italic,
                  ),
                ),
                TextSpan(text: data.titleEnd),
              ],
            ),
          ),
          const SizedBox(height: EchappeeSpacing.s20),
          Text(
            data.body,
            style: EchappeeTypography.bodyLarge
                .copyWith(color: EchappeeColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// Indicateur de pages : trois points, l'actif s'étire en pill Clay Red.
class _PageDots extends StatelessWidget {
  const _PageDots({required this.count, required this.index});

  final int count;
  final int index;

  static const _dotAnimation = Duration(milliseconds: 220);

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++) ...[
          if (i > 0) const SizedBox(width: EchappeeSpacing.s8),
          AnimatedContainer(
            duration: _dotAnimation,
            curve: Curves.easeOut,
            width: i == index ? EchappeeSpacing.s24 : EchappeeSpacing.s8,
            height: EchappeeSpacing.s8,
            decoration: BoxDecoration(
              color:
                  i == index ? EchappeeColors.primary : EchappeeColors.border,
              borderRadius: EchappeeRadius.fullAll,
            ),
          ),
        ],
      ],
    );
  }
}

// L'Échappée est sans compte : l'écran de connexion a été retiré (les trajets
// vivent sur un profil local anonyme — voir MockAuthRepository).
