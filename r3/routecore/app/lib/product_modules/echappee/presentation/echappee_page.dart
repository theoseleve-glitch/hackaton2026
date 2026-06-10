import 'package:flutter/material.dart';

import '../design_system/design_system.dart';

/// Wraps every L'Échappée screen in the brand theme without touching the
/// neutral core theme. Also provides the shared eyebrow label style.
class EchappeePage extends StatelessWidget {
  const EchappeePage({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) =>
      Theme(data: EchappeeTheme.light(), child: child);
}

/// Petit label en majuscules espacées (« L'ATELIER », « 01 DESTINATION »)
/// — motif éditorial signature de la marque.
class EchappeeEyebrow extends StatelessWidget {
  const EchappeeEyebrow(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: EchappeeTypography.caption.copyWith(
        color: color ?? EchappeeColors.primary,
        letterSpacing: 2.2,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}
