import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../product_modules/echappee/design_system/design_system.dart';
import '../../../product_modules/echappee/presentation/echappee_page.dart';
import '../data/vehicle_repository.dart';
import '../domain/vehicle.dart';

/// Choix du véhicule — volontairement sobre : un titre, une recherche, une
/// liste, une confirmation.
class VehiclePickerScreen extends ConsumerStatefulWidget {
  const VehiclePickerScreen({super.key, this.isOnboarding = true});

  final bool isOnboarding;

  @override
  ConsumerState<VehiclePickerScreen> createState() =>
      _VehiclePickerScreenState();
}

class _VehiclePickerScreenState extends ConsumerState<VehiclePickerScreen> {
  final _consController = TextEditingController();
  var _results = <Vehicle>[];
  Vehicle? _selected;
  var _searchSeq = 0;

  @override
  void dispose() {
    _consController.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    final seq = ++_searchSeq;
    final results = await ref.read(vehicleRepositoryProvider).search(query);
    if (!mounted || seq != _searchSeq) return;
    setState(() {
      _results = results;
      _selected = null;
    });
  }

  void _select(Vehicle vehicle) {
    _consController.text = _frNum(vehicle.consL100);
    setState(() => _selected = vehicle);
  }

  Future<void> _confirm() async {
    final vehicle = _selected;
    if (vehicle == null) return;
    final typed = double.tryParse(_consController.text.replaceAll(',', '.'));
    final override =
        (typed == null || typed <= 0 || typed == vehicle.consL100)
            ? null
            : typed;
    await ref
        .read(vehicleSelectionProvider.notifier)
        .select(VehicleSelection(vehicle: vehicle, userConsL100: override));
    _leave();
  }

  Future<void> _skip() async {
    await ref.read(vehicleSelectionProvider.notifier).skip();
    _leave();
  }

  void _leave() {
    if (!mounted) return;
    if (widget.isOnboarding) {
      context.go('/echappee/home');
    } else {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    return EchappeePage(
      child: Scaffold(
        backgroundColor: EchappeeColors.background,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              EchappeeSpacing.screen,
              EchappeeSpacing.s24,
              EchappeeSpacing.screen,
              EchappeeSpacing.s24,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const EchappeeEyebrow('Ton véhicule'),
                const SizedBox(height: EchappeeSpacing.s8),
                const Text(
                  'Quelle voiture roule avec toi ?',
                  style: EchappeeTypography.h1,
                ),
                const SizedBox(height: EchappeeSpacing.s24),
                EchappeeTextField(
                  hint: 'Marque, modèle…',
                  icon: Icons.search,
                  onChanged: _search,
                ),
                const SizedBox(height: EchappeeSpacing.s16),
                Expanded(
                  child: selected == null
                      ? _buildResults()
                      : _buildConfirmation(selected),
                ),
                if (selected != null) ...[
                  EchappeeButton(label: 'C’est ma voiture', onPressed: _confirm),
                  const SizedBox(height: EchappeeSpacing.s4),
                ],
                EchappeeButton(
                  label: 'Plus tard',
                  variant: EchappeeButtonVariant.tertiary,
                  onPressed: _skip,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildResults() {
    return ListView.builder(
      itemCount: _results.length,
      itemBuilder: (_, i) => _VehicleRow(
        vehicle: _results[i],
        onTap: () => _select(_results[i]),
      ),
    );
  }

  /// Card compacte : véhicule retenu + conso modifiable.
  Widget _buildConfirmation(Vehicle vehicle) {
    return SingleChildScrollView(
      child: Container(
        padding: const EdgeInsets.all(EchappeeSpacing.cardLoose),
        decoration: BoxDecoration(
          color: EchappeeColors.surface,
          borderRadius: EchappeeRadius.xlAll,
          border: Border.all(color: EchappeeColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(vehicle.label, style: EchappeeTypography.h3),
            const SizedBox(height: EchappeeSpacing.s4),
            Text(_caption(vehicle), style: EchappeeTypography.caption),
            const SizedBox(height: EchappeeSpacing.s16),
            EchappeeTextField(
              controller: _consController,
              label: vehicle.unit == Vehicle.unitKwh ? 'kWh/100 km' : 'l/100 km',
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ligne de résultat : « RENAULT CLIO · 1.0 TCe 90 » + métadonnées.
class _VehicleRow extends StatelessWidget {
  const _VehicleRow({required this.vehicle, required this.onTap});

  final Vehicle vehicle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: EchappeeRadius.mdAll,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: EchappeeSpacing.s8,
          vertical: EchappeeSpacing.s12,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(vehicle.label, style: EchappeeTypography.body),
            const SizedBox(height: EchappeeSpacing.s4),
            Text(_caption(vehicle), style: EchappeeTypography.caption),
          ],
        ),
      ),
    );
  }
}

/// « essence · 5,0 l/100 · 114 g CO₂ ».
String _caption(Vehicle vehicle) {
  final unit = vehicle.unit == Vehicle.unitKwh ? 'kWh/100' : 'l/100';
  final co2 = vehicle.co2;
  return [
    _fuelLabel(vehicle.fuel),
    '${_frNum(vehicle.consL100)} $unit',
    if (co2 != null) '$co2 g CO₂',
  ].join(' · ');
}

String _fuelLabel(String fuel) => switch (fuel) {
      'electrique' => 'électrique',
      'hybride-rechargeable' => 'hybride rechargeable',
      _ => fuel,
    };

String _frNum(double value) =>
    value.toStringAsFixed(1).replaceAll('.', ',');
