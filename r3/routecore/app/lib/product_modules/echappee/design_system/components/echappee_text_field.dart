import 'package:flutter/material.dart';

import '../echappee_colors.dart';
import '../echappee_radius.dart';
import '../echappee_spacing.dart';
import '../echappee_typography.dart';

const double _fieldIconSize = 20;
const double _focusedBorderWidth = 1.5;

OutlineInputBorder _fieldBorder(Color color, double width) {
  return OutlineInputBorder(
    borderRadius: EchappeeRadius.lgAll,
    borderSide: BorderSide(color: color, width: width),
  );
}

InputDecoration _fieldDecoration({
  String? hint,
  IconData? icon,
  Color iconColor = EchappeeColors.textSecondary,
}) {
  return InputDecoration(
    hintText: hint,
    hintStyle: EchappeeTypography.body
        .copyWith(color: EchappeeColors.textSecondary),
    filled: true,
    fillColor: EchappeeColors.surface,
    prefixIcon: icon == null
        ? null
        : Icon(icon, size: _fieldIconSize, color: iconColor),
    contentPadding: const EdgeInsets.symmetric(
      horizontal: EchappeeSpacing.s16,
      vertical: EchappeeSpacing.s16,
    ),
    border: _fieldBorder(EchappeeColors.border, 1),
    enabledBorder: _fieldBorder(EchappeeColors.border, 1),
    focusedBorder: _fieldBorder(EchappeeColors.primary, _focusedBorderWidth),
    errorBorder: _fieldBorder(EchappeeColors.error, 1),
    focusedErrorBorder: _fieldBorder(EchappeeColors.error, _focusedBorderWidth),
  );
}

/// Champ de saisie générique L'Échappée — Soft White, contour Warm Stone,
/// coins doux. Le label optionnel s'affiche au-dessus du champ.
class EchappeeTextField extends StatelessWidget {
  const EchappeeTextField({
    super.key,
    this.controller,
    this.label,
    this.hint,
    this.icon,
    this.onChanged,
    this.keyboardType,
    this.obscureText = false,
  });

  final TextEditingController? controller;
  final String? label;
  final String? hint;
  final IconData? icon;
  final ValueChanged<String>? onChanged;
  final TextInputType? keyboardType;
  final bool obscureText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null) ...[
          Text(label!, style: EchappeeTypography.bodySmall),
          const SizedBox(height: EchappeeSpacing.s8),
        ],
        TextField(
          controller: controller,
          onChanged: onChanged,
          keyboardType: keyboardType,
          obscureText: obscureText,
          style: EchappeeTypography.body,
          cursorColor: EchappeeColors.primary,
          decoration: _fieldDecoration(hint: hint, icon: icon),
        ),
      ],
    );
  }
}

/// Champ d'itinéraire signature — « Départ » / « Destination ».
/// Icône Clay Red à gauche, hint chaleureux type « Où veux-tu aller ? ».
/// Peut être en lecture seule avec [onTap] pour ouvrir une recherche.
class EchappeeRouteField extends StatelessWidget {
  const EchappeeRouteField({
    super.key,
    required this.label,
    required this.hint,
    this.controller,
    this.icon = Icons.place_outlined,
    this.onChanged,
    this.onTap,
    this.readOnly = false,
  });

  final String label;
  final String hint;
  final TextEditingController? controller;
  final IconData icon;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onTap;
  final bool readOnly;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: EchappeeTypography.caption),
        const SizedBox(height: EchappeeSpacing.s4),
        TextField(
          controller: controller,
          onChanged: onChanged,
          onTap: onTap,
          readOnly: readOnly,
          style: EchappeeTypography.body,
          cursorColor: EchappeeColors.primary,
          decoration: _fieldDecoration(
            hint: hint,
            icon: icon,
            iconColor: EchappeeColors.primary,
          ),
        ),
      ],
    );
  }
}
