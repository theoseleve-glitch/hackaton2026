import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/config.dart';
import '../../../app/providers.dart';
import '../../../features/analytics/domain/analytics_repository.dart'
    show AnalyticsEvents;
import '../../../shared/models/models.dart';
import '../design_system/design_system.dart';
import 'echappee_page.dart';

/// Onboarding L'Échappée : trois pages plein écran crème qui posent la
/// promesse — la route, le temps, les haltes — avant de demander quoi que
/// ce soit. Le consentement localisation se donne en page 3, sans friction.
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

  /// Accepte le consentement localisation, trace la fin d'onboarding et
  /// passe à la connexion.
  void _finish() {
    ref.read(consentAcceptedProvider.notifier).state = true;
    ref.read(analyticsRepositoryProvider).logEvent(
          AnalyticsEvents.onboardingCompleted,
          productContext: ProductContext.terroir,
        );
    context.go('/echappee/login');
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

/// Connexion L'Échappée : sobre et chaleureuse — symbole, « Bonne route. »,
/// deux champs, un CTA. En mode démo, une card douce explique que n'importe
/// quels identifiants fonctionnent.
class EchappeeLoginScreen extends ConsumerStatefulWidget {
  const EchappeeLoginScreen({super.key});

  @override
  ConsumerState<EchappeeLoginScreen> createState() =>
      _EchappeeLoginScreenState();
}

class _EchappeeLoginScreenState extends ConsumerState<EchappeeLoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _signIn() {
    ref.read(authControllerProvider.notifier).signIn(
          _emailController.text.trim(),
          _passwordController.text,
        );
  }

  void _signUp() {
    ref.read(authControllerProvider.notifier).signUp(
          _emailController.text.trim(),
          _passwordController.text,
        );
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<UserProfile?>>(authControllerProvider, (_, next) {
      if (next.valueOrNull != null) context.go('/echappee/home');
    });
    final auth = ref.watch(authControllerProvider);
    return EchappeePage(
      child: Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(
                horizontal: EchappeeSpacing.screen,
                vertical: EchappeeSpacing.s32,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: EchappeeLogo(size: 48)),
                  const SizedBox(height: EchappeeSpacing.s24),
                  const Text(
                    'Bonne route.',
                    style: EchappeeTypography.h2,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: EchappeeSpacing.s32),
                  if (AppConfig.demoMode) ...[
                    const _DemoModeCard(),
                    const SizedBox(height: EchappeeSpacing.s24),
                  ],
                  EchappeeTextField(
                    label: 'Email',
                    hint: 'toi@exemple.fr',
                    icon: Icons.mail_outline,
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                  ),
                  const SizedBox(height: EchappeeSpacing.s16),
                  EchappeeTextField(
                    label: 'Mot de passe',
                    hint: 'Ton mot de passe',
                    icon: Icons.lock_outline,
                    controller: _passwordController,
                    obscureText: true,
                  ),
                  if (auth.hasError) ...[
                    const SizedBox(height: EchappeeSpacing.s16),
                    Text(
                      'Connexion impossible. Vérifie ton email et ton '
                      'mot de passe.',
                      style: EchappeeTypography.bodySmall
                          .copyWith(color: EchappeeColors.error),
                    ),
                  ],
                  const SizedBox(height: EchappeeSpacing.s32),
                  EchappeeButton(
                    label: 'Se connecter',
                    loading: auth.isLoading,
                    onPressed: _signIn,
                  ),
                  const SizedBox(height: EchappeeSpacing.s8),
                  EchappeeButton(
                    label: 'Créer un compte',
                    variant: EchappeeButtonVariant.tertiary,
                    onPressed: _signUp,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Card douce affichée uniquement en mode démo.
class _DemoModeCard extends StatelessWidget {
  const _DemoModeCard();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        color: EchappeeColors.surface,
        borderRadius: EchappeeRadius.mdAll,
        border: Border.fromBorderSide(
          BorderSide(color: EchappeeColors.border),
        ),
      ),
      child: Padding(
        padding: EdgeInsets.all(EchappeeSpacing.card),
        child: Text(
          "Mode démo : utilise n'importe quel email et mot de passe.",
          style: EchappeeTypography.bodySmall,
        ),
      ),
    );
  }
}
