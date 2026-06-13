import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../echappee/design_system/echappee_colors.dart';
import '../../echappee/design_system/echappee_radius.dart';
import '../../echappee/design_system/echappee_shadows.dart';
import '../../echappee/design_system/echappee_spacing.dart';
import '../../echappee/design_system/echappee_typography.dart';
import '../../echappee/design_system/components/echappee_button.dart';
import '../data/eco_stats_store.dart';
import '../domain/eco_coach.dart';

/// Bilan de fin de trajet — le second temps du coaching (le feedback différé
/// ancre le comportement dans la durée, docs/ECO_COACHING_RESEARCH.md §1).
///
/// L'appelant a déjà enregistré le trajet via `ecoLedgerProvider.recordTrip`
/// avant de router ici ; l'écran n'écrit rien, il montre honnêtement —
/// y compris les surcoûts (valeurs négatives) en couleur d'erreur.
class ArrivalSummaryScreen extends ConsumerWidget {
  const ArrivalSummaryScreen({
    super.key,
    required this.score,
    required this.distanceKm,
  });

  final EcoTripScore score;
  final double distanceKm;

  Color get _tierColor {
    if (score.score >= 80) return EchappeeColors.success;
    if (score.score >= 50) return EchappeeColors.accent;
    return EchappeeColors.error;
  }

  /// 12.46 → « 12,5 » (usage français).
  static String _fr(double value, {int digits = 1}) =>
      value.toStringAsFixed(digits).replaceAll('.', ',');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ledger = ref.watch(ecoLedgerProvider).valueOrNull;
    final year = ledger?.yearStats(DateTime.now().year);

    return Scaffold(
      backgroundColor: EchappeeColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: EchappeeSpacing.screen),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: EchappeeSpacing.s48),
              const Text('Bien arrivé·e.', style: EchappeeTypography.h1),
              const SizedBox(height: EchappeeSpacing.s8),
              Text(
                '${_fr(distanceKm)} km · conso estimée '
                '${_fr(score.estimatedConsL100)} L/100',
                style: EchappeeTypography.bodySmall,
              ),
              const SizedBox(height: EchappeeSpacing.section),
              Center(
                child: Column(
                  children: [
                    Text(
                      '${score.score}',
                      style: EchappeeTypography.display.copyWith(
                        fontSize: 72,
                        height: 1.1,
                        color: _tierColor,
                      ),
                    ),
                    const Text('score éco / 100',
                        style: EchappeeTypography.caption),
                  ],
                ),
              ),
              const SizedBox(height: EchappeeSpacing.section),
              _statsCard(),
              const SizedBox(height: EchappeeSpacing.s24),
              for (final tip in score.advice) _adviceRow(tip),
              const Spacer(),
              if (year != null && year.trips > 0)
                Padding(
                  padding:
                      const EdgeInsets.only(bottom: EchappeeSpacing.s12),
                  child: Text(
                    'Cette année : ${_fr(year.km, digits: 0)} km · '
                    '${_fr(year.moneySavedEur, digits: 2)} € · '
                    '${_fr(year.co2SavedKg)} kg CO₂',
                    style: EchappeeTypography.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ),
              EchappeeButton(
                label: 'Terminer',
                onPressed: () => context.go('/echappee/home'),
              ),
              const SizedBox(height: EchappeeSpacing.s16),
            ],
          ),
        ),
      ),
    );
  }

  /// Trois colonnes : carburant, argent, CO₂ — négatif = surcoût, affiché
  /// tel quel en couleur d'erreur plutôt que maquillé.
  Widget _statsCard() {
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: EchappeeSpacing.cardLoose,
        horizontal: EchappeeSpacing.card,
      ),
      decoration: const BoxDecoration(
        color: EchappeeColors.surface,
        borderRadius: EchappeeRadius.xlAll,
        boxShadow: EchappeeShadows.sm,
      ),
      child: Row(
        children: [
          _statColumn(
            value: score.fuelSavedL,
            text: '${_fr(score.fuelSavedL.abs(), digits: 2)} L',
            savedLabel: 'carburant\néconomisé',
            costLabel: 'surcoût\ncarburant',
          ),
          _divider(),
          _statColumn(
            value: score.moneySavedEur,
            text: '${_fr(score.moneySavedEur.abs(), digits: 2)} €',
            savedLabel: 'économisés',
            costLabel: 'de surcoût',
          ),
          _divider(),
          _statColumn(
            value: score.co2SavedKg,
            text: '${_fr(score.co2SavedKg.abs(), digits: 2)} kg',
            savedLabel: 'CO₂ évité',
            costLabel: 'CO₂ en plus',
          ),
        ],
      ),
    );
  }

  Widget _divider() => Container(
        width: 1,
        height: EchappeeSpacing.s40,
        color: EchappeeColors.border,
      );

  Widget _statColumn({
    required double value,
    required String text,
    required String savedLabel,
    required String costLabel,
  }) {
    final isCost = value < 0;
    return Expanded(
      child: Column(
        children: [
          Text(
            text,
            style: EchappeeTypography.h3.copyWith(
              color: isCost
                  ? EchappeeColors.error
                  : EchappeeColors.textPrimary,
            ),
          ),
          const SizedBox(height: EchappeeSpacing.s4),
          Text(
            isCost ? costLabel : savedLabel,
            style: EchappeeTypography.caption,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _adviceRow(String tip) {
    return Padding(
      padding: const EdgeInsets.only(bottom: EchappeeSpacing.s12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.eco, size: 18, color: EchappeeColors.nature),
          const SizedBox(width: EchappeeSpacing.s8),
          Expanded(child: Text(tip, style: EchappeeTypography.body)),
        ],
      ),
    );
  }
}
