import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../app/providers.dart';
import '../../../product_modules/echappee/presentation/echappee_splash_screen.dart'
    show EchappeeSplashScreen;

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final consent = ref.watch(consentAcceptedProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Réglages')),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.directions_car_outlined),
            title: const Text('Mon véhicule'),
            subtitle: const Text('Pour les calculs carburant et CO₂'),
            onTap: () => context.push('/echappee/vehicle?edit=1'),
          ),
          const Divider(),
          SwitchListTile(
            title: const Text('Consentement localisation'),
            subtitle: const Text(
                'Le suivi GPS est désactivé sans ce consentement.'),
            value: consent,
            onChanged: (v) async {
              ref.read(consentAcceptedProvider.notifier).state = v;
              // Persiste localement (RGPD : révocable, pas de compte).
              final prefs = await SharedPreferences.getInstance();
              await prefs.setBool(EchappeeSplashScreen.consentPrefKey, v);
            },
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline),
            title: const Text('Effacer mes données locales'),
            subtitle:
                const Text('Véhicule, statistiques et préférences.'),
            onTap: () async {
              final prefs = await SharedPreferences.getInstance();
              await prefs.clear();
              ref.read(consentAcceptedProvider.notifier).state = false;
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('Données locales effacées.')));
              }
            },
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.menu_book_outlined),
            title: const Text('Le manifeste'),
            subtitle: const Text('Pourquoi L\'Échappée existe'),
            onTap: () => context.push('/echappee/manifeste'),
          ),
          // La vitrine du design system n'apparaît plus dans l'UI : outil
          // d'équipe, accessible par la route /echappee/design (deep link).
        ],
      ),
    );
  }
}
