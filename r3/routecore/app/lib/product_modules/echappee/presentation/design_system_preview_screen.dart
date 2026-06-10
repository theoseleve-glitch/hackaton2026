import 'package:flutter/material.dart';

import '../design_system/design_system.dart';

void _noop() {}

/// Écran de démonstration du design system L'Échappée.
/// Toutes les sections (tokens + composants) sont visibles d'un seul tenant
/// pour la revue visuelle. Wrappé dans [EchappeeTheme.light] sans toucher au
/// thème core RouteCore.
class EchappeeDesignSystemPreviewScreen extends StatelessWidget {
  const EchappeeDesignSystemPreviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: EchappeeTheme.light(),
      child: Scaffold(
        backgroundColor: EchappeeColors.background,
        appBar: AppBar(title: const Text("L'Échappée — Design System")),
        body: ListView(
          padding: const EdgeInsets.symmetric(
            horizontal: EchappeeSpacing.screen,
            vertical: EchappeeSpacing.s24,
          ),
          children: const [
            _Section(title: 'Couleurs', child: _ColorsGrid()),
            _Section(title: 'Typographie', child: _TypographyList()),
            _Section(title: 'Boutons', child: _ButtonsDemo()),
            _Section(title: 'Champs', child: _FieldsDemo()),
            _Section(title: 'Catégories', child: _ChipsDemo()),
            _Section(
              title: "Combien de temps veux-tu t'offrir ?",
              child: _DetourDemo(),
            ),
            _Section(title: "Deux façons d'y aller", child: _RouteDemo()),
            _Section(title: 'Halte suggérée', child: _PoiDemo()),
            _Section(title: 'Badge partenaire', child: EchappeePartnerBadge()),
            _Section(title: 'État vide', child: _EmptyDemo()),
            _Section(title: 'Chargement', child: EchappeeLoadingState()),
            _Section(title: 'Bottom sheet', child: _SheetDemo()),
          ],
        ),
      ),
    );
  }
}

/// Section titrée en Fraunces (h2), espacée du token section.
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: EchappeeSpacing.section),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: EchappeeTypography.h2),
          const SizedBox(height: EchappeeSpacing.s16),
          child,
        ],
      ),
    );
  }
}

class _ColorsGrid extends StatelessWidget {
  const _ColorsGrid();

  /// Largeur fixe d'une tuile de démonstration.
  static const double _tileWidth = 96;

  static const _swatches = <(String, String, Color)>[
    ('primary', '#D95F45', EchappeeColors.primary),
    ('primaryPressed', '#BE4F37', EchappeeColors.primaryPressed),
    ('primaryTint', '#F9E5DE', EchappeeColors.primaryTint),
    ('background', '#FFF7EA', EchappeeColors.background),
    ('surface', '#FFFCF5', EchappeeColors.surface),
    ('surfaceElevated', '#FFFEFB', EchappeeColors.surfaceElevated),
    ('textPrimary', '#2B211C', EchappeeColors.textPrimary),
    ('textSecondary', '#8A7C70', EchappeeColors.textSecondary),
    ('nature', '#6F7F45', EchappeeColors.nature),
    ('accent', '#D9A441', EchappeeColors.accent),
    ('accentTint', '#33D9A441', EchappeeColors.accentTint),
    ('mapAccent', '#7EA8A4', EchappeeColors.mapAccent),
    ('success', '#587A3A', EchappeeColors.success),
    ('error', '#B64035', EchappeeColors.error),
    ('border', '#E7D8C8', EchappeeColors.border),
    ('disabled', '#C9BBAE', EchappeeColors.disabled),
  ];

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: EchappeeSpacing.s12,
      runSpacing: EchappeeSpacing.s12,
      children: [
        for (final (name, hex, color) in _swatches)
          SizedBox(
            width: _tileWidth,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: EchappeeSpacing.s48,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: EchappeeRadius.mdAll,
                    border: Border.all(color: EchappeeColors.border),
                  ),
                ),
                const SizedBox(height: EchappeeSpacing.s4),
                Text(name, style: EchappeeTypography.caption),
                Text(hex, style: EchappeeTypography.caption),
              ],
            ),
          ),
      ],
    );
  }
}

class _TypographyList extends StatelessWidget {
  const _TypographyList();

  static const _styles = <(String, TextStyle)>[
    ('display', EchappeeTypography.display),
    ('h1', EchappeeTypography.h1),
    ('h2', EchappeeTypography.h2),
    ('h3', EchappeeTypography.h3),
    ('bodyLarge', EchappeeTypography.bodyLarge),
    ('body', EchappeeTypography.body),
    ('bodySmall', EchappeeTypography.bodySmall),
    ('caption', EchappeeTypography.caption),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final (name, style) in _styles)
          Padding(
            padding: const EdgeInsets.only(bottom: EchappeeSpacing.s12),
            child: Text('$name — Les routes qui respirent', style: style),
          ),
        // Le style button est blanc cassé : on le pose sur fond Clay Red.
        const DecoratedBox(
          decoration: BoxDecoration(
            color: EchappeeColors.primary,
            borderRadius: EchappeeRadius.smAll,
          ),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: EchappeeSpacing.s12,
              vertical: EchappeeSpacing.s8,
            ),
            child: Text(
              'button — Créer mon échappée',
              style: EchappeeTypography.button,
            ),
          ),
        ),
      ],
    );
  }
}

class _ButtonsDemo extends StatelessWidget {
  const _ButtonsDemo();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        EchappeeButton(label: 'Créer mon échappée', onPressed: _noop),
        SizedBox(height: EchappeeSpacing.s12),
        EchappeeButton(
          label: 'Modifier',
          variant: EchappeeButtonVariant.secondary,
          onPressed: _noop,
        ),
        SizedBox(height: EchappeeSpacing.s12),
        EchappeeButton(
          label: 'Garder pour plus tard',
          variant: EchappeeButtonVariant.tertiary,
          onPressed: _noop,
        ),
        SizedBox(height: EchappeeSpacing.s12),
        EchappeeButton(
          label: 'Créer mon échappée',
          loading: true,
          onPressed: _noop,
        ),
        SizedBox(height: EchappeeSpacing.s12),
        // Sans onPressed : état désactivé.
        EchappeeButton(label: 'Créer mon échappée'),
      ],
    );
  }
}

class _FieldsDemo extends StatelessWidget {
  const _FieldsDemo();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        EchappeeRouteField(
          label: 'Départ',
          hint: 'Ta position actuelle',
          icon: Icons.my_location_rounded,
        ),
        SizedBox(height: EchappeeSpacing.s12),
        EchappeeRouteField(label: 'Destination', hint: 'Où veux-tu aller ?'),
      ],
    );
  }
}

class _ChipsDemo extends StatefulWidget {
  const _ChipsDemo();

  @override
  State<_ChipsDemo> createState() => _ChipsDemoState();
}

class _ChipsDemoState extends State<_ChipsDemo> {
  static const _categories = <(String, IconData, Color)>[
    (
      'Producteurs',
      Icons.agriculture_outlined,
      EchappeeColors.categoryProducteurs,
    ),
    ('Marchés', Icons.storefront_outlined, EchappeeColors.categoryMarches),
    ('Villages', Icons.cottage_outlined, EchappeeColors.categoryVillages),
    ('Artisans', Icons.handyman_outlined, EchappeeColors.categoryArtisans),
    (
      'Points de vue',
      Icons.landscape_outlined,
      EchappeeColors.categoryPointsDeVue,
    ),
    (
      'Bonnes tables',
      Icons.restaurant_outlined,
      EchappeeColors.categoryBonnesTables,
    ),
    ('Nature', Icons.park_outlined, EchappeeColors.categoryNature),
    (
      'Événements',
      Icons.celebration_outlined,
      EchappeeColors.categoryEvenements,
    ),
  ];

  final _selected = <String>{'Producteurs', 'Points de vue', 'Nature'};

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: EchappeeSpacing.s8,
      runSpacing: EchappeeSpacing.s8,
      children: [
        for (final (label, icon, color) in _categories)
          EchappeeCategoryChip(
            label: label,
            icon: icon,
            color: color,
            selected: _selected.contains(label),
            onSelected: (selected) => setState(() {
              if (selected) {
                _selected.add(label);
              } else {
                _selected.remove(label);
              }
            }),
          ),
      ],
    );
  }
}

class _DetourDemo extends StatefulWidget {
  const _DetourDemo();

  @override
  State<_DetourDemo> createState() => _DetourDemoState();
}

class _DetourDemoState extends State<_DetourDemo> {
  int _selected = 1;

  @override
  Widget build(BuildContext context) {
    const presets = EchappeeDetourOption.presets;
    return Wrap(
      spacing: EchappeeSpacing.s12,
      runSpacing: EchappeeSpacing.s12,
      children: [
        for (var i = 0; i < presets.length; i++)
          EchappeeDetourCard(
            option: presets[i],
            selected: i == _selected,
            onTap: () => setState(() => _selected = i),
          ),
      ],
    );
  }
}

class _RouteDemo extends StatefulWidget {
  const _RouteDemo();

  @override
  State<_RouteDemo> createState() => _RouteDemoState();
}

class _RouteDemoState extends State<_RouteDemo> {
  int _selected = 1;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        EchappeeRouteOptionCard(
          title: 'Trajet direct',
          duration: '2h14',
          distance: '186 km',
          subtitle: 'Le plus rapide',
          selected: _selected == 0,
          onTap: () => setState(() => _selected = 0),
        ),
        const SizedBox(height: EchappeeSpacing.s12),
        EchappeeRouteOptionCard(
          title: 'Échappée recommandée',
          duration: '2h32',
          distance: '194 km',
          subtitle: '4 haltes · +18 min',
          isEchappee: true,
          selected: _selected == 1,
          onTap: () => setState(() => _selected = 1),
        ),
      ],
    );
  }
}

class _PoiDemo extends StatelessWidget {
  const _PoiDemo();

  @override
  Widget build(BuildContext context) {
    return const EchappeePoiCard(
      name: 'Ferme des Marais',
      category: 'Producteur local',
      isOpen: true,
      detourLabel: '+8 min de détour · 1,4 km de ta route',
      reason: 'Fromages fermiers, boutique directe et vue sur les marais.',
      isPartner: true,
      categoryColor: EchappeeColors.categoryProducteurs,
      onFavorite: _noop,
      onAddToRoute: _noop,
    );
  }
}

class _EmptyDemo extends StatelessWidget {
  const _EmptyDemo();

  @override
  Widget build(BuildContext context) {
    return const EchappeeEmptyState(
      title: 'Pas encore de belle halte ici.',
      message: "Essaie d'élargir ton détour ou de changer de catégorie.",
      actionLabel: 'Élargir le détour',
      onAction: _noop,
    );
  }
}

class _SheetDemo extends StatelessWidget {
  const _SheetDemo();

  @override
  Widget build(BuildContext context) {
    return EchappeeButton(
      label: 'Ouvrir le panneau',
      variant: EchappeeButtonVariant.secondary,
      onPressed: () => EchappeeBottomSheet.show<void>(
        context,
        title: 'Une halte en chemin ?',
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Ce panneau se pose doucement sur la carte, '
              'sans jamais brusquer le voyage.',
              style: EchappeeTypography.body
                  .copyWith(color: EchappeeColors.textSecondary),
            ),
            const SizedBox(height: EchappeeSpacing.s16),
            EchappeeButton(
              label: 'Continuer ma route',
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}
