import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/config.dart';
import '../../../app/providers.dart';
import '../../../shared/models/models.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    final mode = ref.watch(productModeProvider);
    final consent = ref.watch(consentAcceptedProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Réglages')),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.person),
            title: Text(user?.displayName ?? user?.email ?? 'Profil'),
            subtitle: Text(AppConfig.demoMode ? 'Mode démo' : 'Compte Supabase'),
          ),
          const Divider(),
          ListTile(
            title: const Text('Mode produit'),
            subtitle: SegmentedButton<ProductContext>(
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
          ),
          SwitchListTile(
            title: const Text('Consentement localisation'),
            subtitle: const Text(
                'Le suivi GPS est désactivé sans ce consentement.'),
            value: consent,
            onChanged: (v) async {
              ref.read(consentAcceptedProvider.notifier).state = v;
              // Persist so the choice survives restarts (RGPD: revocable).
              final u = ref.read(authControllerProvider).valueOrNull;
              if (u == null) return;
              final repo = ref.read(userRepositoryProvider);
              final profile = await repo.getProfile(u.id);
              if (profile != null) {
                await repo.updateProfile(
                    profile.copyWith(locationConsentAccepted: v));
              }
            },
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline),
            title: const Text('Supprimer mes données'),
            subtitle: const Text(
                'À venir — voir PRIVACY_NOTES.md (droit à l\'effacement).'),
            onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                    content: Text('Fonction prévue avant production.'))),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.palette_outlined),
            title: const Text('Design system L\'Échappée'),
            subtitle: const Text('Vitrine des composants (dev)'),
            onTap: () => context.push('/echappee/design'),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('Se déconnecter'),
            onTap: () async {
              await ref.read(authControllerProvider.notifier).signOut();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
    );
  }
}
