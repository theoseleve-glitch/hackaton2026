import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../echappee/design_system/echappee_colors.dart';
import '../../echappee/design_system/echappee_radius.dart';
import '../../echappee/design_system/echappee_shadows.dart';
import '../../echappee/design_system/echappee_spacing.dart';
import '../../echappee/design_system/echappee_typography.dart';
import '../domain/eco_coach.dart';
import 'eco_coach_controller.dart';

/// Overlay sobre du coach pour le slot `coachOverlay` de l'écran de
/// navigation : une pastille « Éco 82 » discrète en bas au centre, remplacée
/// par une pilule conseil (icône + message) quand le coach parle —
/// 1 conseil à la fois, auto-effacé après 8 s (anti-surcharge cognitive,
/// docs/ECO_COACHING_RESEARCH.md §1).
class EcoCoachOverlay extends StatefulWidget {
  const EcoCoachOverlay({super.key, required this.state});

  /// État du coach ([EcoCoachController.state]).
  final ValueListenable<EcoCoachState> state;

  /// Filet de sécurité local : la pilule disparaît même si le contrôleur ne
  /// reçoit plus de fixes GPS (tunnel, pause).
  static const dismissAfter = Duration(seconds: 8);

  @override
  State<EcoCoachOverlay> createState() => _EcoCoachOverlayState();
}

class _EcoCoachOverlayState extends State<EcoCoachOverlay> {
  Timer? _dismissTimer;
  String? _dismissedAdvice;

  @override
  void dispose() {
    _dismissTimer?.cancel();
    super.dispose();
  }

  void _armDismiss(String advice) {
    _dismissTimer?.cancel();
    _dismissTimer = Timer(EcoCoachOverlay.dismissAfter, () {
      if (mounted) setState(() => _dismissedAdvice = advice);
    });
  }

  IconData _iconFor(EcoAdviceKind? kind) => switch (kind) {
        EcoAdviceKind.liftOff => Icons.keyboard_double_arrow_down,
        EcoAdviceKind.slowDown => Icons.trending_down,
        EcoAdviceKind.steadySpeed => Icons.speed,
        EcoAdviceKind.anticipate => Icons.visibility_outlined,
        null => Icons.eco,
      };

  Color _scoreColor(int score) {
    if (score >= 80) return EchappeeColors.success;
    if (score >= 50) return EchappeeColors.accent;
    return EchappeeColors.error;
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<EcoCoachState>(
      valueListenable: widget.state,
      builder: (context, state, _) {
        final advice = state.activeAdvice;
        final showAdvice = advice != null && advice != _dismissedAdvice;
        if (showAdvice && _dismissedAdvice != null) _dismissedAdvice = null;
        if (showAdvice) _armDismiss(advice);

        return Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.all(EchappeeSpacing.mapOverlay),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: showAdvice
                  ? _advicePill(advice, state.activeKind)
                  : _scoreChip(state.liveScoreEstimate),
            ),
          ),
        );
      },
    );
  }

  /// Pilule conseil : icône feuille de la famille du conseil + message court.
  Widget _advicePill(String message, EcoAdviceKind? kind) {
    return Container(
      key: ValueKey('advice:$message'),
      constraints: const BoxConstraints(maxWidth: 360),
      padding: const EdgeInsets.symmetric(
        horizontal: EchappeeSpacing.s16,
        vertical: EchappeeSpacing.s12,
      ),
      decoration: const BoxDecoration(
        color: EchappeeColors.mapOverlay,
        borderRadius: EchappeeRadius.xlAll,
        boxShadow: EchappeeShadows.md,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_iconFor(kind), size: 22, color: EchappeeColors.primary),
          const SizedBox(width: EchappeeSpacing.s12),
          Flexible(
            child: Text(
              message,
              style: EchappeeTypography.body,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  /// Pastille score minuscule : « Éco 82 », teintée par palier.
  Widget _scoreChip(int score) {
    final color = _scoreColor(score);
    return Container(
      key: const ValueKey('score-chip'),
      padding: const EdgeInsets.symmetric(
        horizontal: EchappeeSpacing.s12,
        vertical: EchappeeSpacing.s4,
      ),
      decoration: const BoxDecoration(
        color: EchappeeColors.mapOverlay,
        borderRadius: EchappeeRadius.fullAll,
        boxShadow: EchappeeShadows.sm,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.eco, size: 14, color: color),
          const SizedBox(width: EchappeeSpacing.s4),
          Text(
            'Éco $score',
            style: EchappeeTypography.caption.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
