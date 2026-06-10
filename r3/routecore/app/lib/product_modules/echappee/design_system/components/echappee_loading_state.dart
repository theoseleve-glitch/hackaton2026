import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_spacing.dart';
import '../echappee_typography.dart';

/// Chargement signature L'Échappée — pas de spinner agressif.
/// Une petite courbe de route Clay Red se dessine et s'efface doucement,
/// comme une respiration, avec trois haltes qui apparaissent en chemin.
class EchappeeLoadingState extends StatefulWidget {
  const EchappeeLoadingState({
    super.key,
    this.message = 'On cherche les plus beaux détours...',
  });

  /// Message affiché sous l'animation.
  final String message;

  @override
  State<EchappeeLoadingState> createState() => _EchappeeLoadingStateState();
}

class _EchappeeLoadingStateState extends State<EchappeeLoadingState>
    with SingleTickerProviderStateMixin {
  /// Taille du dessin de route (~120 x 40, fixée par le design system).
  static const _routeSize = Size(120, 40);

  late final AnimationController _controller;
  late final Animation<double> _progress;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
    _progress = CurvedAnimation(parent: _controller, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ExcludeSemantics(
            child: CustomPaint(
              size: _routeSize,
              painter: _RoutePainter(animation: _progress),
            ),
          ),
          const SizedBox(height: EchappeeSpacing.s16),
          Text(
            widget.message,
            style: EchappeeTypography.body
                .copyWith(color: EchappeeColors.textSecondary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

/// Dessine la portion visible de la route (PathMetrics.extractPath) et fait
/// éclore les haltes au passage du trait. Géométrie en fractions de la zone
/// de dessin : deux courbes quadratiques forment un S détendu.
class _RoutePainter extends CustomPainter {
  _RoutePainter({required this.animation}) : super(repaint: animation);

  final Animation<double> animation;

  /// Positions des haltes le long du trait (fraction de la longueur).
  static const _stops = [0.30, 0.58, 0.86];

  /// Fenêtre d'éclosion d'une halte après le passage du trait.
  static const _bloomWindow = 0.10;

  static const _strokeWidth = 3.0;
  static const _stopRadius = 3.0;

  @override
  void paint(Canvas canvas, Size size) {
    final route = Path()
      ..moveTo(size.width * 0.04, size.height * 0.82)
      ..quadraticBezierTo(
        size.width * 0.28,
        size.height * 0.05,
        size.width * 0.54,
        size.height * 0.50,
      )
      ..quadraticBezierTo(
        size.width * 0.78,
        size.height * 0.92,
        size.width * 0.96,
        size.height * 0.18,
      );

    final stroke = Paint()
      ..color = EchappeeColors.primary
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final t = animation.value;
    final metric = route.computeMetrics().first;
    final visibleLength = metric.length * t;
    if (visibleLength > 0) {
      canvas.drawPath(metric.extractPath(0, visibleLength), stroke);
    }

    final stopPaint = Paint()..color = EchappeeColors.accent;
    for (final stop in _stops) {
      // La halte grandit en douceur une fois le trait passé (rayon 0 -> 3).
      final bloom = ((t - stop) / _bloomWindow).clamp(0.0, 1.0);
      if (bloom == 0) {
        continue;
      }
      final tangent = metric.getTangentForOffset(metric.length * stop);
      if (tangent == null) {
        continue;
      }
      canvas.drawCircle(tangent.position, _stopRadius * bloom, stopPaint);
    }
  }

  @override
  bool shouldRepaint(_RoutePainter oldDelegate) =>
      oldDelegate.animation != animation;
}
