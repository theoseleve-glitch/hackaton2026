import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_typography.dart';

/// Symbole L'Échappée : un cercle ouvert traversé par une courbe de route
/// qui s'en échappe, terminée par un point (la halte).
/// cercle = lieu/destination · ouverture = liberté · courbe = détour ·
/// point = découverte. Jamais de pin GPS générique.
class EchappeeLogo extends StatelessWidget {
  const EchappeeLogo({
    super.key,
    this.size = 72,
    this.color = EchappeeColors.primary,
  });

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: CustomPaint(
        size: Size(size, size),
        painter: _EchappeeSymbolPainter(color),
      ),
    );
  }
}

/// Logo complet : symbole + wordmark Fraunces.
class EchappeeWordmark extends StatelessWidget {
  const EchappeeWordmark({super.key, this.symbolSize = 64});

  final double symbolSize;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        EchappeeLogo(size: symbolSize),
        SizedBox(height: symbolSize * 0.25),
        const Text("L'Échappée", style: EchappeeTypography.h1),
      ],
    );
  }
}

class _EchappeeSymbolPainter extends CustomPainter {
  _EchappeeSymbolPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.08;
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;

    final center = Offset(size.width * 0.45, size.height * 0.55);
    final radius = size.width * 0.32;

    // Cercle ouvert en haut à droite (l'ouverture = l'échappée).
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      0.62, // début après l'ouverture
      5.1, // laisse ~1.18 rad d'ouverture
      false,
      paint,
    );

    // Courbe de route qui sort du cercle par l'ouverture.
    final path = Path()
      ..moveTo(center.dx + radius * 0.25, center.dy + radius * 0.45)
      ..quadraticBezierTo(
        center.dx + radius * 0.75,
        center.dy - radius * 0.15,
        center.dx + radius * 0.85,
        center.dy - radius * 0.95,
      )
      ..quadraticBezierTo(
        center.dx + radius * 0.95,
        center.dy - radius * 1.55,
        size.width * 0.92,
        size.height * 0.12,
      );
    canvas.drawPath(path, paint);

    // La halte : un point au bout de la route.
    canvas.drawCircle(
      Offset(size.width * 0.92, size.height * 0.12),
      stroke * 0.85,
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(covariant _EchappeeSymbolPainter old) =>
      old.color != color;
}
