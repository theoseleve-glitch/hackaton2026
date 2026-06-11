import 'package:flutter/material.dart';

import '../design_system/design_system.dart';
import 'echappee_page.dart';

/// Titre Fraunces h2 avec UN mot accentué en italique — Clay Red par défaut,
/// couleurs ajustables pour le panneau sombre.
Widget _accentTitle(
  String before,
  String accent,
  String after, {
  Color? color,
  Color accentColor = EchappeeColors.primary,
}) {
  final style = color == null
      ? EchappeeTypography.h2
      : EchappeeTypography.h2.copyWith(color: color);
  return Text.rich(
    TextSpan(style: style, children: [
      TextSpan(text: before),
      TextSpan(
        text: accent,
        style: style.copyWith(
          color: accentColor,
          fontStyle: FontStyle.italic,
        ),
      ),
      TextSpan(text: after),
    ]),
  );
}

/// Section « Comment ça marche » : quatre gestes numérotés en grille 2×2,
/// fidèles au parcours de la landing validée.
class EchappeeHowItWorksSection extends StatelessWidget {
  const EchappeeHowItWorksSection({super.key});

  static const List<_HowItWorksStep> _steps = [
    _HowItWorksStep(
      number: '01',
      icon: Icons.place_outlined,
      title: 'Choisis ta destination',
      body: 'Lyon → Annecy, Paris → Honfleur, ou simplement "la mer". '
          'On part de là.',
    ),
    _HowItWorksStep(
      number: '02',
      icon: Icons.schedule,
      title: 'Combien de temps t\'offres-tu ?',
      body: '+15 min, +1 h, une journée entière. Le détour s\'ajuste à ton '
          'humeur, pas l\'inverse.',
    ),
    _HowItWorksStep(
      number: '03',
      icon: Icons.auto_awesome,
      title: 'Choisis ton mood',
      body: 'Goûter local, vue panoramique, eau fraîche, marché paysan, '
          'hors des sentiers.',
    ),
    _HowItWorksStep(
      number: '04',
      icon: Icons.route,
      title: 'Reçois ta route',
      body: 'Un itinéraire pensé, des arrêts vrais, des mots d\'auteur. '
          'Tu n\'as plus qu\'à rouler.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const EchappeeEyebrow('Comment ça marche'),
        const SizedBox(height: EchappeeSpacing.s12),
        _accentTitle('Quatre gestes. Une route qui te ', 'ressemble', '.'),
        const SizedBox(height: EchappeeSpacing.s20),
        _row(_steps[0], _steps[1]),
        const SizedBox(height: EchappeeSpacing.s12),
        _row(_steps[2], _steps[3]),
      ],
    );
  }

  /// Rangée de deux cards de même hauteur — pas de largeur fixe, donc
  /// aucun débordement à 360 px.
  Widget _row(_HowItWorksStep left, _HowItWorksStep right) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(child: _HowItWorksCard(step: left)),
          const SizedBox(width: EchappeeSpacing.s12),
          Expanded(child: _HowItWorksCard(step: right)),
        ],
      ),
    );
  }
}

/// Un geste du parcours : numéro, icône, titre et description courte.
class _HowItWorksStep {
  const _HowItWorksStep({
    required this.number,
    required this.icon,
    required this.title,
    required this.body,
  });

  final String number;
  final IconData icon;
  final String title;
  final String body;
}

/// Card d'un geste — grand numéro Fraunces en filigrane, icône Clay Red,
/// titre Inter gras et corps court.
class _HowItWorksCard extends StatelessWidget {
  const _HowItWorksCard({required this.step});

  final _HowItWorksStep step;

  static const double _iconSize = 20;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(EchappeeSpacing.card),
      decoration: BoxDecoration(
        color: EchappeeColors.surface,
        borderRadius: EchappeeRadius.lgAll,
        border: Border.all(color: EchappeeColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                step.number,
                style: EchappeeTypography.h1
                    .copyWith(color: EchappeeColors.border),
              ),
              Icon(step.icon,
                  size: _iconSize, color: EchappeeColors.primary),
            ],
          ),
          const SizedBox(height: EchappeeSpacing.s8),
          Text(
            step.title,
            style: EchappeeTypography.body
                .copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: EchappeeSpacing.s4),
          Text(step.body, style: EchappeeTypography.bodySmall),
        ],
      ),
    );
  }
}

/// Section « Manifeste » : la promesse de la marque en deux paragraphes,
/// suivie des trois chiffres clés séparés par de fins filets verticaux.
class EchappeeManifesteSection extends StatelessWidget {
  const EchappeeManifesteSection({super.key});

  static const _divider = Padding(
    padding: EdgeInsets.symmetric(horizontal: EchappeeSpacing.s12),
    child: SizedBox(
      width: 1,
      child: ColoredBox(color: EchappeeColors.border),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const EchappeeEyebrow('Manifeste'),
        const SizedBox(height: EchappeeSpacing.s12),
        _accentTitle(
            'Le plus court chemin n\'est pas ', 'toujours', ' le bon.'),
        const SizedBox(height: EchappeeSpacing.s16),
        Text(
          'On a oublié que la route est un endroit. Pas un tube qui relie '
          'deux points, mais une suite de pays minuscules où l\'on pourrait '
          's\'arrêter. L\'Échappée remet du temps, du goût et du paysage '
          'entre ton départ et ton arrivée.',
          style: EchappeeTypography.bodyLarge
              .copyWith(color: EchappeeColors.textSecondary),
        ),
        const SizedBox(height: EchappeeSpacing.s12),
        Text(
          'Pas d\'enseignes, pas de classements. Des artisans, des '
          'panoramas, des rivières — choisis par des gens qui y vivent.',
          style: EchappeeTypography.body
              .copyWith(color: EchappeeColors.textSecondary),
        ),
        const SizedBox(height: EchappeeSpacing.s24),
        const IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: _ManifesteStat(
                    value: '2 400+', label: 'Lieux référencés'),
              ),
              _divider,
              Expanded(
                child: _ManifesteStat(
                    value: '180', label: 'Curateurs locaux'),
              ),
              _divider,
              Expanded(
                child:
                    _ManifesteStat(value: '+12 min', label: 'Détour moyen'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Chiffre clé du manifeste — nombre Fraunces Clay Red, légende Inter.
class _ManifesteStat extends StatelessWidget {
  const _ManifesteStat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          value,
          textAlign: TextAlign.center,
          style:
              EchappeeTypography.h2.copyWith(color: EchappeeColors.primary),
        ),
        const SizedBox(height: EchappeeSpacing.s4),
        Text(
          label,
          textAlign: TextAlign.center,
          style: EchappeeTypography.caption,
        ),
      ],
    );
  }
}

/// Panneau CTA final sur fond Deep Brown : dernier appel à créer son
/// échappée, avec un lien secondaire vers une échappée d'exemple.
class EchappeeFooterCta extends StatelessWidget {
  const EchappeeFooterCta({
    super.key,
    required this.onCreate,
    required this.onExample,
  });

  /// Lance la création d'une échappée (CTA principal).
  final VoidCallback onCreate;

  /// Ouvre une échappée d'exemple (lien secondaire).
  final VoidCallback onExample;

  @override
  Widget build(BuildContext context) {
    const cream = EchappeeColors.background;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(EchappeeSpacing.s24),
      decoration: const BoxDecoration(
        color: EchappeeColors.textPrimary,
        borderRadius: EchappeeRadius.xlAll,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          EchappeeEyebrow(
            'Prêt·e à dévier ?',
            color: cream.withValues(alpha: 0.7),
          ),
          const SizedBox(height: EchappeeSpacing.s12),
          _accentTitle(
            'Ta prochaine route ',
            'respire',
            ' déjà quelque part.',
            color: cream,
            accentColor: EchappeeColors.accent,
          ),
          const SizedBox(height: EchappeeSpacing.s12),
          Text(
            'Crée ta première échappée en moins d\'une minute. Gratuite, '
            'sans compte, sans pub.',
            style: EchappeeTypography.bodySmall
                .copyWith(color: cream.withValues(alpha: 0.75)),
          ),
          const SizedBox(height: EchappeeSpacing.s24),
          EchappeeButton(
            label: 'Créer mon échappée',
            icon: Icons.east,
            onPressed: onCreate,
          ),
          const SizedBox(height: EchappeeSpacing.s8),
          Center(
            child: TextButton(
              onPressed: onExample,
              child: Text(
                'Voir une échappée d\'exemple',
                style: EchappeeTypography.body.copyWith(
                  color: cream.withValues(alpha: 0.85),
                  decoration: TextDecoration.underline,
                  decorationColor: cream.withValues(alpha: 0.4),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
