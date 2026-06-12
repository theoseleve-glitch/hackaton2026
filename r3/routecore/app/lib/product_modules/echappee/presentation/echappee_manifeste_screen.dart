import 'package:flutter/material.dart';

import '../design_system/design_system.dart';
import 'echappee_home_sections.dart';
import 'echappee_page.dart';

/// Le manifeste et le « comment ça marche », sortis de la home (l'app reste
/// sobre) et accessibles depuis Réglages pour qui veut comprendre la démarche.
class EchappeeManifesteScreen extends StatelessWidget {
  const EchappeeManifesteScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return EchappeePage(
      child: Scaffold(
        appBar: AppBar(backgroundColor: Colors.transparent),
        body: ListView(
          padding: const EdgeInsets.all(EchappeeSpacing.screen),
          children: const [
            EchappeeManifesteSection(),
            SizedBox(height: EchappeeSpacing.section),
            EchappeeHowItWorksSection(),
            SizedBox(height: EchappeeSpacing.section),
          ],
        ),
      ),
    );
  }
}
