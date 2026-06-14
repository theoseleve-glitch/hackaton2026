import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../features/poi/data/fuel_station_service.dart';
import '../../../features/routing/presentation/route_planner_controller.dart';
import '../../../shared/models/models.dart';
import '../design_system/design_system.dart';
import 'echappee_page.dart';

/// « Services sur la route » : carburant le moins cher (open data prix FR,
/// gratuit), bornes de recharge VE et parkings (OSM) le long du trajet ou
/// autour de la destination. Dégrade en liste vide si la source ne répond pas.
class EchappeeServicesScreen extends ConsumerStatefulWidget {
  const EchappeeServicesScreen({super.key});

  @override
  ConsumerState<EchappeeServicesScreen> createState() =>
      _EchappeeServicesScreenState();
}

enum _Tab { fuel, charging, parking }

class _EchappeeServicesScreenState
    extends ConsumerState<EchappeeServicesScreen> {
  _Tab _tab = _Tab.fuel;
  String _fuelType = 'Gazole';

  Future<List<FuelStation>>? _fuel;
  Future<List<ChargingStation>>? _charging;
  Future<List<ParkingLot>>? _parking;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  GeoPoint? get _center {
    final planner = ref.read(routePlannerProvider);
    return planner.destination ?? planner.origin;
  }

  List<GeoPoint> get _corridor {
    final planner = ref.read(routePlannerProvider);
    final option = planner.selectedOption ?? planner.options.valueOrNull?.firstOrNull;
    if (option == null) return const [];
    return ref.read(routingServiceProvider).getRoutePolyline(option);
  }

  void _load() {
    final center = _center;
    if (center == null) return;
    final service = ref.read(fuelStationServiceProvider);
    setState(() {
      _fuel = service.stationsNear(center, radiusMeters: 8000);
      _charging = service.chargingNear(center, radiusMeters: 8000);
      _parking = service.parkingNear(center, radiusMeters: 3000);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_center == null) {
      return const EchappeePage(
        child: Scaffold(
          body: EchappeeEmptyState(
            title: 'Choisis d\'abord une destination.',
            message: 'Les services s\'affichent autour de ton arrivée.',
            icon: Icons.local_gas_station_outlined,
          ),
        ),
      );
    }
    return EchappeePage(
      child: Scaffold(
        appBar: AppBar(title: const Text('Services sur la route')),
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.all(EchappeeSpacing.screen),
              child: SegmentedButton<_Tab>(
                segments: const [
                  ButtonSegment(
                      value: _Tab.fuel,
                      label: Text('Carburant'),
                      icon: Icon(Icons.local_gas_station)),
                  ButtonSegment(
                      value: _Tab.charging,
                      label: Text('Recharge'),
                      icon: Icon(Icons.ev_station)),
                  ButtonSegment(
                      value: _Tab.parking,
                      label: Text('Parking'),
                      icon: Icon(Icons.local_parking)),
                ],
                selected: {_tab},
                onSelectionChanged: (s) => setState(() => _tab = s.first),
              ),
            ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() => switch (_tab) {
        _Tab.fuel => _fuelBody(),
        _Tab.charging => _chargingBody(),
        _Tab.parking => _parkingBody(),
      };

  Widget _fuelBody() {
    return FutureBuilder<List<FuelStation>>(
      future: _fuel,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: EchappeeLoadingState());
        }
        final stations = snap.data ?? const [];
        if (stations.isEmpty) {
          return const _Empty('Pas de station trouvée par ici.');
        }
        // Types de carburant disponibles dans les stations remontées.
        final types = <String>{for (final s in stations) ...s.prices.keys}.toList()
          ..sort();
        if (!types.contains(_fuelType) && types.isNotEmpty) {
          _fuelType = types.contains('Gazole') ? 'Gazole' : types.first;
        }
        final cheapest = FuelStationService.cheapestAlong(
            stations, _corridor.isEmpty ? [_center!] : _corridor, _fuelType);
        final sorted = [...stations]..sort((a, b) =>
            (a.cheapest(_fuelType) ?? 1e9).compareTo(b.cheapest(_fuelType) ?? 1e9));
        return ListView(
          padding: const EdgeInsets.fromLTRB(EchappeeSpacing.screen, 0,
              EchappeeSpacing.screen, EchappeeSpacing.screen),
          children: [
            if (types.isNotEmpty)
              Wrap(
                spacing: EchappeeSpacing.s8,
                children: [
                  for (final t in types)
                    ChoiceChip(
                      label: Text(t),
                      selected: t == _fuelType,
                      onSelected: (_) => setState(() => _fuelType = t),
                    ),
                ],
              ),
            const SizedBox(height: EchappeeSpacing.s12),
            if (cheapest != null && cheapest.cheapest(_fuelType) != null)
              Container(
                margin: const EdgeInsets.only(bottom: EchappeeSpacing.s12),
                padding: const EdgeInsets.all(EchappeeSpacing.card),
                decoration: const BoxDecoration(
                  color: EchappeeColors.primaryTint,
                  borderRadius: EchappeeRadius.lgAll,
                ),
                child: Row(
                  children: [
                    const Icon(Icons.savings_outlined,
                        color: EchappeeColors.primary),
                    const SizedBox(width: EchappeeSpacing.s12),
                    Expanded(
                      child: Text(
                        'Le moins cher sur ta route : ${cheapest.name} — '
                        '${cheapest.cheapest(_fuelType)!.toStringAsFixed(3)} €/L',
                        style: EchappeeTypography.body
                            .copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            for (final s in sorted)
              _Tile(
                icon: Icons.local_gas_station,
                title: s.name,
                subtitle: s.brand,
                trailing: s.cheapest(_fuelType) == null
                    ? '—'
                    : '${s.cheapest(_fuelType)!.toStringAsFixed(3)} €',
              ),
          ],
        );
      },
    );
  }

  Widget _chargingBody() {
    return FutureBuilder<List<ChargingStation>>(
      future: _charging,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: EchappeeLoadingState());
        }
        final stations = snap.data ?? const [];
        if (stations.isEmpty) {
          return const _Empty('Aucune borne de recharge trouvée par ici.');
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(EchappeeSpacing.screen, 0,
              EchappeeSpacing.screen, EchappeeSpacing.screen),
          children: [
            for (final s in stations)
              _Tile(
                icon: Icons.ev_station,
                title: s.name,
                subtitle: s.points == null ? null : '${s.points} point(s)',
                trailing: s.powerKw == null
                    ? null
                    : '${s.powerKw!.round()} kW',
              ),
          ],
        );
      },
    );
  }

  Widget _parkingBody() {
    return FutureBuilder<List<ParkingLot>>(
      future: _parking,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: EchappeeLoadingState());
        }
        final lots = snap.data ?? const [];
        if (lots.isEmpty) {
          return const _Empty('Aucun parking trouvé près de l\'arrivée.');
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(EchappeeSpacing.screen, 0,
              EchappeeSpacing.screen, EchappeeSpacing.screen),
          children: [
            for (final p in lots)
              _Tile(
                icon: Icons.local_parking,
                title: p.name,
                trailing:
                    p.capacity == null ? null : '${p.capacity} places',
              ),
          ],
        );
      },
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile(
      {required this.icon, required this.title, this.subtitle, this.trailing});

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: EchappeeSpacing.s8),
      child: ListTile(
        leading: Icon(icon, color: EchappeeColors.primary),
        title: Text(title, style: EchappeeTypography.body),
        subtitle: subtitle == null ? null : Text(subtitle!),
        trailing: trailing == null
            ? null
            : Text(trailing!,
                style: EchappeeTypography.h3
                    .copyWith(color: EchappeeColors.primary)),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.message);
  final String message;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(EchappeeSpacing.screen),
          child: Text(message,
              textAlign: TextAlign.center,
              style: EchappeeTypography.body
                  .copyWith(color: EchappeeColors.textSecondary)),
        ),
      );
}
