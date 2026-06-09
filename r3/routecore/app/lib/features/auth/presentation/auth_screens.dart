import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/config.dart';
import '../../../app/providers.dart';
import '../../../shared/models/models.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    ref.read(analyticsRepositoryProvider).logEvent('app_opened');
    Future.delayed(const Duration(milliseconds: 600), _redirect);
  }

  Future<void> _redirect() async {
    if (!mounted) return;
    final auth = ref.read(authControllerProvider);
    final consent = ref.read(consentAcceptedProvider);
    final user = auth.valueOrNull;
    if (user == null) {
      context.go(consent ? '/login' : '/onboarding');
    } else {
      context.go('/home');
    }
  }

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.route, size: 72, color: Color(0xFF2E7D32)),
              SizedBox(height: 12),
              Text('RouteCore', style: TextStyle(fontSize: 24)),
              SizedBox(height: 24),
              CircularProgressIndicator(),
            ],
          ),
        ),
      );
}

class OnboardingScreen extends ConsumerWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(productModeProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Bienvenue')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'RouteCore transforme vos trajets : découverte locale ou '
              'écoconduite, à vous de choisir.',
              style: TextStyle(fontSize: 18),
            ),
            const SizedBox(height: 24),
            const Text(
              "L'application utilise votre position GPS uniquement avec "
              'votre accord, pour calculer des itinéraires et suivre vos '
              'trajets. Vos données ne sont jamais partagées avec d\'autres '
              'utilisateurs.',
            ),
            const SizedBox(height: 24),
            SegmentedButton<ProductContext>(
              segments: const [
                ButtonSegment(
                    value: ProductContext.common, label: Text('Standard')),
                ButtonSegment(
                    value: ProductContext.terroir, label: Text('Terroir')),
                ButtonSegment(
                    value: ProductContext.ecodrive, label: Text('Éco')),
              ],
              selected: {mode},
              onSelectionChanged: (s) =>
                  ref.read(productModeProvider.notifier).state = s.first,
            ),
            const Spacer(),
            FilledButton(
              onPressed: () {
                ref.read(consentAcceptedProvider.notifier).state = true;
                ref
                    .read(analyticsRepositoryProvider)
                    .logEvent('onboarding_completed');
                context.go('/login');
              },
              child: const Text("J'accepte et je continue"),
            ),
          ],
        ),
      ),
    );
  }
}

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    ref.listen(authControllerProvider, (_, next) {
      if (next.valueOrNull != null) context.go('/home');
    });
    return Scaffold(
      appBar: AppBar(title: const Text('Connexion')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (AppConfig.demoMode)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: Text('Mode démo : aucun backend configuré, '
                      'utilisez n\'importe quel email/mot de passe.'),
                ),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _email,
              decoration: const InputDecoration(labelText: 'Email'),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              decoration: const InputDecoration(labelText: 'Mot de passe'),
              obscureText: true,
            ),
            const SizedBox(height: 16),
            if (auth.hasError)
              Text(
                'Erreur : ${auth.error}',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: auth.isLoading
                  ? null
                  : () => ref
                      .read(authControllerProvider.notifier)
                      .signIn(_email.text.trim(), _password.text),
              child: auth.isLoading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Se connecter'),
            ),
            TextButton(
              onPressed: auth.isLoading
                  ? null
                  : () => ref
                      .read(authControllerProvider.notifier)
                      .signUp(_email.text.trim(), _password.text),
              child: const Text('Créer un compte'),
            ),
          ],
        ),
      ),
    );
  }
}
