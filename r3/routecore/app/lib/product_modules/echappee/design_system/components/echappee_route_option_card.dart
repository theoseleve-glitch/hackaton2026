import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_radius.dart';
import '../echappee_shadows.dart';
import '../echappee_spacing.dart';
import '../echappee_typography.dart';

/// Card de choix d'itinéraire : trajet direct ou échappée recommandée.
/// Ex. 'Trajet direct' / '2h14' / '186 km' / 'Le plus rapide'
/// ou 'Échappée recommandée' / '2h32' / '194 km' / '4 haltes · +18 min'.
class EchappeeRouteOptionCard extends StatelessWidget {
  const EchappeeRouteOptionCard({
    super.key,
    required this.title,
    required this.duration,
    required this.distance,
    this.subtitle,
    this.isEchappee = false,
    this.selected = false,
    this.onTap,
  });

  final String title;
  final String duration;
  final String distance;
  final String? subtitle;
  final bool isEchappee;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final routeSubtitle = subtitle;
    return Semantics(
      button: true,
      selected: selected,
      label: '$title, $duration, $distance',
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
        constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
        decoration: BoxDecoration(
          color: EchappeeColors.surface,
          borderRadius: EchappeeRadius.xlAll,
          border: Border.all(
            color: selected ? EchappeeColors.primary : EchappeeColors.border,
            width: selected ? 1.5 : 1,
          ),
          boxShadow: EchappeeShadows.sm,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: EchappeeRadius.xlAll,
            child: Padding(
              padding: const EdgeInsets.all(EchappeeSpacing.cardLoose),
              child: Row(
                children: [
                  SizedBox(
                    width: 40,
                    height: 16,
                    child: CustomPaint(
                      painter: _RouteLinePainter(isEchappee: isEchappee),
                    ),
                  ),
                  const SizedBox(width: EchappeeSpacing.s16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(title, style: EchappeeTypography.h3),
                        if (routeSubtitle != null) ...[
                          const SizedBox(height: EchappeeSpacing.s4),
                          Text(
                            routeSubtitle,
                            style: EchappeeTypography.bodySmall,
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: EchappeeSpacing.s12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        duration,
                        style: EchappeeTypography.body
                            .copyWith(fontWeight: FontWeight.w600),
                      ),
                      Text(distance, style: EchappeeTypography.bodySmall),
                    ],
                  ),
                  if (selected) ...[
                    const SizedBox(width: EchappeeSpacing.s12),
                    const Icon(
                      Icons.check_circle_rounded,
                      color: EchappeeColors.primary,
                      size: 22,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Petite ligne de route stylisée (40 × 16) : courbe Clay Red pour
/// l'échappée, trait pointillé Stone Taupe pour le trajet direct.
class _RouteLinePainter extends CustomPainter {
  const _RouteLinePainter({required this.isEchappee});

  final bool isEchappee;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;

    if (isEchappee) {
      paint.color = EchappeeColors.primary;
      final path = Path()
        ..moveTo(0, size.height * 0.75)
        ..cubicTo(
          size.width * 0.35,
          size.height * 1.05,
          size.width * 0.55,
          -size.height * 0.05,
          size.width,
          size.height * 0.25,
        );
      canvas.drawPath(path, paint);
    } else {
      paint.color = EchappeeColors.textSecondary;
      final y = size.height / 2;
      const dash = 4.0;
      const gap = 4.0;
      var x = 0.0;
      while (x < size.width) {
        final end = (x + dash) < size.width ? (x + dash) : size.width;
        canvas.drawLine(Offset(x, y), Offset(end, y), paint);
        x += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(_RouteLinePainter oldDelegate) =>
      oldDelegate.isEchappee != isEchappee;
}
